import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import * as ni18n from '../notifications/notification-i18n';
import {
  computeGroupLedger,
  validateSettlement,
  myShareThisMonth,
  resolveGroupShares,
  type LedgerExpense,
  type LedgerSettlement,
} from './group-ledger';
import { isAdoptionEligible, MAX_GROUPS_OWNED } from './group-ownership.service';
import { GroupMergeService } from './group-merge.service';
import { GroupBudgetMirrorService } from './group-budget-mirror.service';
import { GroupFxService, FX_MANUAL_RATE_FACTOR, MAX_SHARES } from './group-fx.service';
import { GroupSettlementsService } from './group-settlements.service';
import { GroupItemizedExpenseService } from './group-itemized-expense.service';
import type { GroupActor, GroupLedgerPorts } from './group-ledger-ports';
import { toMember, toExpense, toSettlement } from './group-mappers';
import { isP2002, toDateOnly } from './group-util';
import { isClaimsOpen } from './group-items';
import {
  AddGroupMemberDto,
  CreateGroupDto,
  CreateGroupExpenseDto,
  CreateGroupSettlementDto,
  GroupExpenseItemInputDto,
  GroupExpenseShareInputDto,
  JoinGroupDto,
  UpdateGroupDto,
  UpdateGroupExpenseDto,
  UpdateGroupMemberDto,
} from './dto';
import type {
  GroupActivityItem,
  GroupActivityPage,
  GroupDetail,
  GroupJoinPreview,
  GroupExpense,
  GroupFxPreview,
  GroupMember,
  GroupMemberEventKind,
  GroupMemberEventView,
  GroupSettlement,
  GroupSummary,
} from '@budget/shared-types';

export { MAX_GROUPS_OWNED };
/**
 * Event kinds the public guest page may show (ABA-650). `owner_transferred` and `claim_reset` would
 * reveal that a member is an app user or was reset, which the page must never show. Filtered in the
 * QUERY, so a private event never even reaches the guest service.
 */
export const GUEST_VISIBLE_EVENT_KINDS: GroupMemberEventKind[] = ['member_merged'];
/**
 * What a `grp:link:*` code carries about the claim it was minted under (ABA-651): a one-way digest
 * of the member's `claimTokenHash` at mint time. Redemption recomputes it from the member's CURRENT
 * hash, so a code dies with the claim that minted it: an owner's claim reset, "forget this device",
 * a rotation and a re-claim by someone else all change or clear that hash. Derived rather than the
 * hash itself, so Redis never holds the value `identify` looks a cookie up by.
 */
export const linkClaimBinding = (claimTokenHash: string) =>
  createHash('sha256').update(`grp-link-claim:${claimTokenHash}`).digest('hex');
export const MAX_MEMBERS = 50;
/**
 * ABA-657: a 409 ALREADY_MEMBER that offers a merge puts the (unspent) code back for this long, so
 * the follow-up `{code, merge: true}` can redeem it. The code was consumed by GETDEL but nothing was
 * bound, so it is as unused as before; the same 10 minutes as a freshly minted code.
 */
export const LINK_CODE_MERGE_RETRY_SECONDS = 600;
export const MAX_EXPENSES = 5000;
export { FX_MANUAL_RATE_FACTOR, MAX_SHARES };

export const PUSH_COALESCE_SECONDS = 600;

