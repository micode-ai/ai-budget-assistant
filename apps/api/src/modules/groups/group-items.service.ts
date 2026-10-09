import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { GroupsService } from './groups.service';
import { GroupBudgetMirrorService } from './group-budget-mirror.service';
import {
  applyManagedClaims,
  applyOwnClaims,
  canManageClaims,
  claimWindowEnd,
  computeItemizedShares,
  isClaimsOpen,
  membersWithMovedShares,
  myLineParts,
  sameShares,
  validateClaimShares,
  type ClaimRow,
  type ItemRow,
  type ManagedClaimEntry,
} from './group-items';
import type { GroupExpenseItemsView } from '@budget/shared-types';

/**
 * Claims on the lines of an itemised group expense (ABA-655). Ledger writes stay ledger writes:
 * every claim change re-derives the expense's shares from ALL its claims and, when they moved,
 * rewrites them and bumps `ledgerVersion`, in ONE transaction that first takes the expense row's
 * lock (a no-op update, the `withMemberSlot` pattern), so two concurrent claimers serialise.
 *
 * THE LOCK RULE. While `claimsOpenUntil` is in the future every live member sets their OWN claims
 * (app or guest page). After it, or once the payer/creator/owner closes it, a self-claim is 409
 * `CLAIMS_CLOSED`; the payer, creator and owner can still set anyone's claims and shares and reopen
 * the window for another 7 days. A claim change NEVER touches a settlement: a settlement is money
 * that moved, and a share that shifts after it simply reopens a small balance.
 */

export const GUEST_OPEN_RECEIPTS = 5;

/** ABA-655 review M1: claim changes per member per expense per hour (app and guest alike). */
export const CLAIM_CHANGE_LIMIT = 10;
export const CLAIM_CHANGE_WINDOW_MS = 60 * 60 * 1000;

/** What the guest page renders for one open itemised expense (entry-currency lines). */
export interface GuestClaimExpense {
  id: string;
  description: string;
  /** Group currency. */
  amount: number;
  itemCurrency: string;
  paidByMemberId: string;
  claimsOpenUntil: string;
  /** The viewer's claims-only total, entry currency. */
  myTotal: number;
  lines: {
    id: string;
    name: string;
    /** Net price (gross minus the line discount), entry currency. */
    price: number;
    claimants: number;
    /** Someone set explicit shares on this line: the guest form leaves it alone. */
    handSplit: boolean;
    mine: boolean;
    myPart: number;
  }[];
}

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

@Injectable()
export class GroupItemsService {
  private readonly logger = new Logger(GroupItemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly cache: CacheService,
    // ABA-660: a claim change that moves shares re-syncs the budget mirror. Optional for older specs.
    @Optional() private readonly mirror?: GroupBudgetMirrorService,
  ) {}

