import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { getRatesSafe, unitRate } from '../../common/utils/fx';
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
import {
  convertAtRate,
  isAllowedEntryCurrency,
  planExpenseFxEdit,
  resolveConvertedShares,
  type ConversionResult,
  type FxRateSource,
} from './group-fx';
import {
  AddGroupMemberDto,
  CreateGroupDto,
  CreateGroupExpenseDto,
  CreateGroupSettlementDto,
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
export const MAX_EXPENSES = 5000;
/** ABA-654 review M2: the widest a manual rate may sit from the provider's, either way. */
export const FX_MANUAL_RATE_FACTOR = 3;

export const MAX_SHARES = 20;
export const PUSH_COALESCE_SECONDS = 600;

// ABA-649: GROUP_SHARE_BASE_URL (the apex short link, an nginx 302 to the API guest page) applies to
// the links WE HAND OUT only. Unset = today's base. APP_PUBLIC_URL and the guest controller's own
// origin check are deliberately untouched. Read per call so a spec can toggle it.
const guestLinkBase = () =>
  (process.env.GROUP_SHARE_BASE_URL || process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl').replace(/\/+$/, '');

const nameKeyOf = (name: string) => name.trim().toLowerCase();
const isP2002 = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const toDateOnly = (d: string) => new Date(`${d}T00:00:00.000Z`);

interface Actor {
  id: string;
  userId: string | null;
  isOwner: boolean;
}

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
    // The existing singleton (CurrencyExchangeModule), never a second instance (ABA-654).
    private readonly rates: ExchangeRateService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private buildGuestUrl(token: string): string {
    return `${guestLinkBase()}/g/${token}`;
  }

  private newToken(): string {
    return randomBytes(16).toString('hex');
  }

  /** The acting member, re-resolved from the DB. Never trust a bare id. */
  private async resolveActor(groupId: string, memberId: string): Promise<Actor> {
    const m = await this.prisma.expenseGroupMember.findFirst({
      where: { id: memberId, groupId, removedAt: null },
      select: { id: true, userId: true, group: { select: { ownerUserId: true } } },
    });
    if (!m) throw new NotFoundException('Group not found');
    return { id: m.id, userId: m.userId, isOwner: !!m.userId && m.userId === m.group.ownerUserId };
  }

  /** Re-resolves incoming member ids; every one must be a live member of THIS group. */
  private async assertLiveMembers(groupId: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await this.prisma.expenseGroupMember.findMany({
      where: { id: { in: unique }, groupId, removedAt: null },
      select: { id: true },
    });
    if (found.length !== unique.length) throw new NotFoundException('Member not found');
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
          shares: { select: { memberId: true, shareAmount: true } },
        },
      }),
      this.prisma.groupSettlement.findMany({
        where: { groupId, voidedAt: null },
        select: { id: true, fromMemberId: true, toMemberId: true, amount: true },
      }),
    ]);
    const ledgerExpenses: (LedgerExpense & { date: Date })[] = expenses.map((e: any) => ({
      id: e.id,
      paidByMemberId: e.paidByMemberId,
      amount: Number(e.amount),
      date: e.date,
      shares: e.shares.map((s: any) => ({ memberId: s.memberId, shareAmount: Number(s.shareAmount) })),
    }));
    const ledgerSettlements: LedgerSettlement[] = settlements.map((s: any) => ({
      id: s.id,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: Number(s.amount),
    }));
    const ledger = computeGroupLedger(
      members.map((m: any) => ({ id: m.id })),
      ledgerExpenses,
      ledgerSettlements,
    );
    return { members, ledgerExpenses, ledger };
  }

  private toMember(m: any): GroupMember {
    // Never expose userId: only isAppUser / isClaimed.
    return {
      id: m.id,
      groupId: m.groupId,
      displayName: m.displayName,
      isAppUser: !!m.userId,
      isClaimed: !!m.claimTokenHash,
      paymentMethod: m.paymentMethod ?? null,
      paymentHandle: m.paymentHandle ?? null,
      removedAt: m.removedAt ? new Date(m.removedAt).toISOString() : null,
      createdAt: new Date(m.createdAt).toISOString(),
    };
  }

  private toExpense(e: any): GroupExpense {
    return {
      id: e.id,
      groupId: e.groupId,
      description: e.description,
      amount: Number(e.amount),
      date: new Date(e.date).toISOString().slice(0, 10),
      paidByMemberId: e.paidByMemberId,
      splitType: e.splitType,
      createdByMemberId: e.createdByMemberId,
      shares: (e.shares ?? []).map((s: any) => ({
        memberId: s.memberId,
        shareValue: s.shareValue == null ? null : Number(s.shareValue),
        shareAmount: Number(s.shareAmount),
      })),
      // ABA-654: the figures as ENTERED. Null = entered in the group currency. Read as stored, never re-converted.
      originalAmount: e.originalAmount == null ? null : Number(e.originalAmount),
      originalCurrency: e.originalCurrency ?? null,
      fxRate: e.fxRate == null ? null : Number(e.fxRate),
      fxRateSource: e.fxRateSource ?? null,
      fxRateAt: e.fxRateAt ? new Date(e.fxRateAt).toISOString() : null,
      deletedAt: e.deletedAt ? new Date(e.deletedAt).toISOString() : null,
      deletedByMemberId: e.deletedByMemberId ?? null,
      createdAt: new Date(e.createdAt).toISOString(),
      updatedAt: new Date(e.updatedAt).toISOString(),
    };
  }

  private toSettlement(s: any): GroupSettlement {
    return {
      id: s.id,
      groupId: s.groupId,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: Number(s.amount),
      method: s.method ?? null,
      recordedByMemberId: s.recordedByMemberId,
      voidedAt: s.voidedAt ? new Date(s.voidedAt).toISOString() : null,
      voidedByMemberId: s.voidedByMemberId ?? null,
      createdAt: new Date(s.createdAt).toISOString(),
    };
  }

  private async fireGroupActivityPush(groupId: string, groupName: string, actorMemberId: string): Promise<void> {
    const recipients = await this.prisma.expenseGroupMember.findMany({
      where: { groupId, removedAt: null, userId: { not: null }, id: { not: actorMemberId } },
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

  private notifyActivity(groupId: string, actorMemberId: string): void {
    void this.prisma.expenseGroup
      .findUnique({ where: { id: groupId }, select: { name: true } })
      .then((g: { name: string } | null) => (g ? this.fireGroupActivityPush(groupId, g.name, actorMemberId) : undefined))
      .catch(logFireAndForget(this.logger, 'GroupsService.fireGroupActivityPush'));
  }

  // ------------------------------------------------------------------ reads

  async getDetail(groupId: string, memberId: string): Promise<GroupDetail> {
    const group = await this.prisma.expenseGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    const { members, ledgerExpenses, ledger } = await this.loadState(groupId);
    const me = members.find((m: any) => m.id === memberId);
    if (!me) throw new NotFoundException('Group not found');
    const ownerMember = members.find((m: any) => m.userId && m.userId === group.ownerUserId);
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
      members: members.map((m: any) => this.toMember(m)),
      balances: ledger.balances,
      suggestedTransfers: ledger.suggestedTransfers,
      ledgerVersion: group.ledgerVersion,
      guestUrl: this.buildGuestUrl(group.guestToken),
      myShareThisMonth: myShareThisMonth(me.id, ledgerExpenses),
    };
  }

  async listGroups(userId: string): Promise<GroupSummary[]> {
    const memberships = await this.prisma.expenseGroupMember.findMany({
      where: { userId, removedAt: null },
      select: { id: true, group: { select: { id: true, name: true, emoji: true, currencyCode: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      memberships.map(async (m: any) => {
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
      ...expenses.map((e: any) => ({ kind: 'expense' as const, at: new Date(e.createdAt).toISOString(), expense: this.toExpense(e) })),
      ...settlements.map((s: any) => ({ kind: 'settlement' as const, at: new Date(s.createdAt).toISOString(), settlement: this.toSettlement(s) })),
      ...eventViews.map((ev) => ({ kind: 'event' as const, at: ev.createdAt, event: ev })),
    ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const items = all.slice(0, take);
    return { items, nextBefore: all.length > take ? items[items.length - 1].at : null };
  }

  /** Member names for the event rows: the CURRENT names, removed members included, scoped to the group. */
  private async toEventViews(groupId: string, events: any[]): Promise<GroupMemberEventView[]> {
    if (events.length === 0) return [];
    const ids = [
      ...new Set(events.flatMap((e: any) => [e.actorMemberId, e.targetMemberId]).filter((x: unknown): x is string => !!x)),
    ];
    const rows = ids.length
      ? await this.prisma.expenseGroupMember.findMany({
          where: { groupId, id: { in: ids } },
          select: { id: true, displayName: true },
        })
      : [];
    const names = new Map<string, string>(rows.map((r: { id: string; displayName: string }) => [r.id, r.displayName]));
    return events.map((e: any) => ({
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
    const me = group.members.find((m: any) => m.userId === userId);
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
  private async withMemberSlot<T>(groupId: string, fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: any) => {
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
    await this.prisma.$transaction(async (tx: any) => {
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
    await this.prisma.expenseGroup.delete({ where: { id: groupId } });
  }

  // ---------------------------------------------------------------- members

  async addMember(groupId: string, memberId: string, dto: AddGroupMemberDto): Promise<GroupMember> {
    await this.resolveActor(groupId, memberId);
    const m = await this.createMember(groupId, dto.displayName, null);
    return this.toMember(m);
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
    if (Object.keys(data).length === 0) return this.toMember(target);
    try {
      const updated = await this.prisma.expenseGroupMember.update({ where: { id: target.id }, data });
      return this.toMember(updated);
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
    const { ledger } = await this.loadState(groupId);
    const bal = ledger.balances.find((b) => b.memberId === target.id)?.netAmount ?? 0;
    if (Math.abs(bal) > 0.005) {
      throw new ConflictException({ code: 'NONZERO_BALANCE', message: 'The balance must be settled before removing a member' });
    }
    await this.prisma.expenseGroupMember.update({
      where: { id: target.id },
      data: { removedAt: new Date(), claimTokenHash: null, removedByOwner: !self },
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

    const updated = await this.prisma.$transaction(async (tx: any) => {
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
    return this.toMember(updated);
  }

  // --------------------------------------------------------------- expenses

  private resolveShares(amount: number, splitType: string, shares: GroupExpenseShareInputDto[]) {
    const ids = shares.map((s) => s.memberId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate share member');
    if (ids.length === 0 || ids.length > MAX_SHARES) throw new BadRequestException('Invalid number of shares');
    try {
      return resolveGroupShares(amount, splitType as any, shares);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid split');
    }
  }

  private async groupCurrencyOf(groupId: string): Promise<string> {
    const g = await this.prisma.expenseGroup.findUnique({ where: { id: groupId }, select: { currencyCode: true } });
    if (!g) throw new NotFoundException('Group not found');
    return g.currencyCode;
  }

  private fxUnavailable(): BadRequestException {
    return new BadRequestException({
      code: 'FX_RATE_UNAVAILABLE',
      message: 'No exchange rate is available for that currency right now. Enter the rate or try again later.',
    });
  }

  private assertEntryCurrency(code: string, groupCurrency: string): void {
    if (!isAllowedEntryCurrency(code, groupCurrency)) {
      throw new BadRequestException({ code: 'CURRENCY_UNSUPPORTED', message: 'That currency is not supported' });
    }
  }

  /** The provider's current unit rate (1 `currency` in `groupCurrency`), or null when unknown. */
  private async providerRate(currency: string, groupCurrency: string): Promise<number | null> {
    if (currency === groupCurrency) return 1;
    return unitRate(currency, groupCurrency, await getRatesSafe(this.rates, groupCurrency));
  }

  /**
   * ABA-654: converts ONCE, at write time. A manual rate wins; otherwise the provider's rate at entry
   * time (it has no history). An unknown rate is a 400 FX_RATE_UNAVAILABLE, never a silently
   * unconverted amount.
   */
  private async convertEntry(
    entryAmount: number,
    currency: string,
    groupCurrency: string,
    manualRate?: number,
  ): Promise<Extract<ConversionResult, { ok: true }>> {
    this.assertEntryCurrency(currency, groupCurrency);
    let rate: number | null;
    let source: FxRateSource;
    if (currency !== groupCurrency && manualRate !== undefined) {
      // ABA-654 review M2: a manual rate is bounded to within 3x of the provider's in either direction
      // (it exists for a cash exchange or a card's own rate, not for moving a debt). With no provider
      // rate for the pair there is nothing to compare against and the manual rate stands.
      const reference = await this.providerRate(currency, groupCurrency);
      if (reference !== null && (manualRate > reference * FX_MANUAL_RATE_FACTOR || manualRate < reference / FX_MANUAL_RATE_FACTOR)) {
        throw new BadRequestException({
          code: 'FX_RATE_IMPLAUSIBLE',
          message: 'That exchange rate is far from the current market rate. Check it and try again.',
        });
      }
      rate = manualRate;
      source = 'manual';
    } else {
      rate = await this.providerRate(currency, groupCurrency);
      source = 'provider';
    }
    if (rate === null) throw this.fxUnavailable();
    return this.checked(convertAtRate(entryAmount, currency, groupCurrency, rate, source, new Date()));
  }

  private checked(r: ConversionResult): Extract<ConversionResult, { ok: true }> {
    if (!r.ok) {
      throw new BadRequestException({ code: 'FX_AMOUNT_OUT_OF_RANGE', message: 'The converted amount is out of range' });
    }
    return r;
  }

  /** The usual id / count / split checks, then the FX-aware resolution (exact values as weights). */
  private resolveFxShares(
    amount: number,
    originalAmount: number | null,
    splitType: string,
    shares: GroupExpenseShareInputDto[],
  ) {
    if (originalAmount === null) return this.resolveShares(amount, splitType, shares);
    this.resolveShares(originalAmount, splitType, shares);
    try {
      return resolveConvertedShares(amount, originalAmount, splitType as any, shares);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid split');
    }
  }

  /** GET /groups/:groupId/fx-preview?currency= — the provider rate the app's form shows (ABA-654). */
  async fxPreview(groupId: string, currency: string): Promise<GroupFxPreview> {
    const groupCurrency = await this.groupCurrencyOf(groupId);
    this.assertEntryCurrency(currency, groupCurrency);
    return { groupCurrency, currencyCode: currency, rate: await this.providerRate(currency, groupCurrency) };
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
    await this.assertLiveMembers(groupId, [dto.paidByMemberId, ...dto.shares.map((s) => s.memberId)]);
    const groupCurrency = await this.groupCurrencyOf(groupId);
    // `dto.amount` is in the ENTRY currency; the ledger stores the converted figure (ABA-654).
    const conv = await this.convertEntry(dto.amount, dto.currencyCode ?? groupCurrency, groupCurrency, dto.fxRate);
    const resolved = this.resolveFxShares(conv.amount, conv.fx.originalAmount, dto.splitType, dto.shares);

    try {
      await this.prisma.$transaction(async (tx: any) => {
        await tx.groupExpense.create({
          data: {
            groupId,
            description: dto.description,
            amount: conv.amount,
            ...conv.fx,
            date: toDateOnly(dto.date),
            paidByMemberId: dto.paidByMemberId,
            splitType: dto.splitType,
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
        await tx.expenseGroup.update({ where: { id: groupId }, data: { ledgerVersion: { increment: 1 } } });
      });
    } catch (e) {
      if (isP2002(e)) return this.getDetail(groupId, actor.id);
      throw e;
    }
    this.notifyActivity(groupId, actor.id);
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
      expense.shares.map((s: any) => ({
        memberId: s.memberId,
        value: s.shareValue == null ? undefined : Number(s.shareValue),
      }));

    await this.assertLiveMembers(groupId, [paidBy, ...rawShares.map((s) => s.memberId)]);

    // ABA-654 edit rule: a new amount reuses the stored rate, a new currency fetches a new one (or
    // takes the override), anything else touches no figures. Never a "refresh the rate" re-conversion.
    const groupCurrency = await this.groupCurrencyOf(groupId);
    const stored = {
      amount: Number(expense.amount),
      originalAmount: expense.originalAmount == null ? null : Number(expense.originalAmount),
      originalCurrency: expense.originalCurrency ?? null,
      fxRate: expense.fxRate == null ? null : Number(expense.fxRate),
    };
    if (dto.currencyCode !== undefined) this.assertEntryCurrency(dto.currencyCode, groupCurrency);
    const plan = planExpenseFxEdit(stored, groupCurrency, dto);
    let amount: number;
    let originalAmount: number | null;
    let fxData: Record<string, unknown> = {};
    if (plan.kind === 'keep') {
      amount = stored.amount;
      originalAmount = stored.originalCurrency ? stored.originalAmount : null;
    } else if (plan.kind === 'reuse') {
      const r = this.checked(
        convertAtRate(plan.entryAmount, stored.originalCurrency as string, groupCurrency, stored.fxRate as number, 'provider', new Date()),
      );
      // Only the amounts move; the rate, its source and its timestamp stay as first recorded.
      amount = r.amount;
      originalAmount = r.fx.originalAmount;
      fxData = { originalAmount };
    } else {
      const r =
        plan.kind === 'group'
          ? await this.convertEntry(plan.entryAmount, groupCurrency, groupCurrency)
          : await this.convertEntry(plan.entryAmount, plan.currency, groupCurrency, plan.kind === 'manual' ? plan.rate : undefined);
      amount = r.amount;
      originalAmount = r.fx.originalAmount;
      fxData = { ...r.fx };
    }
    const resolved = this.resolveFxShares(amount, originalAmount, splitType, rawShares);

    await this.prisma.$transaction(async (tx: any) => {
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
      await tx.expenseGroup.update({ where: { id: groupId }, data: { ledgerVersion: { increment: 1 } } });
    });
    this.notifyActivity(groupId, actor.id);
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
    await this.prisma.$transaction(async (tx: any) => {
      await tx.groupExpense.update({
        where: { id: expense.id },
        data: { deletedAt: new Date(), deletedByMemberId: actor.id },
      });
      await tx.expenseGroup.update({ where: { id: groupId }, data: { ledgerVersion: { increment: 1 } } });
    });
    return this.getDetail(groupId, actor.id);
  }

  // ------------------------------------------------------------ settlements

  async createSettlement(groupId: string, memberId: string, dto: CreateGroupSettlementDto): Promise<GroupDetail> {
    const actor = await this.resolveActor(groupId, memberId);

    const dup = await this.prisma.groupSettlement.findFirst({
      where: { groupId, clientRequestId: dto.clientRequestId },
      select: { id: true },
    });
    if (dup) return this.getDetail(groupId, actor.id);

    if (dto.fromMemberId === dto.toMemberId) throw new BadRequestException('from and to must differ');
    if (actor.id !== dto.fromMemberId && actor.id !== dto.toMemberId) {
      throw new ForbiddenException('You can only settle a transfer you are part of');
    }
    await this.assertLiveMembers(groupId, [dto.fromMemberId, dto.toMemberId]);

    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { ledgerVersion: true },
    });
    if (!group) throw new NotFoundException('Group not found');
    if (group.ledgerVersion !== dto.ledgerVersion) {
      throw new ConflictException({ code: 'LEDGER_CHANGED', message: 'Balances changed, refresh and retry' });
    }

    // ABA-652: validated against the CURRENT balances before any write. A payment may be partial or
    // go to a creditor who is not the suggested one, but it can only shrink both balances, never
    // flip a sign, so nobody can record "I paid 1000" to become a creditor.
    const { ledger } = await this.loadState(groupId);
    const check = validateSettlement(dto, ledger.balances);
    if (!check.ok) {
      throw new BadRequestException({
        code: 'SETTLEMENT_EXCEEDS_BALANCE',
        reason: check.reason,
        message: 'That payment is larger than what is owed between these two members',
      });
    }

    try {
      await this.prisma.$transaction(async (tx: any) => {
        const cas = await tx.expenseGroup.updateMany({
          where: { id: groupId, ledgerVersion: dto.ledgerVersion },
          data: { ledgerVersion: { increment: 1 } },
        });
        if (cas.count === 0) {
          throw new ConflictException({ code: 'LEDGER_CHANGED', message: 'Balances changed, refresh and retry' });
        }
        await tx.groupSettlement.create({
          data: {
            groupId,
            fromMemberId: dto.fromMemberId,
            toMemberId: dto.toMemberId,
            // Clamped to min(owed, owed-to): the cent of tolerance never flips a sign.
            amount: check.amount,
            method: dto.method ?? null,
            recordedByMemberId: actor.id,
            clientRequestId: dto.clientRequestId,
          },
        });
      });
    } catch (e) {
      if (isP2002(e)) return this.getDetail(groupId, actor.id);
      throw e;
    }
    this.notifyActivity(groupId, actor.id);
    return this.getDetail(groupId, actor.id);
  }

  async voidSettlement(groupId: string, memberId: string, settlementId: string): Promise<GroupDetail> {
    const actor = await this.resolveActor(groupId, memberId);
    const s = await this.prisma.groupSettlement.findFirst({
      where: { id: settlementId, groupId, voidedAt: null },
      select: { id: true, recordedByMemberId: true, toMemberId: true },
    });
    if (!s) throw new NotFoundException('Settlement not found');
    if (!actor.isOwner && s.recordedByMemberId !== actor.id && s.toMemberId !== actor.id) {
      throw new ForbiddenException('Only the recorder, the receiver or the owner can void this payment');
    }
    await this.prisma.$transaction(async (tx: any) => {
      await tx.groupSettlement.update({
        where: { id: s.id },
        data: { voidedAt: new Date(), voidedByMemberId: actor.id },
      });
      await tx.expenseGroup.update({ where: { id: groupId }, data: { ledgerVersion: { increment: 1 } } });
    });
    return this.getDetail(groupId, actor.id);
  }

  // ------------------------------------------------------- guest -> user link

  /**
   * Binds the caller to the guest member a `POST /g/:token/link` code was minted for. The code is
   * single-use: `getAndDelete` is an atomic GETDEL, so two concurrent redeemers cannot both win.
   * Its null return also covers a Redis outage, which denies, as it should.
   */
  async linkGuest(userId: string, code: string): Promise<GroupDetail> {
    const payload = await this.cache.getAndDelete<{
      groupId: string;
      memberId: string;
      guestToken?: string;
      claim?: string;
    }>(`grp:link:${code}`);
    const gone = () =>
      new GoneException({ code: 'LINK_CODE_INVALID', message: 'This link code is invalid or has expired' });
    // A payload without `claim` predates ABA-651 (10-minute TTL): refused like any stale code.
    if (!payload?.groupId || !payload?.memberId || !payload?.guestToken || !payload?.claim) throw gone();

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
      select: { id: true, userId: true, claimTokenHash: true },
    });
    if (!member || member.userId) throw gone();
    // ABA-651: the code is only as good as the claim it was minted under. A reset (or forget, or a
    // re-claim by another device) changed the hash, so the code no longer proves anything.
    if (!member.claimTokenHash || linkClaimBinding(member.claimTokenHash) !== payload.claim) throw gone();

    const existing = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId: payload.groupId, userId },
      select: { id: true, displayName: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: `You're already in this group as ${existing.displayName}`,
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
