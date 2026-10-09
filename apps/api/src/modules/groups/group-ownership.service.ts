import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';

/**
 * Group ownership (ABA-650): manual transfer, succession when the owner leaves the platform, orphan
 * adoption, and the "Former member" rename on a hard account delete.
 *
 * Kept apart from GroupsService so UsersService and AdminService can depend on it without pulling
 * in the whole ledger, and so GroupsService itself does not grow again.
 */

export const MAX_GROUPS_OWNED = 20;
/**
 * The neutral name a hard-deleted user's member rows take (user decision 2026-10-09). Stored text,
 * so it is the same in every language; the ledger history stays readable without the person's name.
 */
export const FORMER_MEMBER_NAME = 'Former member';

const nameKeyOf = (name: string) => name.trim().toLowerCase();

type Db = Pick<PrismaService, 'expenseGroup' | 'expenseGroupMember' | 'groupMemberEvent' | '$transaction'>;

export type AdoptResult = 'adopted' | 'has_owner' | 'limit' | 'not_eligible';

/**
 * Whether a member may adopt a group orphaned at `orphanedAt` (ABA-650 review). Only someone who was
 * ALREADY a live app-user member before the group lost its owner: a person who joins, rejoins, claims
 * a placeholder or links a guest row through the link AFTER that must not be able to take a group
 * over. Every one of those paths stamps `createdAt`, `claimedAt` or `linkedAt` (a rejoin restamps
 * `claimedAt`), so the latest of the three must predate the orphaning. No `orphanedAt` = not eligible.
 */
export function isAdoptionEligible(
  m: { userId: string | null; removedAt: Date | null; createdAt: Date; claimedAt?: Date | null; linkedAt?: Date | null },
  orphanedAt: Date | null | undefined,
): boolean {
  if (!orphanedAt || !m.userId || m.removedAt) return false;
  const since = Math.max(m.createdAt.getTime(), m.claimedAt?.getTime() ?? 0, m.linkedAt?.getTime() ?? 0);
  return since < orphanedAt.getTime();
}

/**
 * Makes `userId` the owner of an ORPHANED group, only via the explicit adopt route and only for a
 * member who was live before the orphaning. Atomic: `updateMany where ownerUserId: null`, so two
 * members adopting at once cannot both win, and a group that has an owner is never taken over.
 * Respects the owned-groups cap.
 */
export async function adoptIfOrphaned(
  db: Db,
  args: { groupId: string; userId: string; memberId: string },
): Promise<AdoptResult> {
  const owned = await db.expenseGroup.count({ where: { ownerUserId: args.userId, status: 'active' } });
  if (owned >= MAX_GROUPS_OWNED) return 'limit';
  return db.$transaction(async (tx: any) => {
    const group = await tx.expenseGroup.findUnique({
      where: { id: args.groupId },
      select: { ownerUserId: true, orphanedAt: true },
    });
    if (!group || group.ownerUserId !== null) return 'has_owner' as const;
    const me = await tx.expenseGroupMember.findFirst({
      where: { id: args.memberId, groupId: args.groupId },
      select: { userId: true, displayName: true, removedAt: true, createdAt: true, claimedAt: true, linkedAt: true },
    });
    if (!me || me.userId !== args.userId || !isAdoptionEligible(me, group.orphanedAt)) return 'not_eligible' as const;
    const res = await tx.expenseGroup.updateMany({
      where: { id: args.groupId, ownerUserId: null },
      data: { ownerUserId: args.userId, orphanedAt: null },
    });
    if (res.count === 0) return 'has_owner' as const;
    await tx.groupMemberEvent.create({
      data: {
        groupId: args.groupId,
        kind: 'owner_transferred',
        actorMemberId: args.memberId,
        subjectMemberId: args.memberId,
        targetMemberId: args.memberId,
        subjectName: me.displayName ?? '',
      },
    });
    return 'adopted' as const;
  });
}

type Notify = { groupId: string; userId: string };

