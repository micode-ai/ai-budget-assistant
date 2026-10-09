import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { invalidateExpenseChatCache } from '../expenses/expense-cache.util';
import {
  candidateKeyOf,
  legKeyOf,
  legSide,
  mirrorStartFor,
  MIRROR_SUGGEST_DAYS,
  pairKeyOf,
  planCashLinks,
  planShareRows,
  type CashCandidate,
  type CashLeg,
} from './group-budget-mirror';
import type {
  CreateGroupCashLinkDto,
  GroupBudgetLinksView,
  GroupBudgetMirrorPauseReason,
  GroupBudgetMirrorView,
  GroupCashLegKind,
  GroupCashLegView,
  GroupCashPersonalRowView,
  GroupShareRowView,
  SetGroupBudgetMirrorDto,
} from '@budget/shared-types';

const DAY_MS = 86_400_000;
const isP2002 = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10);
/** At most this many personal rows are read as candidates per pass (a month of one account). */
const MAX_CANDIDATES = 1000;
/** Deterministic, so a month with more rows than the cap never flips which ones are considered. */
const CANDIDATE_ORDER = [{ date: 'desc' as const }, { id: 'asc' as const }];
/** One "someone added a payment that may be yours" push per member and group per this many seconds. */
const SUGGESTION_PUSH_COALESCE_SECONDS = 600;

/**
 * Who may be linked: an ordinary row of mine that no other mechanism accounts for already. A debt,
 * a debt repayment, a planned purchase, a row already flagged (a receipt split's receivable or
 * another group's leg), a share row, or a receipt with a live split can never be a group cash leg.
 */
const LINKABLE_EXPENSE = {
  isDeleted: false,
  isDebt: false,
  isDebtRepayment: false,
  isSplitReceivable: false,
  isPlanned: false,
  source: { not: 'group' },
  groupCashLink: { is: null },
  splitParticipants: { none: { cancelledAt: null } },
} as const;
const LINKABLE_INCOME = {
  isDeleted: false,
  isDebt: false,
  isDebtRepayment: false,
  isSplitReceivable: false,
  groupCashLink: { is: null },
} as const;

/**
 * ABA-660 review L2: clearing `isSplitReceivable` is only ever the mirror undoing ITS OWN flag. A row
 * that is a receipt with live split participants carries the flag for the receipt split, so a clear
 * is refused for it whatever a link row says.
 */
const NOT_A_LIVE_RECEIPT_SPLIT = { splitParticipants: { none: { cancelledAt: null } } } as const;

type Eligibility =
  | { ok: true; account: { id: string; currencyCode: string; type: string; role: string } }
  | { ok: false; reason: GroupBudgetMirrorPauseReason };

interface MirrorMember {
  id: string;
  groupId: string;
  userId: string;
  budgetMirrorFrom: Date;
  budgetAccountId: string;
  budgetCategoryId: string | null;
  group: { id: string; name: string; currencyCode: string };
}

interface LegData {
  legs: CashLeg[];
  labels: Map<string, string>;
  expenses: Array<{ id: string; description: string; date: Date; share: number; addedByMe: boolean; addedByName: string | null }>;
}

/**
 * "Count my share in my budget" (ABA-660, phase-2 spec H2). A member opts in per group with a target
 * account and category; from then on every group expense dated from the start of that month with a
 * share of theirs is one ordinary personal `source: 'group'` expense for THAT share, and each of their
 * group cash legs that is linked to a personal row marks that row `isSplitReceivable` (never `isDebt`),
 * so a card payment for a 200 dinner of which my share is 50 counts 50, not 250.
 *
 * Everything here is idempotent and re-derived from the ledger: `reconcileMember` is called post-commit
 * (fire-and-forget) after every group ledger write, after every personal expense/income create and
 * import, and by the daily sweep (`GroupBudgetMirrorCron`), which catches whatever a lost call missed.
 *
 * It never writes into an account the member cannot write (viewer, gone, archived, deactivated, or
 * end-to-end encrypted, since these rows are plaintext): the mirror is then `paused` and nothing moves.
 */
@Injectable()
export class GroupBudgetMirrorService {
  private readonly logger = new Logger(GroupBudgetMirrorService.name);