  /**
   * Per member, per expense hourly ceiling on claim changes, so one member cannot churn a receipt's
   * shares (and everyone's pushes) by toggling. Fails CLOSED: `incrementWindow` throws on a Redis
   * outage and that is refused, never waved through. Charged only after the actor resolved.
   */
  private async chargeClaimChange(expenseId: string, memberId: string): Promise<void> {
    let hits: number;
    try {
      hits = await this.cache.incrementWindow(`grp:claim:${expenseId}:${memberId}`, CLAIM_CHANGE_WINDOW_MS);
    } catch (e) {
      this.logger.warn(`claim ceiling unavailable: ${(e as Error).message}`);
      throw new HttpException({ code: 'CLAIMS_BUSY', message: 'Please try again in a moment' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (hits > CLAIM_CHANGE_LIMIT) {
      throw new HttpException(
        { code: 'CLAIMS_BUSY', message: 'Too many claim changes on this receipt, try again later' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * A removed member's claims are treated as unclaimed everywhere (shares, views, the guest page):
   * they are dropped from the loaded rows here, and the next write's delete + recreate prunes them
   * in storage. Without this a member removed after claiming would keep diluting other people's lines.
   */
  private async dropRemovedClaims(db: any, groupId: string, expenses: any[]): Promise<void> {
    const ids = new Set<string>();
    for (const e of expenses) for (const i of e.items ?? []) for (const c of i.claims ?? []) ids.add(c.memberId);
    if (!ids.size) return;
    const gone: { id: string }[] =
      (await db.expenseGroupMember.findMany({
        where: { groupId, id: { in: [...ids] }, removedAt: { not: null } },
        select: { id: true },
      })) ?? [];
    if (!gone.length) return;
    const removed = new Set(gone.map((m) => m.id));
    for (const e of expenses) for (const i of e.items ?? []) i.claims = (i.claims ?? []).filter((c: any) => !removed.has(c.memberId));
  }

  // ------------------------------------------------------------------ reads

  /** Re-scoped `{id, groupId}`: a foreign, deleted or non-itemised expense is one 404. */
  private async findItemized(db: any, groupId: string, expenseId: string) {
    const e = await db.groupExpense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null, itemized: true },
      include: {
        items: { orderBy: { position: 'asc' }, include: { claims: true } },
        shares: true,
      },
    });
    if (!e || e.itemized !== true) throw new NotFoundException('Expense not found');
    await this.dropRemovedClaims(db, groupId, [e]);
    return e;
  }

  private rows(e: any): { items: ItemRow[]; claims: ClaimRow[] } {
    const items: ItemRow[] = (e.items ?? []).map((i: any) => ({
      id: i.id,
      totalPrice: num(i.totalPrice),
      lineDiscount: numOrNull(i.lineDiscount),
    }));
    const claims: ClaimRow[] = (e.items ?? []).flatMap((i: any) =>
      (i.claims ?? []).map((c: any) => ({ itemId: i.id, memberId: c.memberId, shareBp: c.shareBp ?? null })),
    );
    return { items, claims };
  }

  private billTotal(e: any): number {
    return e.originalAmount == null ? num(e.amount) : num(e.originalAmount);
  }

  async getItems(groupId: string, memberId: string, expenseId: string): Promise<GroupExpenseItemsView> {
    const actor = await this.groups.resolveActor(groupId, memberId);
    const [e, group] = await Promise.all([
      this.findItemized(this.prisma, groupId, expenseId),
      this.prisma.expenseGroup.findUnique({ where: { id: groupId }, select: { currencyCode: true, ledgerVersion: true, status: true } }),
    ]);
    if (!group) throw new NotFoundException('Group not found');
    const { items, claims } = this.rows(e);
    const { parts } = myLineParts(items, claims, actor.id, this.billTotal(e), numOrNull(e.discountAmount));
    const open = isClaimsOpen(e);
    const manager = canManageClaims(actor, e);
    return {
      expenseId: e.id,
      description: e.description,
      groupCurrency: group.currencyCode,
      itemCurrency: e.originalCurrency ?? group.currencyCode,
      amount: num(e.amount),
      originalAmount: numOrNull(e.originalAmount),
      discountAmount: numOrNull(e.discountAmount),
      paidByMemberId: e.paidByMemberId,
      createdByMemberId: e.createdByMemberId,
      claimsOpenUntil: e.claimsOpenUntil ? new Date(e.claimsOpenUntil).toISOString() : null,
      claimsOpen: open && group.status === 'active',
      canManageClaims: manager,
      canClaim: group.status === 'active' && (open || manager),
      items: (e.items ?? []).map((i: any) => ({
        id: i.id,
        name: i.name,
        totalPrice: num(i.totalPrice),
        lineDiscount: numOrNull(i.lineDiscount),
        position: i.position,
        claims: (i.claims ?? []).map((c: any) => ({ memberId: c.memberId, shareBp: c.shareBp ?? null })),
        myPart: parts.get(i.id) ?? 0,
      })),
      shares: (e.shares ?? []).map((s: any) => ({
        memberId: s.memberId,
        shareValue: numOrNull(s.shareValue),
        shareAmount: num(s.shareAmount),
      })),
      ledgerVersion: group.ledgerVersion,
    };
  }

  /**
   * The guest page's open receipts: at most GUEST_OPEN_RECEIPTS, newest first, window still open.
   * Filtered on `itemized` and the window again in code, belt and braces over the query.
   */
  async listOpenForGuest(groupId: string, viewerMemberId: string | null): Promise<GuestClaimExpense[]> {
    const now = new Date();
    const rows: any[] = await this.prisma.groupExpense.findMany({
      where: { groupId, deletedAt: null, itemized: true, claimsOpenUntil: { gt: now } },
      include: { items: { orderBy: { position: 'asc' }, include: { claims: true } } },
      orderBy: { createdAt: 'desc' },
      take: GUEST_OPEN_RECEIPTS,
    });
    await this.dropRemovedClaims(this.prisma, groupId, rows);
    const group = await this.prisma.expenseGroup.findUnique({ where: { id: groupId }, select: { currencyCode: true } });
    return rows
      .filter((e) => e.itemized === true && !e.deletedAt && isClaimsOpen(e, now))
      .slice(0, GUEST_OPEN_RECEIPTS)
      .map((e) => {
        const { items, claims } = this.rows(e);
        const mine = viewerMemberId
          ? myLineParts(items, claims, viewerMemberId, this.billTotal(e), numOrNull(e.discountAmount))
          : { parts: new Map<string, number>(), total: 0 };
        return {
          id: e.id,
          description: e.description,
          amount: num(e.amount),
          itemCurrency: e.originalCurrency ?? group?.currencyCode ?? '',
          paidByMemberId: e.paidByMemberId,
          claimsOpenUntil: new Date(e.claimsOpenUntil).toISOString(),
          myTotal: mine.total,
          lines: (e.items ?? []).map((i: any) => {
            const cs = (i.claims ?? []) as any[];
            return {
              id: i.id,
              name: i.name,
              price: Math.max(0, Math.round((num(i.totalPrice) - (numOrNull(i.lineDiscount) ?? 0)) * 100) / 100),
              claimants: cs.length,
              handSplit: cs.some((c) => c.shareBp !== null && c.shareBp !== undefined),
              mine: !!viewerMemberId && cs.some((c) => c.memberId === viewerMemberId),
              myPart: mine.parts.get(i.id) ?? 0,
            };
          }),
        };
      });
  }

  // ------------------------------------------------------------------ writes

  /**
   * Runs one claim change under the expense row's lock: re-reads the expense INSIDE the transaction,
   * lets `plan` check the lock rule and return the new claim set, persists it (delete + recreate),
   * re-derives the shares and, only when they moved, rewrites them and bumps `ledgerVersion`.
   * Settlements are never read or written here.
   */
  private async mutate(
    groupId: string,
    actorMemberId: string,
    expenseId: string,
    plan: (ctx: { expense: any; claims: ClaimRow[]; itemIds: Set<string>; actor: { id: string; isOwner: boolean } }) => ClaimRow[],
  ): Promise<GroupExpenseItemsView> {
    const actor = await this.groups.resolveActor(groupId, actorMemberId);
    await this.findItemized(this.prisma, groupId, expenseId); // 404 before any write
    await this.chargeClaimChange(expenseId, actor.id);

    const moved = await this.prisma.$transaction(async (tx: any) => {
      // ABA-657 review H1: the group row's lock first (shared with the member merge and every other
      // ledger write, also re-checks the group is active), then the expense row's.
      await this.groups.lockGroup(tx, groupId, false);
      // The lock: a no-op UPDATE on the expense row. A second claimer waits here until we commit.
      await tx.groupExpense.update({ where: { id: expenseId }, data: { updatedAt: new Date() } });
      // Liveness re-checked under the lock: a member removed while we waited cannot claim.
      const stillLive = await tx.expenseGroupMember.findFirst({
        where: { id: actor.id, groupId, removedAt: null },
        select: { id: true },
      });
      if (!stillLive) throw new NotFoundException('Member not found');
      const expense = await this.findItemized(tx, groupId, expenseId);
      const { items, claims } = this.rows(expense);
      const itemIds = new Set(items.map((i) => i.id));
      const nextClaims = plan({ expense, claims, itemIds, actor });

      const bad = validateClaimShares(nextClaims);
      if (bad) {
        throw new BadRequestException({ code: 'CLAIM_SHARE_INVALID', reason: bad, message: 'Line shares are invalid' });
      }
      // New claimants must be live members of THIS group (the actor already is).
      const claimants = [...new Set(nextClaims.map((c) => c.memberId))];
      const known = new Set(claims.map((c) => c.memberId));
      const fresh = claimants.filter((id) => !known.has(id) && id !== actor.id);
      if (fresh.length) {
        const live = await tx.expenseGroupMember.findMany({
          where: { id: { in: fresh }, groupId, removedAt: null },
          select: { id: true },
        });
        if (live.length !== fresh.length) throw new NotFoundException('Member not found');
      }

      await tx.groupItemClaim.deleteMany({ where: { itemId: { in: [...itemIds] } } });
      if (nextClaims.length) {
        await tx.groupItemClaim.createMany({
          data: nextClaims.map((c) => ({ itemId: c.itemId, memberId: c.memberId, shareBp: c.shareBp })),
        });
      }

      const before = (expense.shares ?? []).map((s: any) => ({ memberId: s.memberId, shareAmount: num(s.shareAmount) }));
      const after = computeItemizedShares(
        {
          amount: num(expense.amount),
          originalAmount: numOrNull(expense.originalAmount),
          discountAmount: numOrNull(expense.discountAmount),
          paidByMemberId: expense.paidByMemberId,
        },
        items,
        nextClaims,
      );
      if (sameShares(before, after)) return [] as string[];
      await tx.groupExpenseShare.deleteMany({ where: { groupExpenseId: expenseId } });
      await tx.groupExpenseShare.createMany({
        data: after.map((s) => ({
          groupExpenseId: expenseId,
          memberId: s.memberId,
          shareValue: s.shareValue,
          shareAmount: s.shareAmount,
        })),
      });
      await tx.expenseGroup.update({ where: { id: groupId }, data: { ledgerVersion: { increment: 1 } } });
      return membersWithMovedShares(before, after);
    });

    if (moved.length) {
      this.groups.notifyMembers(groupId, actor.id, moved);
      this.mirror?.afterLedgerWrite(groupId);
    }
    return this.getItems(groupId, actor.id, expenseId);
  }

  private closed(): ConflictException {
    return new ConflictException({ code: 'CLAIMS_CLOSED', message: 'This receipt is no longer open for claims' });
  }

  /**
   * The caller's own claims. `checked` is the full set they claim among `scope` (default: every line
   * of the expense). App callers are strict (a line id that is not this expense's is 404); the guest
   * form intersects silently (a planted id is ignored). Refused with 409 CLAIMS_CLOSED once the
   * window has ended, unless the caller is the payer, creator or owner.
   */
  async setMyClaims(
    groupId: string,
    actorMemberId: string,
    expenseId: string,
    checked: string[],
    opts: { scope?: string[]; strict?: boolean; skipHandSplit?: boolean } = {},
  ): Promise<GroupExpenseItemsView> {
    return this.mutate(groupId, actorMemberId, expenseId, ({ expense, claims, itemIds, actor }) => {
      if (!isClaimsOpen(expense) && !canManageClaims(actor, expense)) throw this.closed();
      if (opts.strict !== false) {
        for (const id of [...checked, ...(opts.scope ?? [])]) {
          if (!itemIds.has(id)) throw new NotFoundException('Item not found');
        }
      }
      // The guest form never touches a hand-split line (any explicit bp), even if a crafted POST names it.
      const handSplit = new Set(claims.filter((c) => c.shareBp !== null).map((c) => c.itemId));
      const scope = (opts.scope ?? [...itemIds]).filter((id) => itemIds.has(id) && !(opts.skipHandSplit && handSplit.has(id)));
      return applyOwnClaims(claims, actor.id, scope, checked.filter((id) => itemIds.has(id)));
    });
  }

  /** Anyone's claims and shares: the payer, creator or owner only, at any time (active group). */
  async setClaims(
    groupId: string,
    actorMemberId: string,
    expenseId: string,
    entries: ManagedClaimEntry[],
  ): Promise<GroupExpenseItemsView> {
    const ids = entries.map((e) => e.memberId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate claim member');
    return this.mutate(groupId, actorMemberId, expenseId, ({ expense, claims, itemIds, actor }) => {
      if (!canManageClaims(actor, expense)) {
        throw new ForbiddenException('Only the payer, the creator or the owner can change other people’s claims');
      }
      for (const e of entries) {
        for (const id of e.itemIds) if (!itemIds.has(id)) throw new NotFoundException('Item not found');
        for (const [key, bp] of Object.entries(e.shareBp ?? {})) {
          if (typeof bp !== 'number') {
            throw new BadRequestException({ code: 'CLAIM_SHARE_INVALID', reason: 'bad_share', message: `Share of ${key} is invalid` });
          }
        }
      }
      try {
        return applyManagedClaims(claims, entries);
      } catch {
        throw new BadRequestException({
          code: 'CLAIM_SHARE_INVALID',
          reason: 'not_claimed',
          message: 'A share can only be set on a line that member claims',
        });
      }
    });
  }

  /**
   * Closes the window now, or reopens it for another 7 days. Payer, creator or owner. Writes no
   * ledger (no share moved), so no `ledgerVersion` bump; a reopen only lets members claim again.
   */
  async closeClaims(groupId: string, actorMemberId: string, expenseId: string, reopen: boolean): Promise<GroupExpenseItemsView> {
    const actor = await this.groups.resolveActor(groupId, actorMemberId);
    const e = await this.findItemized(this.prisma, groupId, expenseId);
    if (!canManageClaims(actor, e)) throw new ForbiddenException('Only the payer, the creator or the owner can close claims');
    const now = new Date();
    // Under the expense row's lock like every other claims write, so a close or reopen cannot land
    // in the middle of a claim change that already checked the window.
    await this.prisma.$transaction(async (tx: any) => {
      await tx.groupExpense.update({ where: { id: e.id }, data: { updatedAt: new Date() } });
      await tx.groupExpense.updateMany({
        where: { id: e.id, groupId, itemized: true, deletedAt: null },
        data: { claimsOpenUntil: reopen ? claimWindowEnd(now) : now },
      });
    });
    return this.getItems(groupId, actor.id, e.id);
  }
}
