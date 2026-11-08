import { ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { invalidateExpenseChatCache } from '../expenses/expense-cache.util';
import { legKeyOf, type CashLeg } from './group-budget-mirror';
import { iso, type Eligibility, type LegData, type MirrorMember } from './group-budget-mirror.shared';
import type { GroupBudgetMirrorPauseReason, GroupBudgetMirrorView, GroupCashLegKind } from '@budget/shared-types';

/**
 * What every part of the budget mirror needs to read: the member row, the target account's
 * eligibility (re-checked on every pass), the group's legs, the cache bust and the status view.
 * Plain class owned by `GroupBudgetMirrorService`; the other collaborators take it by constructor.
 */
export class GroupBudgetMirrorSupport {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly logger: Logger,
  ) {}


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

  refuse(reason: GroupBudgetMirrorPauseReason): never {
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

  async mirrorMember(memberId: string): Promise<MirrorMember | null> {
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

  bustCaches(accountId: string): void {
    void invalidateExpenseChatCache(this.cache, accountId).catch(
      logFireAndForget(this.logger, 'GroupBudgetMirrorService.invalidateExpenseChatCache'),
    );
  }

  async loadLegs(m: MirrorMember): Promise<LegData> {
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


  /** The member's mirror for a link write: on, and its account writable right now. */
  async writableMirror(groupId: string, memberId: string, userId: string): Promise<MirrorMember> {
    const m = await this.mirrorMember(memberId);
    if (!m || m.groupId !== groupId || m.userId !== userId) {
      throw new ConflictException({ code: 'MIRROR_OFF', message: 'Count my share in my budget is off for this group' });
    }
    const elig = await this.checkAccount(userId, m.budgetAccountId);
    if (!elig.ok) this.refuse(elig.reason);
    return m;
  }


  async viewOf(groupId: string, memberId: string, userId: string): Promise<GroupBudgetMirrorView> {
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