  constructor(
    private readonly prisma: PrismaService,
    // The existing singleton (CurrencyExchangeModule), never a second instance.
    private readonly rates: ExchangeRateService,
    private readonly cache: CacheService,
    // Optional so specs that never push can omit it; the global NotificationsModule always provides it.
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ triggers

  /** After any group ledger write (create/edit/delete, claims, merge, settle, void). Never throws. */
  afterLedgerWrite(groupId: string): void {
    void this.reconcileGroup(groupId).catch(logFireAndForget(this.logger, 'GroupBudgetMirrorService.afterLedgerWrite'));
  }

  /** After a personal expense/income create or an import into `accountId`. Never throws. */
  afterPersonalWrite(accountId: string, userId: string): void {
    void this.reconcileForAccount(accountId, userId).catch(
      logFireAndForget(this.logger, 'GroupBudgetMirrorService.afterPersonalWrite'),
    );
  }

  async reconcileGroup(groupId: string): Promise<void> {
    const members = await this.prisma.expenseGroupMember.findMany({
      where: { groupId, removedAt: null, userId: { not: null }, budgetMirrorFrom: { not: null } },
      select: { id: true },
    });
    for (const m of members) await this.reconcileMember(m.id);
  }

  async reconcileForAccount(accountId: string, userId: string): Promise<void> {
    const members = await this.prisma.expenseGroupMember.findMany({
      where: { userId, budgetAccountId: accountId, removedAt: null, budgetMirrorFrom: { not: null } },
      select: { id: true },
    });
    for (const m of members) await this.reconcileMember(m.id);
  }

  // ------------------------------------------------------------------ eligibility

  /** The target account, re-checked on EVERY pass: a live member of it, not a viewer, plaintext, usable. */
  async checkAccount(userId: string, accountId: string): Promise<Eligibility> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        isActive: true,
        encryptionTier: true,
        currencyCode: true,
        type: true,
        tripStatus: true,
        members: { where: { userId }, select: { role: true } },
      },
    });
    if (!account || !account.members?.length || account.isActive === false) return { ok: false, reason: 'account_unavailable' };
    if (account.members[0].role === 'viewer') return { ok: false, reason: 'viewer' };
    // Tier 1 too, not only tier 2: the server writes `description` (a tier-1 encrypted field) in plaintext.
    if ((account.encryptionTier ?? 0) >= 1) return { ok: false, reason: 'encrypted' };
    if (account.type === 'trip' && account.tripStatus === 'archived') return { ok: false, reason: 'archived' };
    return {
      ok: true,
      account: { id: account.id, currencyCode: account.currencyCode, type: account.type, role: account.members[0].role },
    };
  }

  private refuse(reason: GroupBudgetMirrorPauseReason): never {
    if (reason === 'account_unavailable') {
      // Not a member, or no such account: one answer, so an id never confirms a foreign account exists.
      throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' });
    }
    if (reason === 'viewer') {
      throw new ForbiddenException({ code: 'MIRROR_ACCOUNT_READ_ONLY', message: 'You can only view that account' });
    }
    if (reason === 'encrypted') {
      throw new ForbiddenException({
        code: 'MIRROR_ACCOUNT_ENCRYPTED',
        message: 'An end-to-end encrypted account cannot receive group shares',
      });
    }
    throw new ForbiddenException({ code: 'MIRROR_ACCOUNT_ARCHIVED', message: 'That account is archived' });
  }

  private async mirrorMember(memberId: string): Promise<MirrorMember | null> {
    const m = await this.prisma.expenseGroupMember.findFirst({
      where: {
        id: memberId,
        removedAt: null,
        userId: { not: null },
        budgetMirrorFrom: { not: null },
        budgetAccountId: { not: null },
      },
      select: {
        id: true,
        groupId: true,
        userId: true,
        budgetMirrorFrom: true,
        budgetAccountId: true,
        budgetCategoryId: true,
        group: { select: { id: true, name: true, currencyCode: true } },
      },
    });
    return (m as MirrorMember | null) ?? null;
  }

  // ------------------------------------------------------------------ routes: on / off

  async getMirror(groupId: string, memberId: string, userId: string): Promise<GroupBudgetMirrorView> {
    return this.viewOf(groupId, memberId, userId);
  }

  /**
   * PUT /groups/:groupId/budget-mirror. The account is re-scoped to the caller's memberships (a foreign
   * id is the same 404 as a missing one), must be writable (owner/editor) and plaintext (tier 0); the
   * category must be an expense category of that account. Same account again keeps `from` and changes
   * only the category for new rows; another account first tears the old one down in the same transaction.
   */
  async enable(groupId: string, memberId: string, userId: string, dto: SetGroupBudgetMirrorDto): Promise<GroupBudgetMirrorView> {
    const member = await this.prisma.expenseGroupMember.findFirst({
      where: { id: memberId, groupId, userId, removedAt: null },
      select: { id: true, budgetAccountId: true, budgetMirrorFrom: true },
    });
    if (!member) throw new NotFoundException('Group not found');

    const target = await this.checkAccount(userId, dto.accountId);
    if (!target.ok) this.refuse(target.reason);
    // ABA-660 review M3: share rows and flagged legs are visible to, and change the figures of, every
    // member of a shared account, so only its OWNER may point the mirror at one. An editor may still
    // use their own single-member personal account.
    if (target.account.role !== 'owner') {
      const memberCount = await this.prisma.accountMember.count({ where: { accountId: dto.accountId } });
      if (target.account.type !== 'personal' || memberCount > 1) {
        throw new ForbiddenException({
          code: 'MIRROR_ACCOUNT_SHARED_NEEDS_OWNER',
          message: 'Only the owner of a shared account can count group shares in it',
        });
      }
    }

    let categoryId: string | null = null;
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: {
          id: dto.categoryId,
          isDeleted: false,
          type: 'expense',
          OR: [{ accountId: dto.accountId }, { accountId: null, isSystem: true }],
        },
        select: { id: true },
      });
      if (!cat) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
      categoryId = cat.id;
    }

    const sameAccount = member.budgetMirrorFrom != null && member.budgetAccountId === dto.accountId;
    await this.prisma.$transaction(async (tx: any) => {
      if (member.budgetMirrorFrom != null && member.budgetAccountId && !sameAccount) {
        await this.teardown(tx, member.id, userId, member.budgetAccountId);
      }
      await tx.expenseGroupMember.update({
        where: { id: member.id },
        data: {
          budgetMirrorFrom: sameAccount ? member.budgetMirrorFrom : mirrorStartFor(new Date()),
          budgetAccountId: dto.accountId,
          budgetCategoryId: categoryId,
        },
      });
    });
    await this.reconcileMember(member.id);
    return this.viewOf(groupId, member.id, userId);
  }

  /**
   * DELETE /groups/:groupId/budget-mirror: the share rows are removed and every leg unlinked in ONE
   * transaction, so the books return to the plain cash model with nothing half-applied. When the
   * account can no longer be written, that account is left exactly as it was (never a write into an
   * account the user cannot write) and only the group side is cleared.
   */
  async disable(groupId: string, memberId: string, userId: string): Promise<void> {
    // A removed member is allowed here too (cleanup), unlike every other mirror route.
    const member = await this.prisma.expenseGroupMember.findFirst({
      where: { id: memberId, groupId, userId },
      select: { id: true, budgetAccountId: true, budgetMirrorFrom: true },
    });
    if (!member) throw new NotFoundException('Group not found');
    await this.prisma.$transaction(async (tx: any) => {
      if (member.budgetAccountId) await this.teardown(tx, member.id, userId, member.budgetAccountId);
      await tx.expenseGroupMember.update({
        where: { id: member.id },
        data: { budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
      });
    });
  }

  /** Every mirror in a group, before the group is hard-deleted (the ledger rows go with it). */
  async teardownGroup(tx: any, groupId: string): Promise<void> {
    const members = await tx.expenseGroupMember.findMany({
      where: { groupId, userId: { not: null }, budgetAccountId: { not: null } },
      select: { id: true, userId: true, budgetAccountId: true },
    });
    for (const m of members) await this.teardown(tx, m.id, m.userId, m.budgetAccountId);
  }

  /**
   * ABA-660 review H2: called inside the transaction that sets `removedAt` (leave, owner removal), so a
   * removed member's share rows and flagged legs never outlive them. A no-op for a member with no
   * mirror (and for a guest row, which has no user to mirror for).
   */
  async teardownMember(tx: any, memberId: string): Promise<void> {
    const m = await tx.expenseGroupMember.findFirst({
      where: { id: memberId },
      select: { id: true, userId: true, budgetAccountId: true, budgetMirrorFrom: true },
    });
    if (!m || !m.userId || !m.budgetAccountId) return;
    await this.teardown(tx, m.id, m.userId, m.budgetAccountId);
    await tx.expenseGroupMember.update({
      where: { id: m.id },
      data: { budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
    });
  }

  /**
   * Never leaves an `isSplitReceivable` row without a link behind it (ABA-660 review M1). The flag is
   * cleared without the "account is writable" check, since clearing only restores a row to "counted";
   * it is cleared only on rows a mirror link names (so only ones the mirror itself flagged) and never
   * on a receipt with live split participants (L2). Share rows are removed when the user is still a
   * member of the account (any role: they are the mirror's own rows); when they are not, those rows
   * are left alone, the flags are cleared and the links dropped.
   */
  private async teardown(tx: any, memberId: string, userId: string, accountId: string): Promise<void> {
    const acct = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, members: { where: { userId }, select: { role: true } } },
    });
    const stillMember = !!acct?.members?.length;
    if (stillMember) {
      await tx.expense.updateMany({
        where: { groupMemberId: memberId, accountId, isDeleted: false },
        data: { isDeleted: true, groupExpenseId: null, groupMemberId: null, groupShareAmount: null, syncVersion: { increment: 1 } },
      });
      // The rows the user had deleted themselves: detached, so a later opt-in starts clean.
      await tx.expense.updateMany({
        where: { groupMemberId: memberId, accountId },
        data: { groupExpenseId: null, groupMemberId: null, groupShareAmount: null },
      });
    }
    const links = await tx.groupCashLink.findMany({ where: { memberId }, select: { expenseId: true, incomeId: true } });
    const expenseIds = links.map((l: any) => l.expenseId).filter(Boolean);
    const incomeIds = links.map((l: any) => l.incomeId).filter(Boolean);
    if (expenseIds.length) {
      await tx.expense.updateMany({
        where: { id: { in: expenseIds }, userId, isSplitReceivable: true, ...NOT_A_LIVE_RECEIPT_SPLIT },
        data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
      });
    }
    if (incomeIds.length) {
      await tx.income.updateMany({
        where: { id: { in: incomeIds }, userId, isSplitReceivable: true },
        data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
      });
    }
    await tx.groupCashLink.deleteMany({ where: { memberId } });
    await tx.groupCashSuggestion.deleteMany({ where: { memberId } });
    this.bustCaches(accountId);
  }

  private bustCaches(accountId: string): void {
    void invalidateExpenseChatCache(this.cache, accountId).catch(
      logFireAndForget(this.logger, 'GroupBudgetMirrorService.invalidateExpenseChatCache'),
    );
  }

  // ------------------------------------------------------------------ the reconciler

  /** Idempotent. Returns the mirror's status after the pass. */
  async reconcileMember(memberId: string): Promise<'off' | 'paused' | 'active'> {
    const m = await this.mirrorMember(memberId);
    if (!m) return 'off';
    const elig = await this.checkAccount(m.userId, m.budgetAccountId);
    if (!elig.ok) return 'paused';
    const data = await this.loadLegs(m);
    const changedRows = await this.syncShareRows(m, elig.account, data);
    const changedLinks = await this.syncCashLinks(m, elig.account, data.legs);
    if (changedRows || changedLinks) this.bustCaches(m.budgetAccountId);
    return 'active';
  }

  private async loadLegs(m: MirrorMember): Promise<LegData> {
    const from = m.budgetMirrorFrom;
    const [expenses, settlements, members] = await Promise.all([
      this.prisma.groupExpense.findMany({
        where: { groupId: m.groupId, deletedAt: null, date: { gte: from } },
        select: {
          id: true,
          description: true,
          date: true,
          amount: true,
          originalAmount: true,
          originalCurrency: true,
          paidByMemberId: true,
          createdByMemberId: true,
          shares: { where: { memberId: m.id }, select: { shareAmount: true } },
        },
      }),
      this.prisma.groupSettlement.findMany({
        where: {
          groupId: m.groupId,
          voidedAt: null,
          createdAt: { gte: from },
          OR: [{ fromMemberId: m.id }, { toMemberId: m.id }],
        },
        select: { id: true, fromMemberId: true, toMemberId: true, amount: true, createdAt: true, recordedByMemberId: true },
      }),
      this.prisma.expenseGroupMember.findMany({ where: { groupId: m.groupId }, select: { id: true, displayName: true } }),
    ]);
    const names = new Map((members ?? []).map((x: any) => [x.id, x.displayName as string]));
    const legs: CashLeg[] = [];
    const labels = new Map<string, string>();
    for (const e of expenses ?? []) {
      if (e.paidByMemberId !== m.id) continue;
      const key = legKeyOf('payer_expense', e.id);
      // The card was charged in the currency it was entered in (ABA-654), so that is what is matched.
      legs.push({
        key,
        kind: 'payer_expense',
        refId: e.id,
        amount: Number(e.originalAmount ?? e.amount),
        currencyCode: e.originalCurrency ?? m.group.currencyCode,
        date: new Date(e.date),
        authoredByMe: e.createdByMemberId === m.id,
        addedByName: names.get(e.createdByMemberId) ?? null,
      });
      labels.set(key, e.description);
    }
    for (const s of settlements ?? []) {
      const kind: GroupCashLegKind = s.fromMemberId === m.id ? 'settlement_out' : 'settlement_in';
      const key = legKeyOf(kind, s.id);
      legs.push({
        key,
        kind,
        refId: s.id,
        amount: Number(s.amount),
        currencyCode: m.group.currencyCode,
        date: new Date(s.createdAt),
        authoredByMe: s.recordedByMemberId === m.id,
        addedByName: names.get(s.recordedByMemberId) ?? null,
      });
      labels.set(key, names.get(kind === 'settlement_out' ? s.toMemberId : s.fromMemberId) ?? '');
    }
    return {
      legs,
      labels,
      expenses: (expenses ?? []).map((e: any) => ({
        id: e.id,
        description: e.description,
        date: new Date(e.date),
        share: Number(e.shares?.[0]?.shareAmount ?? 0),
        addedByMe: e.createdByMemberId === m.id,
        addedByName: names.get(e.createdByMemberId) ?? null,
      })),
    };
  }

  /**
   * One row per group expense with my share > 0. Amount = my share, converted into the account's
   * currency when it differs and a rate is known (budgets compare in their own currency); with no rate
   * the row keeps the group currency, labelled as such, never a mislabelled figure. Re-priced only when
   * the share moves, so a rate change never rewrites a booked row.
   */
  private async syncShareRows(m: MirrorMember, account: { id: string; currencyCode: string }, data: LegData): Promise<boolean> {
    const existing = await this.prisma.expense.findMany({
      where: { groupMemberId: m.id, accountId: account.id, groupExpenseId: { not: null } },
      select: { id: true, groupExpenseId: true, isDeleted: true, date: true, groupShareAmount: true },
    });
    const plan = planShareRows(
      data.expenses.map((e) => ({ groupExpenseId: e.id, share: e.share, date: e.date })),
      (existing ?? []).map((r: any) => ({
        id: r.id,
        groupExpenseId: r.groupExpenseId,
        isDeleted: r.isDeleted,
        date: new Date(r.date),
        groupShareAmount: r.groupShareAmount == null ? null : Number(r.groupShareAmount),
      })),
    );
    const needsPrice = plan.create.length > 0 || plan.update.some((u) => u.reprice);
    const groupCurrency = m.group.currencyCode;
    const rates =
      needsPrice && account.currencyCode !== groupCurrency ? await getRatesSafe(this.rates, account.currencyCode) : null;
    const price = (share: number) => {
      const converted = convertAmount(share, groupCurrency, account.currencyCode, rates);
      return converted == null ? { amount: share, currencyCode: groupCurrency } : { amount: converted, currencyCode: account.currencyCode };
    };
    const desc = new Map(data.expenses.map((e) => [e.id, e.description]));

    for (const d of plan.create) {
      try {
        await this.prisma.expense.create({
          data: {
            // Server-created rows need a non-null clientId (ABA-351); the device pulls them like any row.
            clientId: randomUUID(),
            userId: m.userId,
            paidByUserId: m.userId,
            accountId: account.id,
            categoryId: m.budgetCategoryId,
            ...price(d.share),
            description: `${m.group.name}: ${desc.get(d.groupExpenseId) ?? ''}`.slice(0, 200),
            date: d.date,
            source: 'group',
            groupExpenseId: d.groupExpenseId,
            groupMemberId: m.id,
            groupShareAmount: d.share,
          },
        });
      } catch (e) {
        // A concurrent pass created it first: the unique (groupExpenseId, groupMemberId, accountId) is the dedup.
        if (!isP2002(e)) throw e;
      }
    }
    for (const u of plan.update) {
      await this.prisma.expense.updateMany({
        where: { id: u.id, isDeleted: false },
        data: {
          ...(u.reprice ? { ...price(u.desired.share), groupShareAmount: u.desired.share } : {}),
          date: u.desired.date,
          syncVersion: { increment: 1 },
        },
      });
    }
    if (plan.remove.length) {
      await this.prisma.expense.updateMany({
        where: { id: { in: plan.remove }, isDeleted: false },
        data: { isDeleted: true, groupExpenseId: null, groupMemberId: null, groupShareAmount: null, syncVersion: { increment: 1 } },
      });
    }
    if (plan.detach.length) {
      await this.prisma.expense.updateMany({
        where: { id: { in: plan.detach }, isDeleted: true },
        data: { groupExpenseId: null, groupMemberId: null, groupShareAmount: null },
      });
    }
    return plan.create.length + plan.update.length + plan.remove.length > 0;
  }

  /** Drops links whose leg or row is gone, then runs the two tiers over what is still unlinked. */
  private async syncCashLinks(m: MirrorMember, account: { id: string }, legs: CashLeg[]): Promise<boolean> {
    let changed = false;
    const legMap = new Map(legs.map((l) => [l.key, l]));
    const links = await this.prisma.groupCashLink.findMany({
      where: { memberId: m.id },
      select: {
        id: true,
        legKey: true,
        expenseId: true,
        incomeId: true,
        expense: { select: { isDeleted: true, accountId: true } },
        income: { select: { isDeleted: true, accountId: true } },
      },
    });
    const linked = new Set<string>();
    for (const link of links ?? []) {
      const row = link.expense ?? link.income;
      const stale = !legMap.has(link.legKey) || !row || row.isDeleted || row.accountId !== account.id;
      if (!stale) {
        linked.add(link.legKey);
        continue;
      }
      await this.prisma.$transaction(async (tx: any) => {
        await tx.groupCashLink.deleteMany({ where: { id: link.id } });
        // Back to an ordinary counted row, but only in the mirror's own account (writable, checked above).
        if (link.expenseId) {
          await tx.expense.updateMany({
            where: { id: link.expenseId, accountId: account.id, isSplitReceivable: true, ...NOT_A_LIVE_RECEIPT_SPLIT },
            data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
          });
        }
        if (link.incomeId) {
          await tx.income.updateMany({
            where: { id: link.incomeId, accountId: account.id, isSplitReceivable: true },
            data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
          });
        }
      });
      changed = true;
    }

    const unlinked = legs.filter((l) => !linked.has(l.key));
    const openSuggestions = await this.prisma.groupCashSuggestion.findMany({
      where: { memberId: m.id, status: 'open' },
      select: { id: true, legKey: true, candidateKey: true },
    });
    if (!unlinked.length) {
      if (openSuggestions?.length) {
        await this.prisma.groupCashSuggestion.deleteMany({ where: { memberId: m.id, status: 'open' } });
      }
      return changed;
    }

    const candidates = await this.loadCandidates(m, account.id, unlinked);
    const rejected = await this.prisma.groupCashSuggestion.findMany({
      where: { memberId: m.id, status: 'rejected' },
      select: { legKey: true, candidateKey: true },
    });
    const plan = planCashLinks(unlinked, candidates, new Set((rejected ?? []).map((r: any) => pairKeyOf(r.legKey, r.candidateKey))));

    const autoLegs = new Set<string>();
    for (const { leg, candidate } of plan.auto) {
      try {
        await this.linkPair(m, account.id, leg, candidate, 'auto');
        autoLegs.add(leg.key);
        changed = true;
      } catch (e) {
        // Lost a race (the row was flagged, linked or deleted meanwhile): the next pass re-plans it.
        this.logger.debug(`auto-link skipped for ${leg.key}: ${(e as Error).message}`);
      }
    }

    const wanted = plan.suggestions.filter((s) => !autoLegs.has(s.leg.key));
    const wantedKeys = new Set(wanted.map((s) => pairKeyOf(s.leg.key, s.candidate.key)));
    const staleIds = (openSuggestions ?? [])
      .filter((s: any) => !wantedKeys.has(pairKeyOf(s.legKey, s.candidateKey)))
      .map((s: any) => s.id);
    if (staleIds.length) await this.prisma.groupCashSuggestion.deleteMany({ where: { id: { in: staleIds } } });
    const have = new Set((openSuggestions ?? []).map((s: any) => pairKeyOf(s.legKey, s.candidateKey)));
    const toCreate = wanted.filter((s) => !have.has(pairKeyOf(s.leg.key, s.candidate.key)));
    if (toCreate.length) {
      await this.prisma.groupCashSuggestion.createMany({
        data: toCreate.map(({ leg, candidate }) => ({
          memberId: m.id,
          kind: leg.kind,
          legKey: leg.key,
          ...this.legRef(leg),
          candidateKey: candidate.key,
          ...(candidate.side === 'expense' ? { expenseId: candidate.id } : { incomeId: candidate.id }),
          status: 'open',
        })),
        skipDuplicates: true,
      });
      // ABA-660 review H1: a payment someone else wrote that may be mine is only ever offered, so tell me.
      if (toCreate.some((t) => !t.leg.authoredByMe)) this.notifyForeignSuggestion(m);
    }
    return changed;
  }

  /** Coalesced, fire-and-forget group_activity push to the mirroring member. Never throws. */
  private notifyForeignSuggestion(m: MirrorMember): void {
    const notifications = this.notifications;
    if (!notifications) return;
    void (async () => {
      if (!(await this.cache.setIfAbsent(`grp:sugg:${m.groupId}:${m.userId}`, SUGGESTION_PUSH_COALESCE_SECONDS))) return;
      await notifications.sendToUser(
        m.userId,
        (lang: string) => ni18n.groupActivityTitle(lang, m.group.name),
        (lang: string) => ni18n.groupActivityBody(lang),
        { groupId: m.groupId },
        'group_activity',
      );
    })().catch(logFireAndForget(this.logger, 'GroupBudgetMirrorService.notifyForeignSuggestion'));
  }

  private legRef(leg: CashLeg) {
    return leg.kind === 'payer_expense' ? { groupExpenseId: leg.refId } : { settlementId: leg.refId };
  }

  private async loadCandidates(m: MirrorMember, accountId: string, legs: CashLeg[]): Promise<CashCandidate[]> {
    const span = (side: 'expense' | 'income') => {
      const mine = legs.filter((l) => legSide(l.kind) === side);
      if (!mine.length) return null;
      const t = mine.map((l) => l.date.getTime());
      return {
        currencies: [...new Set(mine.map((l) => l.currencyCode))],
        gte: new Date(Math.min(...t) - MIRROR_SUGGEST_DAYS * DAY_MS),
        lte: new Date(Math.max(...t) + MIRROR_SUGGEST_DAYS * DAY_MS),
      };
    };
    const ex = span('expense');
    const inc = span('income');
    const select = { id: true, amount: true, currencyCode: true, date: true } as const;
    const [expenses, incomes] = await Promise.all([
      ex
        ? this.prisma.expense.findMany({
            where: {
              accountId,
              userId: m.userId,
              ...LINKABLE_EXPENSE,
              currencyCode: { in: ex.currencies },
              date: { gte: ex.gte, lte: ex.lte },
            },
            select,
            orderBy: CANDIDATE_ORDER,
            take: MAX_CANDIDATES,
          })
        : Promise.resolve([]),
      inc
        ? this.prisma.income.findMany({
            where: {
              accountId,
              userId: m.userId,
              ...LINKABLE_INCOME,
              currencyCode: { in: inc.currencies },
              date: { gte: inc.gte, lte: inc.lte },
            },
            select,
            orderBy: CANDIDATE_ORDER,
            take: MAX_CANDIDATES,
          })
        : Promise.resolve([]),
    ]);
    const toCandidate = (side: 'expense' | 'income') => (r: any): CashCandidate => ({
      key: candidateKeyOf(side, r.id),
      side,
      id: r.id,
      amount: Number(r.amount),
      currencyCode: r.currencyCode,
      date: new Date(r.date),
    });
    return [...(expenses ?? []).map(toCandidate('expense')), ...(incomes ?? []).map(toCandidate('income'))];
  }

  /**
   * Link one leg to one row and flag the row, in one transaction. The flag is a CAS on the row still
   * being linkable (re-scoped to my user and the mirror's account), so a row that was flagged, deleted,
   * split or linked meanwhile is refused instead of being linked twice.
   */
  private async linkPair(
    m: MirrorMember,
    accountId: string,
    leg: CashLeg,
    candidate: { side: 'expense' | 'income'; id: string; key: string },
    origin: 'auto' | 'user',
  ): Promise<void> {
    // Defence in depth for H1: an automatic link is only ever for a leg the member wrote themself.
    if (origin === 'auto' && !leg.authoredByMe) {
      throw new ConflictException({ code: 'LEG_NOT_AUTHORED', message: 'Only a suggestion for a payment someone else added' });
    }
    await this.prisma.$transaction(async (tx: any) => {
      const flagged =
        candidate.side === 'expense'
          ? await tx.expense.updateMany({
              where: { id: candidate.id, accountId, userId: m.userId, ...LINKABLE_EXPENSE },
              data: { isSplitReceivable: true, syncVersion: { increment: 1 } },
            })
          : await tx.income.updateMany({
              where: { id: candidate.id, accountId, userId: m.userId, ...LINKABLE_INCOME },
              data: { isSplitReceivable: true, syncVersion: { increment: 1 } },
            });
      if (flagged.count !== 1) {
        throw new ConflictException({ code: 'ROW_NOT_LINKABLE', message: 'That transaction cannot be linked' });
      }
      await tx.groupCashLink.create({
        data: {
          memberId: m.id,
          kind: leg.kind,
          legKey: leg.key,
          ...this.legRef(leg),
          ...(candidate.side === 'expense' ? { expenseId: candidate.id } : { incomeId: candidate.id }),
          origin,
        },
      });
      // The leg and the row are spoken for: their other open suggestions go.
      await tx.groupCashSuggestion.deleteMany({
        where: { memberId: m.id, status: 'open', OR: [{ legKey: leg.key }, { candidateKey: candidate.key }] },
      });
    });
  }

  // ------------------------------------------------------------------ routes: links

  /** The member's mirror for a link write: on, and its account writable right now. */
  private async writableMirror(groupId: string, memberId: string, userId: string): Promise<MirrorMember> {
    const m = await this.mirrorMember(memberId);
    if (!m || m.groupId !== groupId || m.userId !== userId) {
      throw new ConflictException({ code: 'MIRROR_OFF', message: 'Count my share in my budget is off for this group' });
    }
    const elig = await this.checkAccount(userId, m.budgetAccountId);
    if (!elig.ok) this.refuse(elig.reason);
    return m;
  }

  async getLinks(groupId: string, memberId: string, userId: string): Promise<GroupBudgetLinksView> {
    const mirror = await this.viewOf(groupId, memberId, userId);
    const m = await this.mirrorMember(memberId);
    if (!m || m.groupId !== groupId || m.userId !== userId) return { mirror, links: [], suggestions: [], unlinked: [] };
    // ABA-660 review M4: while paused (viewer, encrypted, archived, no longer a member) the mirror's
    // account is not shown to me any more, so no personal row of it is returned, only the status.
    if (mirror.status !== 'active') return { mirror, links: [], suggestions: [], unlinked: [], shareRows: [] };
    const { legs, labels, expenses: groupExpenses } = await this.loadLegs(m);
    const legView = (l: CashLeg): GroupCashLegView => ({
      kind: l.kind,
      groupExpenseId: l.kind === 'payer_expense' ? l.refId : null,
      settlementId: l.kind === 'payer_expense' ? null : l.refId,
      label: labels.get(l.key) ?? '',
      amount: l.amount,
      currencyCode: l.currencyCode,
      date: iso(l.date),
      addedByOther: !l.authoredByMe,
      addedByName: l.authoredByMe ? null : l.addedByName ?? null,
    });
    const legMap = new Map(legs.map((l) => [l.key, l]));
    const rowSelect = { id: true, amount: true, currencyCode: true, date: true, description: true, isDeleted: true, accountId: true } as const;
    const [links, suggestions] = await Promise.all([
      this.prisma.groupCashLink.findMany({
        where: { memberId: m.id },
        select: {
          id: true,
          legKey: true,
          origin: true,
          expense: { select: { ...rowSelect, merchant: true, source: true } },
          income: { select: { ...rowSelect, source: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.groupCashSuggestion.findMany({
        where: { memberId: m.id, status: 'open' },
        select: {
          id: true,
          legKey: true,
          expense: { select: { ...rowSelect, merchant: true, source: true, isSplitReceivable: true } },
          income: { select: { ...rowSelect, source: true, isSplitReceivable: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const personal = (e: any, i: any): GroupCashPersonalRowView | null => {
      const r = e ?? i;
      if (!r || r.isDeleted || r.accountId !== m.budgetAccountId) return null;
      return {
        expenseId: e ? e.id : null,
        incomeId: e ? null : i.id,
        amount: Number(r.amount),
        currencyCode: r.currencyCode,
        date: iso(r.date),
        description: r.description ?? null,
        merchant: e ? e.merchant ?? null : null,
        source: r.source,
      };
    };
    const linkViews = [];
    const linked = new Set<string>();
    for (const l of links ?? []) {
      const leg = legMap.get(l.legKey);
      const p = personal(l.expense, l.income);
      if (!leg || !p) continue; // stale: the next pass drops it
      linked.add(l.legKey);
      linkViews.push({ id: l.id, origin: l.origin, leg: legView(leg), personal: p });
    }
    const suggestionViews = [];
    for (const s of suggestions ?? []) {
      const leg = legMap.get(s.legKey);
      const p = personal(s.expense, s.income);
      if (!leg || !p || linked.has(s.legKey) || (s.expense ?? s.income)?.isSplitReceivable) continue;
      suggestionViews.push({ id: s.id, leg: legView(leg), personal: p });
    }
    // Share rows that came from an expense someone else added: the app shows "added by <name>".
    const foreign = new Map(groupExpenses.filter((e) => !e.addedByMe).map((e) => [e.id, e]));
    let shareRows: GroupShareRowView[] = [];
    if (foreign.size) {
      const rows = await this.prisma.expense.findMany({
        where: { groupMemberId: m.id, accountId: m.budgetAccountId, isDeleted: false, groupExpenseId: { in: [...foreign.keys()] } },
        select: { id: true, groupExpenseId: true, amount: true, currencyCode: true },
      });
      shareRows = (rows ?? []).map((r: any) => ({
        expenseId: r.id,
        groupExpenseId: r.groupExpenseId,
        amount: Number(r.amount),
        currencyCode: r.currencyCode,
        addedByOther: true,
        addedByName: foreign.get(r.groupExpenseId)?.addedByName ?? null,
      }));
    }
    return {
      mirror,
      links: linkViews,
      suggestions: suggestionViews,
      unlinked: legs.filter((l) => !linked.has(l.key)).map(legView),
      shareRows,
    };
  }

  /** POST /groups/:groupId/budget-links: link a leg of mine to a row of mine by hand. */
  async createLink(groupId: string, memberId: string, userId: string, dto: CreateGroupCashLinkDto): Promise<GroupBudgetLinksView> {
    const m = await this.writableMirror(groupId, memberId, userId);
    const refId = dto.kind === 'payer_expense' ? dto.groupExpenseId : dto.settlementId;
    const side = legSide(dto.kind);
    const rowId = side === 'expense' ? dto.expenseId : dto.incomeId;
    const wrongShape =
      !refId ||
      !rowId ||
      (dto.kind === 'payer_expense' ? dto.settlementId : dto.groupExpenseId) !== undefined ||
      (side === 'expense' ? dto.incomeId : dto.expenseId) !== undefined;
    if (wrongShape) throw new BadRequestException({ code: 'LINK_INVALID', message: 'That link does not fit this kind of payment' });
    await this.linkByHand(m, legKeyOf(dto.kind, refId as string), { side, id: rowId as string });
    return this.getLinks(groupId, memberId, userId);
  }

  /** POST .../budget-links/suggestions/:suggestionId/accept */
  async acceptSuggestion(groupId: string, memberId: string, userId: string, suggestionId: string): Promise<GroupBudgetLinksView> {
    const m = await this.writableMirror(groupId, memberId, userId);
    const s = await this.prisma.groupCashSuggestion.findFirst({
      where: { id: suggestionId, memberId: m.id, status: 'open' },
      select: { legKey: true, expenseId: true, incomeId: true },
    });
    if (!s) throw new NotFoundException({ code: 'SUGGESTION_NOT_FOUND', message: 'Suggestion not found' });
    await this.linkByHand(m, s.legKey, s.expenseId ? { side: 'expense', id: s.expenseId } : { side: 'income', id: s.incomeId as string });
    return this.getLinks(groupId, memberId, userId);
  }

  /** POST .../budget-links/suggestions/:suggestionId/reject: never offered or auto-linked again. */
  async rejectSuggestion(groupId: string, memberId: string, userId: string, suggestionId: string): Promise<GroupBudgetLinksView> {
    const m = await this.mirrorMember(memberId);
    if (!m || m.groupId !== groupId || m.userId !== userId) {
      throw new ConflictException({ code: 'MIRROR_OFF', message: 'Count my share in my budget is off for this group' });
    }
    const r = await this.prisma.groupCashSuggestion.updateMany({
      where: { id: suggestionId, memberId: m.id, status: 'open' },
      data: { status: 'rejected' },
    });
    if (r.count !== 1) throw new NotFoundException({ code: 'SUGGESTION_NOT_FOUND', message: 'Suggestion not found' });
    return this.getLinks(groupId, memberId, userId);
  }

  /**
   * DELETE .../budget-links/:linkId: the row counts again, and the pair is recorded as rejected so the
   * matcher never auto-links it back (an undo must stick).
   */
  async unlink(groupId: string, memberId: string, userId: string, linkId: string): Promise<GroupBudgetLinksView> {
    const m = await this.writableMirror(groupId, memberId, userId);
    const link = await this.prisma.groupCashLink.findFirst({
      where: { id: linkId, memberId: m.id },
      select: { id: true, kind: true, legKey: true, groupExpenseId: true, settlementId: true, expenseId: true, incomeId: true },
    });
    if (!link) throw new NotFoundException({ code: 'LINK_NOT_FOUND', message: 'Link not found' });
    const candidateKey = link.expenseId ? candidateKeyOf('expense', link.expenseId) : candidateKeyOf('income', link.incomeId as string);
    await this.prisma.$transaction(async (tx: any) => {
      await tx.groupCashLink.deleteMany({ where: { id: link.id } });
      if (link.expenseId) {
        await tx.expense.updateMany({
          where: { id: link.expenseId, accountId: m.budgetAccountId, userId, isSplitReceivable: true, ...NOT_A_LIVE_RECEIPT_SPLIT },
          data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
        });
      } else if (link.incomeId) {
        await tx.income.updateMany({
          where: { id: link.incomeId, accountId: m.budgetAccountId, userId, isSplitReceivable: true },
          data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
        });
      }
      await tx.groupCashSuggestion.upsert({
        where: { memberId_legKey_candidateKey: { memberId: m.id, legKey: link.legKey, candidateKey } },
        create: {
          memberId: m.id,
          kind: link.kind,
          legKey: link.legKey,
          groupExpenseId: link.groupExpenseId,
          settlementId: link.settlementId,
          candidateKey,
          expenseId: link.expenseId,
          incomeId: link.incomeId,
          status: 'rejected',
        },
        update: { status: 'rejected' },
      });
    });
    this.bustCaches(m.budgetAccountId);
    return this.getLinks(groupId, memberId, userId);
  }

  /** Shared by the manual link and an accepted suggestion: both ids re-scoped, then `linkPair`. */
  private async linkByHand(m: MirrorMember, legKey: string, row: { side: 'expense' | 'income'; id: string }): Promise<void> {
    const { legs } = await this.loadLegs(m);
    const leg = legs.find((l) => l.key === legKey);
    // A leg is only ever one of MY live movements in THIS group, inside the mirrored window.
    if (!leg || legSide(leg.kind) !== row.side) throw new NotFoundException({ code: 'LEG_NOT_FOUND', message: 'Payment not found' });
    const taken = await this.prisma.groupCashLink.findFirst({ where: { memberId: m.id, legKey }, select: { id: true } });
    if (taken) throw new ConflictException({ code: 'LEG_ALREADY_LINKED', message: 'That payment is already linked' });
    // Re-scoped to {me, the mirror's account}: a foreign or other-account id is a 404, never a link.
    const found =
      row.side === 'expense'
        ? await this.prisma.expense.findFirst({ where: { id: row.id, userId: m.userId, accountId: m.budgetAccountId, isDeleted: false }, select: { id: true } })
        : await this.prisma.income.findFirst({ where: { id: row.id, userId: m.userId, accountId: m.budgetAccountId, isDeleted: false }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: 'ROW_NOT_FOUND', message: 'Transaction not found' });
    const candidateKey = candidateKeyOf(row.side, row.id);
    await this.linkPair(m, m.budgetAccountId, leg, { side: row.side, id: row.id, key: candidateKey }, 'user');
    // An explicit link overrides an earlier "not this one".
    await this.prisma.groupCashSuggestion.deleteMany({ where: { memberId: m.id, legKey, candidateKey } });
    this.bustCaches(m.budgetAccountId);
  }

  // ------------------------------------------------------------------ views

  private async viewOf(groupId: string, memberId: string, userId: string): Promise<GroupBudgetMirrorView> {
    const row = await this.prisma.expenseGroupMember.findFirst({
      where: { id: memberId, groupId, userId, removedAt: null },
      select: { budgetMirrorFrom: true, budgetAccountId: true, budgetCategoryId: true },
    });
    if (!row) throw new NotFoundException('Group not found');
    if (!row.budgetMirrorFrom || !row.budgetAccountId) {
      return { status: 'off', pausedReason: null, accountId: null, categoryId: null, from: null, shareRowCount: 0 };
    }
    const [elig, shareRowCount] = await Promise.all([
      this.checkAccount(userId, row.budgetAccountId),
      this.prisma.expense.count({ where: { groupMemberId: memberId, accountId: row.budgetAccountId, isDeleted: false } }),
    ]);
    return {
      status: elig.ok ? 'active' : 'paused',
      pausedReason: elig.ok ? null : elig.reason,
      accountId: row.budgetAccountId,
      categoryId: row.budgetCategoryId ?? null,
      from: iso(row.budgetMirrorFrom),
      shareRowCount: shareRowCount ?? 0,
    };
  }
}