@Injectable()
export class GroupOwnershipService {
  private readonly logger = new Logger(GroupOwnershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private notifyNewOwner(groupId: string, userId: string): void {
    void this.prisma.expenseGroup
      .findUnique({ where: { id: groupId }, select: { name: true } })
      .then((g: { name: string } | null) =>
        g
          ? this.notifications.sendToUser(
              userId,
              (lang: string) => ni18n.groupOwnerTitle(lang, g.name),
              (lang: string) => ni18n.groupOwnerBody(lang),
              { groupId },
              'group_activity',
            )
          : undefined,
      )
      .catch(logFireAndForget(this.logger, 'GroupOwnershipService.notifyNewOwner'));
  }

  /**
   * The owner hands the group to another member. The caller is guard-derived (`GroupOwnerGuard`), the
   * target id is re-scoped to the group. The write is a CAS on the CURRENT owner, so two concurrent
   * transfers (or a transfer racing a departure) cannot both apply.
   */
  async transfer(
    groupId: string,
    actor: { memberId: string; userId: string },
    targetMemberId: string,
  ): Promise<void> {
    const invalid = () =>
      new BadRequestException({
        code: 'OWNER_TARGET_INVALID',
        message: 'Only another member who uses the app can become the owner',
      });
    if (targetMemberId === actor.memberId) throw invalid();
    const target = await this.prisma.expenseGroupMember.findFirst({
      where: { id: targetMemberId, groupId, removedAt: null },
      select: { id: true, userId: true, user: { select: { isActive: true } } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (!target.userId || !target.user?.isActive || target.userId === actor.userId) throw invalid();

    const owned = await this.prisma.expenseGroup.count({ where: { ownerUserId: target.userId, status: 'active' } });
    if (owned >= MAX_GROUPS_OWNED) {
      throw new ConflictException({ code: 'OWNER_LIMIT', message: `They already own ${MAX_GROUPS_OWNED} active groups` });
    }
    const me = await this.prisma.expenseGroupMember.findFirst({
      where: { id: actor.memberId, groupId },
      select: { displayName: true },
    });

    await this.prisma.$transaction(async (tx: any) => {
      const cas = await tx.expenseGroup.updateMany({
        where: { id: groupId, ownerUserId: actor.userId },
        data: { ownerUserId: target.userId },
      });
      if (cas.count === 0) {
        throw new ConflictException({ code: 'OWNER_CHANGED', message: 'The owner changed, refresh and retry' });
      }
      await tx.groupMemberEvent.create({
        data: {
          groupId,
          kind: 'owner_transferred',
          actorMemberId: actor.memberId,
          subjectMemberId: actor.memberId,
          targetMemberId: target.id,
          subjectName: me?.displayName ?? '',
        },
      });
    });
    this.notifyNewOwner(groupId, target.userId);
  }

  /** `POST /groups/:groupId/adopt`: a live app-user member takes over an orphaned group. */
  async adopt(groupId: string, memberId: string, userId: string): Promise<void> {
    const res = await adoptIfOrphaned(this.prisma, { groupId, userId, memberId });
    if (res === 'limit') {
      throw new ConflictException({ code: 'OWNER_LIMIT', message: `You already own ${MAX_GROUPS_OWNED} active groups` });
    }
    if (res === 'not_eligible') {
      throw new ForbiddenException({
        code: 'ADOPT_NOT_ELIGIBLE',
        message: 'Only a member who was in the group before it lost its owner can adopt it',
      });
    }
    if (res === 'has_owner') {
      throw new ConflictException({ code: 'GROUP_HAS_OWNER', message: 'This group already has an owner' });
    }
  }

  /**
   * The account is going away or being suspended. In ONE transaction: owned groups are handed on
   * (see `departure`), optionally the user's member rows are anonymized (`anonymize`, for a self
   * delete or an admin hard delete, never for a suspension), and then `then(tx)` runs the actual
   * account change. Any failure rolls all of it back, so nothing is left half-done. Pushes to new
   * owners go out only after the commit.
   */
  async leavePlatform<T>(userId: string, opts: { anonymize: boolean }, then: (tx: any) => Promise<T>): Promise<T> {
    const notify: Notify[] = [];
    const result = await this.prisma.$transaction(
      async (tx: any) => {
        await this.departure(userId, tx, notify);
        if (opts.anonymize) await this.anonymize(userId, tx);
        return then(tx);
      },
      { timeout: 30000 },
    );
    for (const n of notify) this.notifyNewOwner(n.groupId, n.userId);
    return result;
  }

  /** Departure on its own (no account change), atomic across the user's groups. */
  async handleOwnerDeparture(userId: string): Promise<{ transferred: number; orphaned: number }> {
    const notify: Notify[] = [];
    const out = await this.prisma.$transaction((tx: any) => this.departure(userId, tx, notify), { timeout: 30000 });
    for (const n of notify) this.notifyNewOwner(n.groupId, n.userId);
    return out;
  }

  /**
   * Each owned group passes to the earliest-joined live member whose account is active; with nobody
   * eligible it becomes orphaned (ownerUserId NULL, `orphanedAt` stamped), never deleted. Runs on the
   * caller's transaction client.
   */
  private async departure(userId: string, db: any, notify: Notify[]): Promise<{ transferred: number; orphaned: number }> {
    const groups = await db.expenseGroup.findMany({ where: { ownerUserId: userId }, select: { id: true } });
    let transferred = 0;
    let orphaned = 0;
    for (const g of groups as { id: string }[]) {
      const successor = await db.expenseGroupMember.findFirst({
        where: { groupId: g.id, removedAt: null, userId: { not: userId }, user: { isActive: true } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, userId: true },
      });
      const leaving = await db.expenseGroupMember.findFirst({
        where: { groupId: g.id, userId },
        select: { id: true, displayName: true },
      });
      const nextOwner = successor?.userId ?? null;
      // CAS on the departing owner: a transfer that landed first wins, and this group is skipped.
      const cas = await db.expenseGroup.updateMany({
        where: { id: g.id, ownerUserId: userId },
        data: { ownerUserId: nextOwner, orphanedAt: nextOwner ? null : new Date() },
      });
      if (cas.count === 0) continue;
      if (leaving) {
        await db.groupMemberEvent.create({
          data: {
            groupId: g.id,
            kind: 'owner_transferred',
            actorMemberId: null,
            subjectMemberId: leaving.id,
            targetMemberId: successor?.id ?? null,
            subjectName: leaving.displayName,
          },
        });
      }
      if (nextOwner) {
        transferred++;
        notify.push({ groupId: g.id, userId: nextOwner });
      } else {
        orphaned++;
      }
    }
    if (groups.length > 0) {
      this.logger.log(`owner departure: ${transferred} group(s) handed on, ${orphaned} orphaned`);
    }
    return { transferred, orphaned };
  }

  /**
   * Renames every member row of the user (removed ones included) to a neutral "Former member",
   * unique within each group, and clears its payment details and device claim. The row stays: it is
   * shared ledger history, and `userId` goes NULL through the FK when the user row is deleted. Event
   * snapshots of that member are renamed too, or the old name would survive in the activity. Runs on
   * the caller's transaction client; a name clash (P2002) aborts the whole account change, which the
   * user simply retries.
   */
  private async anonymize(userId: string, db: any): Promise<void> {
    const rows = await db.expenseGroupMember.findMany({ where: { userId }, select: { id: true, groupId: true } });
    for (const row of rows as { id: string; groupId: string }[]) {
      const taken = new Set(
        (
          await db.expenseGroupMember.findMany({
            where: { groupId: row.groupId, id: { not: row.id } },
            select: { nameKey: true },
          })
        ).map((m: { nameKey: string }) => m.nameKey),
      );
      let n = 1;
      const nextName = () => (n === 1 ? FORMER_MEMBER_NAME : `${FORMER_MEMBER_NAME} ${n}`);
      while (taken.has(nameKeyOf(nextName()))) n++;
      const name = nextName();
      await db.expenseGroupMember.update({
        where: { id: row.id },
        data: {
          displayName: name,
          nameKey: nameKeyOf(name),
          paymentMethod: null,
          paymentHandle: null,
          claimTokenHash: null,
          claimedAt: null,
        },
      });
      await db.groupMemberEvent.updateMany({
        where: { groupId: row.groupId, subjectMemberId: row.id },
        data: { subjectName: name },
      });
    }
  }
}
