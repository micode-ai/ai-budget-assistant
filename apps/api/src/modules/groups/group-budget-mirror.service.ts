import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { mirrorStartFor, planShareRows } from './group-budget-mirror';
import { GroupBudgetMirrorCashLinks } from './group-budget-mirror.links';
import { isP2002, type Eligibility, type LegData, type MirrorMember } from './group-budget-mirror.shared';
import { GroupBudgetMirrorSupport } from './group-budget-mirror.support';
import { GroupBudgetMirrorTeardown } from './group-budget-mirror.teardown';
import type {
  CreateGroupCashLinkDto,
  GroupBudgetLinksView,
  GroupBudgetMirrorView,
  SetGroupBudgetMirrorDto,
} from '@budget/shared-types';

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
  // Plain collaborators built here, so the module wiring and the constructor signature are unchanged.
  private readonly support: GroupBudgetMirrorSupport;
  private readonly teardownSvc: GroupBudgetMirrorTeardown;
  private readonly links: GroupBudgetMirrorCashLinks;

  constructor(
    private readonly prisma: PrismaService,
    // The existing singleton (CurrencyExchangeModule), never a second instance.
    private readonly rates: ExchangeRateService,
    private readonly cache: CacheService,
    // Optional so specs that never push can omit it; the global NotificationsModule always provides it.
    @Optional() notifications?: NotificationsService,
  ) {
    this.support = new GroupBudgetMirrorSupport(prisma, cache, this.logger);
    this.teardownSvc = new GroupBudgetMirrorTeardown(prisma, this.support);
    this.links = new GroupBudgetMirrorCashLinks(prisma, cache, this.support, this.logger, notifications);
  }

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


  async getMirror(groupId: string, memberId: string, userId: string): Promise<GroupBudgetMirrorView> {
    return this.support.viewOf(groupId, memberId, userId);
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

    const target = await this.support.checkAccount(userId, dto.accountId);
    if (!target.ok) this.support.refuse(target.reason);
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
        await this.teardownSvc.teardown(tx, member.id, userId, member.budgetAccountId);
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
    return this.support.viewOf(groupId, member.id, userId);
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
      if (member.budgetAccountId) await this.teardownSvc.teardown(tx, member.id, userId, member.budgetAccountId);
      await tx.expenseGroupMember.update({
        where: { id: member.id },
        data: { budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
      });
    });
  }

  /** Every mirror in a group, before the group is hard-deleted (the ledger rows go with it). */
  teardownGroup(tx: any, groupId: string): Promise<void> {
    return this.teardownSvc.teardownGroup(tx, groupId);
  }

  /** Called inside the transaction that sets `removedAt`; see `GroupBudgetMirrorTeardown`. */
  teardownMember(tx: any, memberId: string): Promise<void> {
    return this.teardownSvc.teardownMember(tx, memberId);
  }

  checkAccount(userId: string, accountId: string): Promise<Eligibility> {
    return this.support.checkAccount(userId, accountId);
  }

  getLinks(groupId: string, memberId: string, userId: string): Promise<GroupBudgetLinksView> {
    return this.links.getLinks(groupId, memberId, userId);
  }

  createLink(groupId: string, memberId: string, userId: string, dto: CreateGroupCashLinkDto): Promise<GroupBudgetLinksView> {
    return this.links.createLink(groupId, memberId, userId, dto);
  }

  acceptSuggestion(groupId: string, memberId: string, userId: string, suggestionId: string): Promise<GroupBudgetLinksView> {
    return this.links.acceptSuggestion(groupId, memberId, userId, suggestionId);
  }

  rejectSuggestion(groupId: string, memberId: string, userId: string, suggestionId: string): Promise<GroupBudgetLinksView> {
    return this.links.rejectSuggestion(groupId, memberId, userId, suggestionId);
  }

  unlink(groupId: string, memberId: string, userId: string, linkId: string): Promise<GroupBudgetLinksView> {
    return this.links.unlink(groupId, memberId, userId, linkId);
  }


  /** Idempotent. Returns the mirror's status after the pass. */
  async reconcileMember(memberId: string): Promise<'off' | 'paused' | 'active'> {
    const m = await this.support.mirrorMember(memberId);
    if (!m) return 'off';
    const elig = await this.support.checkAccount(m.userId, m.budgetAccountId);
    if (!elig.ok) return 'paused';
    const data = await this.support.loadLegs(m);
    const changedRows = await this.syncShareRows(m, elig.account, data);
    const changedLinks = await this.links.syncCashLinks(m, elig.account, data.legs);
    if (changedRows || changedLinks) this.support.bustCaches(m.budgetAccountId);
    return 'active';
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
}