// ABA-649: GROUP_SHARE_BASE_URL (the apex short link, an nginx 302 to the API guest page) applies to
// the links WE HAND OUT only. Unset = today's base. APP_PUBLIC_URL and the guest controller's own
// origin check are deliberately untouched. Read per call so a spec can toggle it.
const guestLinkBase = () =>
  (process.env.GROUP_SHARE_BASE_URL || process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl').replace(/\/+$/, '');

const nameKeyOf = (name: string) => name.trim().toLowerCase();

type Actor = GroupActor;

@Injectable()
export class GroupsService implements GroupLedgerPorts {
  private readonly logger = new Logger(GroupsService.name);
  private readonly fx: GroupFxService;
  private readonly settlements: GroupSettlementsService;
  private readonly itemized: GroupItemizedExpenseService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
    // The existing singleton (CurrencyExchangeModule), never a second instance (ABA-654).
    private readonly rates: ExchangeRateService,
    // ABA-657: the link-code self-merge. Optional only so specs that never merge can omit it; the
    // module always provides it.
    @Optional() private readonly merger?: GroupMergeService,
    // ABA-660: post-commit reconcile of members who count their share in their budget. Optional only
    // so specs that never mirror can omit it; the module always provides it.
    @Optional() private readonly mirror?: GroupBudgetMirrorService,
  ) {
    // Plain collaborators built here rather than injected: the write services call back into this
    // facade's ledger primitives, and GroupItemsService already injects GroupsService.
    this.fx = new GroupFxService(prisma, rates);
    this.settlements = new GroupSettlementsService(prisma, this);
    this.itemized = new GroupItemizedExpenseService(prisma, this, this.fx);
  }

  /** Post-commit reconcile of members who count their share in their budget (ABA-660). */
  afterLedgerWrite(groupId: string): void {
    this.mirror?.afterLedgerWrite(groupId);
  }

  // ---------------------------------------------------------------- helpers

  private buildGuestUrl(token: string): string {
    return `${guestLinkBase()}/g/${token}`;
  }

  private newToken(): string {
    return randomBytes(16).toString('hex');
  }

  /** The acting member, re-resolved from the DB. Never trust a bare id. Shared with GroupItemsService. */
  async resolveActor(groupId: string, memberId: string): Promise<Actor> {
    const m = await this.prisma.expenseGroupMember.findFirst({
      where: { id: memberId, groupId, removedAt: null },
      select: { id: true, userId: true, group: { select: { ownerUserId: true } } },
    });
    if (!m) throw new NotFoundException('Group not found');
    return { id: m.id, userId: m.userId, isOwner: !!m.userId && m.userId === m.group.ownerUserId };
  }

  /** Re-resolves incoming member ids; every one must be a live member of THIS group. */
  async assertLiveMembers(groupId: string, ids: string[], db: Prisma.TransactionClient = this.prisma): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await db.expenseGroupMember.findMany({
      where: { id: { in: unique }, groupId, removedAt: null },
      select: { id: true },
    });
    if (found.length !== unique.length) throw new NotFoundException('Member not found');
  }

  /**
   * ABA-657 review H1: the FIRST statement of every ledger write. A no-op/bump UPDATE on the group row
   * takes its row lock, so writers (expenses, settlements, claims, removals) and the member merge
   * serialise; only then is the group re-checked as active and every referenced member re-checked as
   * live (`assertLiveMembers(..., tx)`) on the state the lock now protects. `bump` increments
   * `ledgerVersion` (a ledger change, which also stales any open settle form); a claim change that
   * moves no share locks without bumping.
   */
  async lockGroup(tx: Prisma.TransactionClient, groupId: string, bump = true): Promise<void> {
    const g = await tx.expenseGroup.update({
      where: { id: groupId },
      data: bump ? { ledgerVersion: { increment: 1 } } : { updatedAt: new Date() },
      select: { status: true },
    });
    if (g.status !== 'active') {
      throw new ForbiddenException({ code: 'GROUP_ARCHIVED', message: 'This group is archived and read-only' });
    }
  }

  /** Live members + live ledger. Shared with the guest surface (group-guest.service.ts). */
  async loadState(groupId: string) {
    const [members, expenses, settlements] = await Promise.all([
      this.prisma.expenseGroupMember.findMany({
        where: { groupId, removedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.groupExpense.findMany({
        where: { groupId, deletedAt: null },
        select: {
          id: true,
          paidByMemberId: true,
          amount: true,
          date: true,
          // ABA-655: only to tell whether a receipt is still being divided; the ledger never reads items.
          itemized: true,
          claimsOpenUntil: true,
          shares: { select: { memberId: true, shareAmount: true } },
        },
      }),
      this.prisma.groupSettlement.findMany({
        where: { groupId, voidedAt: null },
        select: { id: true, fromMemberId: true, toMemberId: true, amount: true },
      }),
    ]);
    const ledgerExpenses: (LedgerExpense & { date: Date })[] = expenses.map((e) => ({
      id: e.id,
      paidByMemberId: e.paidByMemberId,
      amount: Number(e.amount),
      date: e.date,
      shares: e.shares.map((s) => ({ memberId: s.memberId, shareAmount: Number(s.shareAmount) })),
    }));
    const ledgerSettlements: LedgerSettlement[] = settlements.map((s) => ({
      id: s.id,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: Number(s.amount),
    }));
    const ledger = computeGroupLedger(
      members.map((m) => ({ id: m.id })),
      ledgerExpenses,
      ledgerSettlements,
    );
    // ABA-655: an itemised expense still open for claims means the balances may still move.
    const now = new Date();
    const hasOpenItemClaims = expenses.some((e) =>
      isClaimsOpen({ itemized: e.itemized === true, claimsOpenUntil: e.claimsOpenUntil ?? null }, now),
    );
    return { members, ledgerExpenses, ledger, hasOpenItemClaims };
  }

  private async fireGroupActivityPush(
    groupId: string,
    groupName: string,
    actorMemberId: string,
    onlyMemberIds?: string[],
  ): Promise<void> {
    const recipients = await this.prisma.expenseGroupMember.findMany({
      where: {
        groupId,
        removedAt: null,
        userId: { not: null },
        id: onlyMemberIds ? { in: onlyMemberIds.filter((id) => id !== actorMemberId) } : { not: actorMemberId },
      },
      select: { userId: true },
    });
    for (const r of recipients) {
      if (!r.userId) continue;
      // One push per recipient per 10 minutes: five expenses in a row produce a single push.
      if (!(await this.cache.setIfAbsent(`grp:push:${groupId}:${r.userId}`, PUSH_COALESCE_SECONDS))) continue;
      await this.notifications.sendToUser(
        r.userId,
        (lang: string) => ni18n.groupActivityTitle(lang, groupName),
        (lang: string) => ni18n.groupActivityBody(lang),
        { groupId },
        'group_activity',
      );
    }
  }

  /**
   * ABA-655: the `group_activity` push to ONLY the given members (a claim change notifies the people
   * whose share moved), still app users other than the actor, still coalesced per recipient.
   */
  notifyMembers(groupId: string, actorMemberId: string, memberIds: string[]): void {
    const ids = memberIds.filter((id) => id !== actorMemberId);
    if (ids.length === 0) return;
    void this.prisma.expenseGroup
      .findUnique({ where: { id: groupId }, select: { name: true } })
      .then((g: { name: string } | null) => (g ? this.fireGroupActivityPush(groupId, g.name, actorMemberId, ids) : undefined))
      .catch(logFireAndForget(this.logger, 'GroupsService.notifyMembers'));
  }

  notifyActivity(groupId: string, actorMemberId: string): void {
    void this.prisma.expenseGroup
      .findUnique({ where: { id: groupId }, select: { name: true } })
      .then((g: { name: string } | null) => (g ? this.fireGroupActivityPush(groupId, g.name, actorMemberId) : undefined))
      .catch(logFireAndForget(this.logger, 'GroupsService.fireGroupActivityPush'));
  }

  // ------------------------------------------------------------------ reads

  async getDetail(groupId: string, memberId: string): Promise<GroupDetail> {
    const group = await this.prisma.expenseGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    const { members, ledgerExpenses, ledger, hasOpenItemClaims } = await this.loadState(groupId);
    const me = members.find((m) => m.id === memberId);
    if (!me) throw new NotFoundException('Group not found');
    const ownerMember = members.find((m) => m.userId && m.userId === group.ownerUserId);
    return {
      id: group.id,
      name: group.name,
      emoji: group.emoji ?? null,
      currencyCode: group.currencyCode,
      status: group.status,
      guestAccess: group.guestAccess,
      isOwner: !!me.userId && me.userId === group.ownerUserId,
      ownerMemberId: ownerMember?.id ?? null,
      isOrphaned: group.ownerUserId === null,
      // ABA-650 review: only a member who was live BEFORE the orphaning may adopt (see isAdoptionEligible).
      canAdopt: group.ownerUserId === null && group.status === 'active' && isAdoptionEligible(me, group.orphanedAt),
      myMemberId: me.id,
      members: members.map((m) => toMember(m)),
      balances: ledger.balances,
      suggestedTransfers: ledger.suggestedTransfers,
      ledgerVersion: group.ledgerVersion,
      guestUrl: this.buildGuestUrl(group.guestToken),
      myShareThisMonth: myShareThisMonth(me.id, ledgerExpenses),
      // ABA-655: the settle screens warn while a receipt is still being divided. Archived = frozen.
      hasOpenItemClaims: group.status === 'active' && hasOpenItemClaims === true,
    };
  }

  async listGroups(userId: string): Promise<GroupSummary[]> {
    const memberships = await this.prisma.expenseGroupMember.findMany({
      where: { userId, removedAt: null },
      select: { id: true, group: { select: { id: true, name: true, emoji: true, currencyCode: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      memberships.map(async (m) => {
        const { members, ledger } = await this.loadState(m.group.id);
        return {
          id: m.group.id,
          name: m.group.name,
          emoji: m.group.emoji ?? null,
          currencyCode: m.group.currencyCode,
          status: m.group.status,
          memberCount: members.length,
          myBalance: ledger.balances.find((b) => b.memberId === m.id)?.netAmount ?? 0,
        };
      }),
    );
  }

  /**
   * Expenses, payments and membership events, merged newest first. `guestView` limits the events to
   * GUEST_VISIBLE_EVENT_KINDS (the public page); the app sees every kind.
   */
  async getActivity(
    groupId: string,
    before?: string,
    limit = 50,
    opts: { guestView?: boolean } = {},
  ): Promise<GroupActivityPage> {
    const take = Math.min(Math.max(limit, 1), 100);
    const createdAt = before ? { lt: new Date(before) } : undefined;
    const [expenses, settlements, events] = await Promise.all([
      this.prisma.groupExpense.findMany({
        where: { groupId, ...(createdAt ? { createdAt } : {}) },
        include: { shares: true },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
      }),
      this.prisma.groupSettlement.findMany({
        where: { groupId, ...(createdAt ? { createdAt } : {}) },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
      }),
      this.prisma.groupMemberEvent.findMany({
        where: {
          groupId,
          ...(createdAt ? { createdAt } : {}),
          ...(opts.guestView ? { kind: { in: GUEST_VISIBLE_EVENT_KINDS } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
      }),
    ]);
    const eventViews = await this.toEventViews(groupId, events);
    const all: GroupActivityItem[] = [
      ...expenses.map((e) => ({ kind: 'expense' as const, at: new Date(e.createdAt).toISOString(), expense: toExpense(e) })),
      ...settlements.map((s) => ({ kind: 'settlement' as const, at: new Date(s.createdAt).toISOString(), settlement: toSettlement(s) })),
      ...eventViews.map((ev) => ({ kind: 'event' as const, at: ev.createdAt, event: ev })),
    ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const items = all.slice(0, take);
    return { items, nextBefore: all.length > take ? items[items.length - 1].at : null };
  }

  /** Member names for the event rows: the CURRENT names, removed members included, scoped to the group. */
  private async toEventViews(groupId: string, events: any[]): Promise<GroupMemberEventView[]> {
    if (events.length === 0) return [];
    const ids = [
      ...new Set(events.flatMap((e) => [e.actorMemberId, e.targetMemberId]).filter((x: unknown): x is string => !!x)),
    ];
    const rows = ids.length
      ? await this.prisma.expenseGroupMember.findMany({
          where: { groupId, id: { in: ids } },
          select: { id: true, displayName: true },
        })
      : [];
    const names = new Map<string, string>(rows.map((r: { id: string; displayName: string }) => [r.id, r.displayName]));
    return events.map((e) => ({
      id: e.id,
      kind: e.kind,
      actorMemberId: e.actorMemberId ?? null,
      subjectMemberId: e.subjectMemberId,
      subjectName: e.subjectName,
      targetMemberId: e.targetMemberId ?? null,
      targetName: e.targetMemberId ? (names.get(e.targetMemberId) ?? null) : null,
      actorName: e.actorMemberId ? (names.get(e.actorMemberId) ?? null) : null,
      createdAt: new Date(e.createdAt).toISOString(),
    }));
  }

  // ------------------------------------------------------------ group-level

  async createGroup(userId: string, userName: string, dto: CreateGroupDto): Promise<GroupDetail> {
    const owned = await this.prisma.expenseGroup.count({ where: { ownerUserId: userId, status: 'active' } });
    if (owned >= MAX_GROUPS_OWNED) {
      throw new BadRequestException({ code: 'GROUP_LIMIT', message: `You can own at most ${MAX_GROUPS_OWNED} active groups` });
    }
    const ownerName = (dto.myDisplayName?.trim() || userName || 'Me').slice(0, 40);
    const names = [ownerName, ...(dto.memberNames ?? [])];
    if (names.length > MAX_MEMBERS) {
      throw new BadRequestException({ code: 'GROUP_MEMBER_LIMIT', message: `A group has at most ${MAX_MEMBERS} members` });
    }
    const keys = names.map(nameKeyOf);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException({ code: 'MEMBER_NAME_TAKEN', message: 'Member names must be unique' });
    }

    const group = await this.prisma.expenseGroup.create({
      data: {
        name: dto.name.trim(),
        emoji: dto.emoji ?? null,
        currencyCode: dto.currencyCode,
        ownerUserId: userId,
        guestToken: this.newToken(),
        members: {
          create: names.map((n, i) => ({
            displayName: n,
            nameKey: keys[i],
            userId: i === 0 ? userId : null,
            joinedVia: i === 0 ? ('owner' as const) : ('placeholder' as const),
          })),
        },
      },
      include: { members: { select: { id: true, userId: true } } },
    });
    const me = group.members.find((m) => m.userId === userId);
    return this.getDetail(group.id, me!.id);
  }

  /**
   * Read-only look at a group by its link token, for the app's join screen. Same token semantics as
   * the guest page: unknown, malformed, guest-access-off and deleted are one identical 404. An
   * archived group is returned with its status so the app refuses to join. Only unclaimed live
   * placeholders are listed, and only as id + display name.
   */
  async preview(userId: string, guestToken: string): Promise<GroupJoinPreview> {
    if (typeof guestToken !== 'string' || guestToken.length < 8 || guestToken.length > 128) {
      throw new NotFoundException('Group not found');
    }
    const group = await this.prisma.expenseGroup.findUnique({ where: { guestToken } });
    if (!group || !group.guestAccess) throw new NotFoundException('Group not found');

    const [mine, unclaimed] = await Promise.all([
      this.prisma.expenseGroupMember.findFirst({ where: { groupId: group.id, userId } }),
      this.prisma.expenseGroupMember.findMany({
        where: { groupId: group.id, userId: null, claimTokenHash: null, removedAt: null },
        select: { id: true, displayName: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const live = mine && !mine.removedAt ? mine : null;
    return {
      groupName: group.name,
      emoji: group.emoji ?? null,
      currencyCode: group.currencyCode,
      status: group.status,
      alreadyMember: !!live,
      // The group id is disclosed only to someone who already is a live member of it.
      ...(live ? { myMemberId: live.id, groupId: group.id } : {}),
      unclaimed: unclaimed.map((m: { id: string; displayName: string }) => ({ id: m.id, displayName: m.displayName })),
    };
  }

  async join(userId: string, dto: JoinGroupDto): Promise<GroupDetail> {
    const group = await this.prisma.expenseGroup.findUnique({ where: { guestToken: dto.guestToken } });
    if (!group || !group.guestAccess) throw new NotFoundException('Group not found');

    const existing = await this.prisma.expenseGroupMember.findFirst({ where: { groupId: group.id, userId } });
    const archived = () =>
      new ForbiddenException({ code: 'GROUP_ARCHIVED', message: 'This group is archived and read-only' });
    if (existing) {
      if (!existing.removedAt) return this.getDetail(group.id, existing.id);
      // A member the owner removed must not walk back in through the link.
      if (existing.removedByOwner) {
        throw new ForbiddenException({ code: 'GROUP_REMOVED', message: 'You were removed from this group' });
      }
      // A self-removed member may rejoin, but through the same archive + member-cap checks as a new join.
      if (group.status === 'archived') throw archived();
      await this.withMemberSlot(group.id, (tx) =>
        tx.expenseGroupMember.update({ where: { id: existing.id }, data: { removedAt: null, removedByOwner: false, claimedAt: new Date() } }),
      );
      return this.getDetail(group.id, existing.id);
    }
    if (group.status === 'archived') throw archived();

    if (dto.memberId) {
      // Take over an UNCLAIMED placeholder only. Atomic: the loser of a race matches zero rows.
      const res = await this.prisma.expenseGroupMember.updateMany({
        where: { id: dto.memberId, groupId: group.id, userId: null, claimTokenHash: null, removedAt: null },
        data: { userId, claimedAt: new Date(), joinedVia: 'app_link' },
      });
      if (res.count === 0) {
        throw new ConflictException({ code: 'MEMBER_TAKEN', message: 'That name was just taken' });
      }
      return this.getDetail(group.id, dto.memberId);
    }
    if (!dto.displayName) {
      throw new BadRequestException('memberId or displayName is required');
    }
    const member = await this.createMember(group.id, dto.displayName, userId, undefined, 'app_link');
    return this.getDetail(group.id, member.id);
  }

  /** `claimTokenHash` is set only by the guest surface, which mints the member already claimed. */
  /**
   * Runs `fn` inside a transaction that first takes the group row's lock (a no-op UPDATE), then
   * enforces MAX_MEMBERS. Concurrent joins/adds on the same group serialize on that lock, so the
   * count-then-write can no longer overshoot the cap.
   */
  private async withMemberSlot<T>(groupId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.expenseGroup.update({ where: { id: groupId }, data: { updatedAt: new Date() } });
      const count = await tx.expenseGroupMember.count({ where: { groupId, removedAt: null } });
      if (count >= MAX_MEMBERS) {
        throw new BadRequestException({ code: 'GROUP_MEMBER_LIMIT', message: `A group has at most ${MAX_MEMBERS} members` });
      }
      return fn(tx);
    });
  }

  /** `claimTokenHash` is set only by the guest surface, which mints the member already claimed. */
  async createMember(
    groupId: string,
    displayName: string,
    userId: string | null,
    claimTokenHash?: string,
    joinedVia: 'placeholder' | 'app_link' | 'guest' = claimTokenHash ? 'guest' : userId ? 'app_link' : 'placeholder',
  ) {
    try {
      return await this.withMemberSlot<any>(groupId, (tx) =>
        tx.expenseGroupMember.create({
          data: {
            groupId,
            displayName,
            nameKey: nameKeyOf(displayName),
            userId,
            joinedVia,
            ...(claimTokenHash ? { claimTokenHash, claimedAt: new Date() } : {}),
          },
        }),
      );
    } catch (e) {
      if (isP2002(e)) {
        throw new ConflictException({ code: 'MEMBER_NAME_TAKEN', message: 'A member with that name already exists' });
      }
      throw e;
    }
  }

  async updateGroup(groupId: string, memberId: string, dto: UpdateGroupDto): Promise<GroupDetail> {
    const group = await this.prisma.expenseGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.emoji !== undefined) data.emoji = dto.emoji;
    if (dto.guestAccess !== undefined) data.guestAccess = dto.guestAccess;
    if (dto.currencyCode !== undefined && dto.currencyCode !== group.currencyCode) {
      const expenseCount = await this.prisma.groupExpense.count({ where: { groupId } });
      if (expenseCount > 0) {
        throw new BadRequestException({
          code: 'CURRENCY_LOCKED',
          message: 'The currency cannot change once the group has expenses',
        });
      }
      data.currencyCode = dto.currencyCode;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.expenseGroup.update({ where: { id: groupId }, data });
    }
    return this.getDetail(groupId, memberId);
  }

  async rotateLink(groupId: string): Promise<{ guestUrl: string }> {
    const token = this.newToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.expenseGroup.update({ where: { id: groupId }, data: { guestToken: token } });
      // Rotation is the "the link leaked" remedy: every device re-identifies.
      await tx.expenseGroupMember.updateMany({
        where: { groupId },
        data: { claimTokenHash: null, claimedAt: null },
      });
    });
    return { guestUrl: this.buildGuestUrl(token) };
  }

  async archive(groupId: string, memberId: string, force = false): Promise<GroupDetail> {
    const { ledger } = await this.loadState(groupId);
    const open = ledger.balances.some((b) => Math.abs(b.netAmount) > 0.005);
    if (open && !force) {
      throw new ConflictException({ code: 'OPEN_BALANCES', message: 'The group still has open balances' });
    }
    await this.prisma.expenseGroup.update({
      where: { id: groupId },
      data: { status: 'archived', archivedAt: new Date() },
    });
    return this.getDetail(groupId, memberId);
  }

  async deleteGroup(groupId: string): Promise<void> {
    if (!this.mirror) {
      await this.prisma.expenseGroup.delete({ where: { id: groupId } });
      return;
    }
    // ABA-660: the ledger rows cascade away with the group, so every member's mirror is torn down
    // first, in the same transaction: share rows removed, linked legs counted again.
    const mirror = this.mirror;
    await this.prisma.$transaction(async (tx) => {
      await mirror.teardownGroup(tx, groupId);
      await tx.expenseGroup.delete({ where: { id: groupId } });
    });
  }

  // ---------------------------------------------------------------- members

  async addMember(groupId: string, memberId: string, dto: AddGroupMemberDto): Promise<GroupMember> {
    await this.resolveActor(groupId, memberId);
    const m = await this.createMember(groupId, dto.displayName, null);
    return toMember(m);
  }

  async updateMember(groupId: string, memberId: string, targetId: string, dto: UpdateGroupMemberDto): Promise<GroupMember> {
    const actor = await this.resolveActor(groupId, memberId);
    const target = await this.prisma.expenseGroupMember.findFirst({
      where: { id: targetId, groupId, removedAt: null },
    });
    if (!target) throw new NotFoundException('Member not found');
    const self = target.id === actor.id;

    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) {
      if (!self && !actor.isOwner) throw new ForbiddenException('Only the member or the owner can rename');
      data.displayName = dto.displayName;
      data.nameKey = nameKeyOf(dto.displayName);
    }
    if (dto.paymentMethod !== undefined || dto.paymentHandle !== undefined) {
      if (!self) throw new ForbiddenException('Payment info can only be set by the member themself');
      if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
      if (dto.paymentHandle !== undefined) data.paymentHandle = dto.paymentHandle;
    }
    if (Object.keys(data).length === 0) return toMember(target);
    try {
      const updated = await this.prisma.expenseGroupMember.update({ where: { id: target.id }, data });
      return toMember(updated);
    } catch (e) {
      if (isP2002(e)) {
        throw new ConflictException({ code: 'MEMBER_NAME_TAKEN', message: 'A member with that name already exists' });
      }
      throw e;
    }
  }

  async removeMember(groupId: string, memberId: string, targetId: string): Promise<void> {
    const actor = await this.resolveActor(groupId, memberId);
    const target = await this.prisma.expenseGroupMember.findFirst({
      where: { id: targetId, groupId, removedAt: null },
      select: { id: true, userId: true },
    });
    if (!target) throw new NotFoundException('Member not found');
    const self = target.id === actor.id;
    if (!self && !actor.isOwner) throw new ForbiddenException('Only the owner can remove another member');
    if (self && actor.isOwner) {
      throw new BadRequestException({ code: 'OWNER_CANNOT_LEAVE', message: 'The owner cannot leave the group' });
    }
    // ABA-655 review H1: a member who still holds claims on a receipt that is open for claims cannot
    // leave until those are released, or their stale claims would dilute the others' shares. The
    // affected expenses' row locks are taken first (the same no-op update a claim change takes) and
    // the check re-runs under them, so a concurrent claim change either commits before the check
    // (and is seen) or runs after and finds the member gone. A removed member's claims are in any
    // case treated as unclaimed by GroupItemsService, which is the safety net for the rest.
    await this.prisma.$transaction(async (tx) => {
      // ABA-657 review H1: the group row's lock first (a no-op: removal changes no figure), then the
      // member is re-checked live and the zero-balance rule runs on the ledger as the lock protects it,
      // so an expense that committed after the old pre-check can no longer leave a removed payer.
      await this.lockGroup(tx, groupId, false);
      await this.assertLiveMembers(groupId, [target.id], tx);
      const { ledger } = await this.loadState(groupId);
      const bal = ledger.balances.find((b) => b.memberId === target.id)?.netAmount ?? 0;
      if (Math.abs(bal) > 0.005) {
        throw new ConflictException({ code: 'NONZERO_BALANCE', message: 'The balance must be settled before removing a member' });
      }
      const openClaims = () =>
        tx.groupExpense.findMany({
          where: {
            groupId,
            deletedAt: null,
            itemized: true,
            claimsOpenUntil: { gt: new Date() },
            items: { some: { claims: { some: { memberId: target.id } } } },
          },
          select: { id: true },
        });
      const first: { id: string }[] = (await openClaims()) ?? [];
      for (const e of first) await tx.groupExpense.update({ where: { id: e.id }, data: { updatedAt: new Date() } });
      if (first.length && ((await openClaims()) ?? []).length) {
        throw new ConflictException({
          code: 'MEMBER_HAS_OPEN_CLAIMS',
          message: 'Release this member’s line claims on open receipts before removing them',
        });
      }
      await tx.expenseGroupMember.update({
        where: { id: target.id },
        data: { removedAt: new Date(), claimTokenHash: null, removedByOwner: !self },
      });
      // ABA-660 review H2: the removed member's budget mirror goes in the same transaction.
      await this.mirror?.teardownMember(tx, target.id);
    });
  }

  /**
   * ABA-651: the owner frees ONE guest's browser claim (the guards prove the caller owns the group).
   * Only a live guest row (no `userId`) that is currently claimed qualifies; the target is re-scoped
   * to the group, and a foreign, removed or app-user id is the same 404. The row, its history and its
   * balance stay; only `claimTokenHash`/`claimedAt` go NULL, so that device's cookie stops resolving,
   * its outstanding link code fails at redemption, and the name is on the picker again. The write is a
   * CAS on the hash that was read, with the `claim_reset` event in the same transaction. No
   * `ledgerVersion` bump: nothing in the ledger changed.
   */
  async resetClaim(groupId: string, actorMemberId: string, targetId: string): Promise<GroupMember> {
    const target = await this.prisma.expenseGroupMember.findFirst({
      where: { id: targetId, groupId, removedAt: null },
      select: { id: true, userId: true, displayName: true, claimTokenHash: true },
    });
    if (!target || target.userId) throw new NotFoundException('Member not found');
    const notClaimed = () =>
      new ConflictException({ code: 'NOT_CLAIMED', message: 'Nobody has signed in as this member' });
    if (!target.claimTokenHash) throw notClaimed();

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.expenseGroupMember.updateMany({
        where: { id: target.id, groupId, userId: null, removedAt: null, claimTokenHash: target.claimTokenHash },
        // Payout details go too (ABA-651 review): the next person to pick this name must not inherit
        // the previous claimant's payment method/handle.
        data: { claimTokenHash: null, claimedAt: null, paymentMethod: null, paymentHandle: null },
      });
      if (res.count === 0) throw notClaimed();
      await tx.groupMemberEvent.create({
        data: {
          groupId,
          kind: 'claim_reset',
          actorMemberId,
          subjectMemberId: target.id,
          targetMemberId: null,
          subjectName: target.displayName,
        },
      });
      return tx.expenseGroupMember.findFirst({ where: { id: target.id, groupId } });
    });
    if (!updated) throw notClaimed();
    return toMember(updated);
  }

  // --------------------------------------------------------------- expenses

  // ------------------------------------------------------------ settlements

  createSettlement(groupId: string, memberId: string, dto: CreateGroupSettlementDto): Promise<GroupDetail> {
    return this.settlements.create(groupId, memberId, dto);
  }

  voidSettlement(groupId: string, memberId: string, settlementId: string): Promise<GroupDetail> {
    return this.settlements.void(groupId, memberId, settlementId);
  }

  /** GET /groups/:groupId/fx-preview?currency= (ABA-654). */
  fxPreview(groupId: string, currency: string): Promise<GroupFxPreview> {
    return this.fx.fxPreview(groupId, currency);
  }

  async createExpense(groupId: string, memberId: string, dto: CreateGroupExpenseDto): Promise<GroupDetail> {
    const actor = await this.resolveActor(groupId, memberId);

    const dup = await this.prisma.groupExpense.findFirst({
      where: { groupId, clientRequestId: dto.clientRequestId },
      select: { id: true },
    });
    if (dup) return this.getDetail(groupId, actor.id);

    const count = await this.prisma.groupExpense.count({ where: { groupId } });
    if (count >= MAX_EXPENSES) {
      throw new BadRequestException({ code: 'EXPENSE_LIMIT', message: `A group has at most ${MAX_EXPENSES} expenses` });
    }
    if (dto.items !== undefined) return this.itemized.create(groupId, actor.id, dto);
    if (dto.discountAmount !== undefined) {
      throw new BadRequestException({ code: 'EXPENSE_NOT_ITEMIZED', message: 'A discount needs line items' });
    }
    if (!dto.splitType || !dto.shares) throw new BadRequestException('splitType and shares are required');
    const splitType = dto.splitType;
    const shares = dto.shares;
    await this.assertLiveMembers(groupId, [dto.paidByMemberId, ...shares.map((s) => s.memberId)]);
    const groupCurrency = await this.fx.groupCurrencyOf(groupId);
    // `dto.amount` is in the ENTRY currency; the ledger stores the converted figure (ABA-654).
    const conv = await this.fx.convertEntry(dto.amount, dto.currencyCode ?? groupCurrency, groupCurrency, dto.fxRate);
    const resolved = this.fx.resolveFxShares(conv.amount, conv.fx.originalAmount, splitType, shares);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockGroup(tx, groupId);
        await this.assertLiveMembers(groupId, [dto.paidByMemberId, ...shares.map((s) => s.memberId)], tx);
        await tx.groupExpense.create({
          data: {
            groupId,
            description: dto.description,
            amount: conv.amount,
            ...conv.fx,
            date: toDateOnly(dto.date),
            paidByMemberId: dto.paidByMemberId,
            splitType,
            createdByMemberId: actor.id,
            clientRequestId: dto.clientRequestId,
            shares: {
              create: resolved.map((s) => ({
                memberId: s.memberId,
                shareValue: s.shareValue,
                shareAmount: s.shareAmount,
              })),
            },
          },
        });
        });
    } catch (e) {
      if (isP2002(e)) return this.getDetail(groupId, actor.id);
      throw e;
    }
    this.notifyActivity(groupId, actor.id);
    this.mirror?.afterLedgerWrite(groupId);
    return this.getDetail(groupId, actor.id);
  }

  async updateExpense(groupId: string, memberId: string, expenseId: string, dto: UpdateGroupExpenseDto): Promise<GroupDetail> {
    const actor = await this.resolveActor(groupId, memberId);
    const expense = await this.prisma.groupExpense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
      include: { shares: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    if (!actor.isOwner && expense.createdByMemberId !== actor.id && expense.paidByMemberId !== actor.id) {
      throw new ForbiddenException('Only the creator, the payer or the owner can edit this expense');
    }
    if (expense.itemized) return this.itemized.update(groupId, actor.id, expense, dto);
    if (dto.items !== undefined || dto.discountAmount !== undefined) {
      throw new BadRequestException({ code: 'EXPENSE_NOT_ITEMIZED', message: 'This expense has no line items' });
    }

    const splitType = dto.splitType ?? expense.splitType;
    const paidBy = dto.paidByMemberId ?? expense.paidByMemberId;
    if (dto.splitType && dto.splitType !== 'equal' && dto.splitType !== expense.splitType && !dto.shares) {
      throw new BadRequestException('shares are required when the split type changes');
    }
    if (splitType === 'exact' && dto.amount !== undefined && !dto.shares) {
      throw new BadRequestException('shares are required when the amount of an exact split changes');
    }
    const rawShares: GroupExpenseShareInputDto[] =
      dto.shares ??
      expense.shares.map((s) => ({
        memberId: s.memberId,
        value: s.shareValue == null ? undefined : Number(s.shareValue),
      }));

    await this.assertLiveMembers(groupId, [paidBy, ...rawShares.map((s) => s.memberId)]);

    // ABA-654 edit rule: a new amount reuses the stored rate, a new currency fetches a new one (or
    // takes the override), anything else touches no figures. Never a "refresh the rate" re-conversion.
    const { amount, originalAmount, fxData } = await this.fx.resolveEditFigures(groupId, expense, dto);
    const resolved = this.fx.resolveFxShares(amount, originalAmount, splitType, rawShares);

    await this.prisma.$transaction(async (tx) => {
      await this.lockGroup(tx, groupId);
      await this.assertLiveMembers(groupId, [paidBy, ...rawShares.map((s) => s.memberId)], tx);
      // Shares are fully deleted and recreated, never patched.
      await tx.groupExpenseShare.deleteMany({ where: { groupExpenseId: expense.id } });
      await tx.groupExpense.update({
        where: { id: expense.id },
        data: {
          description: dto.description ?? expense.description,
          amount,
          ...fxData,
          date: dto.date ? toDateOnly(dto.date) : expense.date,
          paidByMemberId: paidBy,
          splitType,
          shares: {
            create: resolved.map((s) => ({
              memberId: s.memberId,
              shareValue: s.shareValue,
              shareAmount: s.shareAmount,
            })),
          },
        },
      });
    });
    this.notifyActivity(groupId, actor.id);
    this.mirror?.afterLedgerWrite(groupId);
    return this.getDetail(groupId, actor.id);
  }

  async deleteExpense(groupId: string, memberId: string, expenseId: string): Promise<GroupDetail> {
    const actor = await this.resolveActor(groupId, memberId);
    const expense = await this.prisma.groupExpense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
      select: { id: true, createdByMemberId: true, paidByMemberId: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    if (!actor.isOwner && expense.createdByMemberId !== actor.id && expense.paidByMemberId !== actor.id) {
      throw new ForbiddenException('Only the creator, the payer or the owner can delete this expense');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lockGroup(tx, groupId);
      await tx.groupExpense.update({
        where: { id: expense.id },
        data: { deletedAt: new Date(), deletedByMemberId: actor.id },
      });
    });
    this.mirror?.afterLedgerWrite(groupId);
    return this.getDetail(groupId, actor.id);
  }

  // ------------------------------------------------------- guest -> user link

  /** The guest row's current net balance in the group currency, for the merge offer (numbers only). */
  private async guestNet(groupId: string, memberId: string): Promise<{ balance: number; currencyCode: string } | null> {
    try {
      const [{ ledger }, currencyCode] = await Promise.all([this.loadState(groupId), this.fx.groupCurrencyOf(groupId)]);
      const bal = ledger.balances.find((b) => b.memberId === memberId)?.netAmount ?? 0;
      return { balance: Math.round(bal * 100) / 100, currencyCode };
    } catch {
      return null;
    }
  }

  /**
   * Binds the caller to the guest member a `POST /g/:token/link` code was minted for. The code is
   * single-use: `getAndDelete` is an atomic GETDEL, so two concurrent redeemers cannot both win.
   * Its null return also covers a Redis outage, which denies, as it should.
   */
  async linkGuest(userId: string, code: string, opts: { merge?: boolean } = {}): Promise<GroupDetail> {
    const key = `grp:link:${code}`;
    const payload = await this.cache.getAndDelete<{
      groupId: string;
      memberId: string;
      guestToken?: string;
      claim?: string;
      exp?: number;
      mergeUserId?: string;
    }>(key);
    const gone = () =>
      new GoneException({ code: 'LINK_CODE_INVALID', message: 'This link code is invalid or has expired' });
    // A payload without `claim` predates ABA-651 (10-minute TTL): refused like any stale code.
    if (!payload?.groupId || !payload?.memberId || !payload?.guestToken || !payload?.claim) throw gone();
    // ABA-657 review M3: a code put back for the merge offer is bound to the user who got the 409.
    // Anyone else redeeming it with merge:true gets 410, and the code is put back for its user.
    const restore = async () => {
      const remaining = typeof payload.exp === 'number' ? Math.ceil((payload.exp - Date.now()) / 1000) : 0;
      if (remaining > 0) await this.cache.set(key, payload, Math.min(remaining, LINK_CODE_MERGE_RETRY_SECONDS));
    };
    if (opts.merge === true && payload.mergeUserId && payload.mergeUserId !== userId) {
      await restore();
      throw gone();
    }

    // The code outlives the link it was minted from: re-read the group so a rotated link, a
    // guestAccess=false kill-switch or an archive all invalidate it.
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: payload.groupId },
      select: { guestToken: true, guestAccess: true, status: true, ownerUserId: true },
    });
    if (!group || group.guestToken !== payload.guestToken || !group.guestAccess || group.status !== 'active') {
      throw gone();
    }

    const member = await this.prisma.expenseGroupMember.findFirst({
      where: { id: payload.memberId, groupId: payload.groupId, removedAt: null },
      select: { id: true, userId: true, claimTokenHash: true, displayName: true },
    });
    if (!member || member.userId) throw gone();
    // ABA-651: the code is only as good as the claim it was minted under. A reset (or forget, or a
    // re-claim by another device) changed the hash, so the code no longer proves anything.
    if (!member.claimTokenHash || linkClaimBinding(member.claimTokenHash) !== payload.claim) throw gone();

    const existing = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId: payload.groupId, userId },
      select: { id: true, displayName: true, removedAt: true },
    });
    if (existing) {
      // ABA-657: a LIVE caller may fold the guest row into their own row instead (spec D, the
      // self-merge). The code proved the guest cookie, the JWT proves the app row.
      const canMerge = !existing.removedAt && !!this.merger;
      if (canMerge && opts.merge === true) {
        await this.merger!.mergeViaLinkCode(payload.groupId, existing.id, member.id, member.claimTokenHash);
        return this.getDetail(payload.groupId, existing.id);
      }
      // Nothing was bound, so the code goes back for the follow-up merge request. `set` swallows a
      // Redis error: the merge then fails as 410 and the guest mints a new code.
      // Restored with the REMAINING lifetime (the original expiry travels in the payload; a payload
      // without one is not restored) and bound to this caller.
      if (canMerge) {
        payload.mergeUserId = userId;
        await restore();
      }
      const net = canMerge ? await this.guestNet(payload.groupId, member.id) : null;
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: `You're already in this group as ${existing.displayName}`,
        // The caller holds the code, i.e. the guest's own browser session: naming that row is no leak.
        details: {
          canMerge,
          guestName: member.displayName,
          myName: existing.displayName,
          ...(net ? { guestBalance: net.balance, currencyCode: net.currencyCode } : {}),
        },
      });
    }

    try {
      const res = await this.prisma.expenseGroupMember.updateMany({
        // CAS on the claim too, so a reset landing between the read above and this write still wins.
        where: { id: member.id, groupId: payload.groupId, userId: null, claimTokenHash: member.claimTokenHash },
        // The browser cookie must stop acting as this (now app-linked) member: its authority was the
        // claim hash, so clear it. The app session is the identity from here on.
        data: { userId, claimedAt: null, claimTokenHash: null, joinedVia: 'guest_linked', linkedAt: new Date() },
      });
      if (res.count === 0) throw gone();
    } catch (e) {
      if (isP2002(e)) {
        throw new ConflictException({ code: 'ALREADY_MEMBER', message: "You're already in this group" });
      }
      throw e;
    }
    return this.getDetail(payload.groupId, member.id);
  }
}
