import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { computeGroupLedger } from './group-ledger';
import {
  checkMergeBalances,
  mergeConsent,
  normaliseMergePair,
  planMemberMerge,
  type MergeMember,
  type MergeSplitType,
} from './group-merge';

/**
 * ABA-657: merge two members of a group without changing anyone's balance.
 *
 * One `$transaction` that FIRST bumps `ledgerVersion` (the group row's lock, so every other ledger
 * write serialises behind it and any open settle form goes stale), then re-scopes both ids under that
 * lock, applies the consent rule, re-points every ledger row of the absorbed member, soft-removes it
 * with `mergedIntoMemberId`, re-reads the ledger and ASSERTS that the pair's combined balance and every
 * other member's balance are unchanged. A broken assertion is a bug, not user input: it is logged and
 * the whole transaction rolls back with a 500.
 *
 * The event log (`GroupMemberEvent`) is deliberately NOT re-pointed: its member columns are plain ids
 * with no FK precisely so a merge never rewrites audit rows. The absorbed row stays (soft-removed), so
 * an old event still resolves to the name it had; the new `member_merged` row explains the rest.
 *
 * Depends on Prisma only, so GroupsService (the link-code self-merge) can inject it without a cycle.
 */

type Mode = { kind: 'app' } | { kind: 'link'; guestMemberId: string; claimTokenHash: string };

export interface MergeOutcome {
  fromMemberId: string;
  intoMemberId: string;
}

const num = (v: unknown) => Number(v);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class GroupMergeService {
  private readonly logger = new Logger(GroupMergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** POST /groups/:groupId/members/:memberId/merge. The consent rule is in `mergeConsent`. */
  merge(groupId: string, actorMemberId: string, memberId: string, intoMemberId: string): Promise<MergeOutcome> {
    return this.run(groupId, actorMemberId, memberId, intoMemberId, { kind: 'app' });
  }

  /**
   * The link-code self-merge: the caller's own app row absorbs the guest row the code was minted for.
   * Holding the code proves the guest cookie (the claim digest was checked by the caller); the JWT
   * proves the app row. The guest row is a CAS on the claim hash that was checked, so a reset or a
   * re-claim landing in between loses cleanly as 410.
   */
  mergeViaLinkCode(
    groupId: string,
    callerMemberId: string,
    guestMemberId: string,
    claimTokenHash: string,
  ): Promise<MergeOutcome> {
    return this.run(groupId, callerMemberId, guestMemberId, callerMemberId, {
      kind: 'link',
      guestMemberId,
      claimTokenHash,
    });
  }

  /** Net balance per member (live members padded at 0, removed strays kept), read through `db`. */
  private async ledgerNet(db: any, groupId: string): Promise<Map<string, number>> {
    const [members, expenses, settlements] = await Promise.all([
      db.expenseGroupMember.findMany({ where: { groupId, removedAt: null }, select: { id: true } }),
      db.groupExpense.findMany({
        where: { groupId, deletedAt: null },
        select: { id: true, paidByMemberId: true, amount: true, shares: { select: { memberId: true, shareAmount: true } } },
      }),
      db.groupSettlement.findMany({
        where: { groupId, voidedAt: null },
        select: { id: true, fromMemberId: true, toMemberId: true, amount: true },
      }),
    ]);
    const ledger = computeGroupLedger(
      members.map((m: any) => ({ id: m.id })),
      expenses.map((e: any) => ({
        id: e.id,
        paidByMemberId: e.paidByMemberId,
        amount: num(e.amount),
        shares: (e.shares ?? []).map((s: any) => ({ memberId: s.memberId, shareAmount: num(s.shareAmount) })),
      })),
      settlements.map((s: any) => ({ id: s.id, fromMemberId: s.fromMemberId, toMemberId: s.toMemberId, amount: num(s.amount) })),
    );
    return new Map(ledger.balances.map((b) => [b.memberId, b.netAmount]));
  }

  private async run(groupId: string, actorMemberId: string, aId: string, bId: string, mode: Mode): Promise<MergeOutcome> {
    const gone = () => new GoneException({ code: 'LINK_CODE_INVALID', message: 'This link code is invalid or has expired' });
    if (aId === bId) {
      throw new BadRequestException({ code: 'MERGE_SAME_MEMBER', message: 'Pick two different members' });
    }

    return this.prisma.$transaction(async (tx: any) => {
      // 1. The lock and the ledger write, first: concurrent expense/settle/claim writes wait here.
      const group = await tx.expenseGroup.update({
        where: { id: groupId },
        data: { ledgerVersion: { increment: 1 } },
        select: { id: true, ownerUserId: true, status: true },
      });
      if (group.status !== 'active') {
        throw new ForbiddenException({ code: 'GROUP_ARCHIVED', message: 'This group is archived and read-only' });
      }

      // 2. Re-scoped under the lock: live, this group, distinct.
      const rows: (MergeMember & { displayName: string })[] = await tx.expenseGroupMember.findMany({
        where: { id: { in: [...new Set([aId, bId, actorMemberId])] }, groupId, removedAt: null },
        select: { id: true, userId: true, claimTokenHash: true, displayName: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const actorRow = byId.get(actorMemberId);
      const a = byId.get(aId);
      const b = byId.get(bId);
      if (!actorRow) throw new NotFoundException('Group not found');
      if (!a || !b) {
        if (mode.kind === 'link') throw gone();
        throw new NotFoundException('Member not found');
      }
      const pair = normaliseMergePair(a, b);
      if (!pair.ok) {
        if (pair.reason === 'same_member') {
          throw new BadRequestException({ code: 'MERGE_SAME_MEMBER', message: 'Pick two different members' });
        }
        throw new ConflictException({ code: 'BOTH_APP_USERS', message: 'Two members who both use the app cannot be merged' });
      }
      const from = pair.from as MergeMember & { displayName: string };
      const into = pair.into as MergeMember & { displayName: string };

      // 3. Consent.
      if (mode.kind === 'link') {
        if (from.id !== mode.guestMemberId || into.id !== actorMemberId || from.claimTokenHash !== mode.claimTokenHash) {
          throw gone();
        }
      } else {
        const isOwner = !!actorRow.userId && actorRow.userId === group.ownerUserId;
        if (!mergeConsent({ id: actorRow.id, isOwner }, from, into)) {
          throw new ForbiddenException({
            code: 'MERGE_NOT_ALLOWED',
            message: 'Only the person who keeps the merged balance can merge these members',
          });
        }
      }

      // 4. Snapshot.
      const before = await this.ledgerNet(tx, groupId);

      // 5. What the plan needs: every expense `from` has a share on (deleted ones too: the unique key
      // applies to them as well), every claim on a line `from` claims, every settlement of `from`.
      const fromShares: { groupExpenseId: string }[] = await tx.groupExpenseShare.findMany({
        // `from` is re-scoped to this group, so its rows are this group's rows.
        where: { memberId: from.id },
        select: { groupExpenseId: true },
      });
      const expenseIds = [...new Set(fromShares.map((s) => s.groupExpenseId))];
      const expenses: any[] = expenseIds.length
        ? await tx.groupExpense.findMany({
            where: { groupId, id: { in: expenseIds } },
            select: { id: true, splitType: true, shares: { select: { id: true, memberId: true, shareValue: true, shareAmount: true } } },
          })
        : [];
      const fromClaims: { itemId: string }[] = await tx.groupItemClaim.findMany({
        where: { memberId: from.id },
        select: { itemId: true },
      });
      const itemIds = [...new Set(fromClaims.map((c) => c.itemId))];
      const claims: any[] = itemIds.length
        ? await tx.groupItemClaim.findMany({
            where: { itemId: { in: itemIds } },
            select: { id: true, itemId: true, memberId: true, shareBp: true },
          })
        : [];
      const claimantIds = [...new Set(claims.map((c) => c.memberId))];
      const removedClaimants: { id: string }[] = claimantIds.length
        ? await tx.expenseGroupMember.findMany({
            where: { groupId, id: { in: claimantIds }, removedAt: { not: null } },
            select: { id: true },
          })
        : [];
      const settlements: any[] = await tx.groupSettlement.findMany({
        where: { groupId, OR: [{ fromMemberId: from.id }, { toMemberId: from.id }] },
        select: { id: true, fromMemberId: true, toMemberId: true, voidedAt: true },
      });

      const plan = planMemberMerge({
        fromId: from.id,
        intoId: into.id,
        expenses: expenses.map((e) => ({
          id: e.id,
          splitType: e.splitType as MergeSplitType,
          shares: (e.shares ?? []).map((s: any) => ({
            id: s.id,
            memberId: s.memberId,
            shareValue: numOrNull(s.shareValue),
            shareAmount: num(s.shareAmount),
          })),
        })),
        claims: claims.map((c) => ({ id: c.id, itemId: c.itemId, memberId: c.memberId, shareBp: c.shareBp ?? null })),
        settlements,
        removedMemberIds: removedClaimants.map((m) => m.id),
      });

      // 6. Writes. Rows that would collide on a unique key go first (delete, then the survivor's update).
      for (const c of plan.shareCombines) {
        await tx.groupExpenseShare.deleteMany({ where: { id: c.deleteId, groupExpenseId: c.expenseId } });
        await tx.groupExpenseShare.update({
          where: { id: c.keepId },
          data: { shareAmount: c.shareAmount, shareValue: c.shareValue },
        });
      }
      for (const ch of plan.splitTypeChanges) {
        await tx.groupExpense.update({ where: { id: ch.expenseId }, data: { splitType: ch.splitType } });
        for (const v of ch.values) await tx.groupExpenseShare.update({ where: { id: v.shareId }, data: { shareValue: v.value } });
      }
      if (plan.shareRepoints.length) {
        await tx.groupExpenseShare.updateMany({ where: { id: { in: plan.shareRepoints }, memberId: from.id }, data: { memberId: into.id } });
      }
      if (plan.claimDeletes.length) {
        await tx.groupItemClaim.deleteMany({ where: { id: { in: plan.claimDeletes }, memberId: from.id } });
      }
      for (const u of plan.claimUpdates) await tx.groupItemClaim.update({ where: { id: u.id }, data: { shareBp: u.shareBp } });
      if (plan.claimRepoints.length) {
        await tx.groupItemClaim.updateMany({ where: { id: { in: plan.claimRepoints }, memberId: from.id }, data: { memberId: into.id } });
      }
      const now = new Date();
      if (plan.settlementVoids.length) {
        // `into -> into` after the re-point: its effect on the pair summed to zero, so voiding it
        // keeps the pair's combined balance (spec D step 4).
        await tx.groupSettlement.updateMany({
          where: { id: { in: plan.settlementVoids }, groupId, voidedAt: null },
          data: { voidedAt: now, voidedByMemberId: actorRow.id },
        });
      }
      await tx.groupExpense.updateMany({ where: { groupId, paidByMemberId: from.id }, data: { paidByMemberId: into.id } });
      await tx.groupExpense.updateMany({ where: { groupId, createdByMemberId: from.id }, data: { createdByMemberId: into.id } });
      await tx.groupExpense.updateMany({ where: { groupId, deletedByMemberId: from.id }, data: { deletedByMemberId: into.id } });
      await tx.groupSettlement.updateMany({ where: { groupId, fromMemberId: from.id }, data: { fromMemberId: into.id } });
      await tx.groupSettlement.updateMany({ where: { groupId, toMemberId: from.id }, data: { toMemberId: into.id } });
      await tx.groupSettlement.updateMany({ where: { groupId, recordedByMemberId: from.id }, data: { recordedByMemberId: into.id } });
      await tx.groupSettlement.updateMany({ where: { groupId, voidedByMemberId: from.id }, data: { voidedByMemberId: into.id } });

      // 7. The absorbed row: soft-removed, its browser claim gone, pointing at the survivor. A CAS on
      // the state read under the lock (and, for the link path, on the claim the code was minted under).
      const absorbed = await tx.expenseGroupMember.updateMany({
        where: {
          id: from.id,
          groupId,
          userId: null,
          removedAt: null,
          ...(mode.kind === 'link' ? { claimTokenHash: mode.claimTokenHash } : {}),
        },
        data: {
          removedAt: now,
          claimTokenHash: null,
          claimedAt: null,
          paymentMethod: null,
          paymentHandle: null,
          mergedIntoMemberId: into.id,
        },
      });
      if (absorbed.count !== 1) {
        if (mode.kind === 'link') throw gone();
        throw new ConflictException({ code: 'MERGE_CHANGED', message: 'That member just changed, refresh and retry' });
      }

      // 8. The invariant, on balances re-read after every write above.
      const after = await this.ledgerNet(tx, groupId);
      const broken = checkMergeBalances(before, after, from.id, into.id);
      if (broken.length) {
        this.logger.error(
          `Member merge broke the balance invariant in group ${groupId} (${from.id} -> ${into.id}); rolled back. Members: ${broken.join(', ')}`,
        );
        throw new InternalServerErrorException({ code: 'MERGE_INVARIANT', message: 'The merge could not be completed' });
      }

      // 9. History: "Ania (guest) was merged into Ania", shown on the app and on the guest page.
      await tx.groupMemberEvent.create({
        data: {
          groupId,
          kind: 'member_merged',
          actorMemberId: actorRow.id,
          subjectMemberId: from.id,
          targetMemberId: into.id,
          subjectName: from.displayName,
        },
      });
      return { fromMemberId: from.id, intoMemberId: into.id };
    });
  }
}
