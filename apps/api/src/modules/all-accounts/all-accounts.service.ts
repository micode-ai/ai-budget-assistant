import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { attributeToCategories } from '../../common/utils/category-attribution';
import type { AccountRole, AccountType, AllAccountsAccountRow, AllAccountsAnalyticsResponse } from '@budget/shared-types';
import type { LedgerNote, LedgerRow } from './all-accounts.types';
import { aggregateLedger, mergedCategory, previousPeriod, type MergeableCategory } from './all-accounts.util';

const CACHE_TTL_SEC = 120;

export interface AccountMeta {
  id: string;
  name: string;
  type: AccountType;
  role: AccountRole;
  encrypted: boolean;
  shared: boolean;
  included: boolean;
}

export interface LedgerFilter {
  exclude: string[];
  onlyAccountIds: string[] | null;
}

export interface AnalyticsQuery {
  start: string;
  end: string;
  exclude: string[];
  onlyAccountIds: string[] | null;
  groupId: string | null;
}

export function allAccountsCacheKey(
  userId: string,
  currency: string,
  language: string,
  start: string,
  end: string,
  includedIds: string[],
  groupId: string | null = null,
): string {
  return `aa:${userId}:${currency}:${language}:${start}:${end}:${[...includedIds].sort().join(',')}${groupId ? `:g=${groupId}` : ''}`;
}

const CATEGORY_NODE = { select: { name: true, systemKey: true, nameCustomized: true, type: true } } as const;
const CATEGORY_WITH_PARENT = {
  select: { name: true, systemKey: true, nameCustomized: true, type: true, parent: CATEGORY_NODE },
} as const;

const day = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const isoDay = (d: Date): string => new Date(d).toISOString().slice(0, 10);

interface Resolved {
  accounts: AccountMeta[];
  includedIds: string[];
  tierById: Map<string, number>;
}

/**
 * Cross-account analytics for the signed-in user (all-accounts-analytics spec).
 * User-scoped: accounts are the caller's AccountMember rows; `exclude` and
 * `onlyAccountIds` only narrow that set, never widen it. Tier >= 2 accounts are
 * listed but never queried.
 */
@Injectable()
export class AllAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly cache: CacheService,
  ) {}

  private async resolve(userId: string, filter: LedgerFilter): Promise<Resolved> {
    const memberships = await this.prisma.accountMember.findMany({
      where: { userId },
      select: {
        role: true,
        account: { select: { id: true, name: true, type: true, encryptionTier: true, _count: { select: { members: true } } } },
      },
    });
    const excluded = new Set(filter.exclude);
    const only = filter.onlyAccountIds ? new Set(filter.onlyAccountIds) : null;
    const tierById = new Map<string, number>();
    const accounts: AccountMeta[] = (memberships as any[]).map((m) => {
      const a = m.account;
      const tier = a.encryptionTier ?? 0;
      tierById.set(a.id, tier);
      const encrypted = tier >= 2;
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        role: m.role,
        encrypted,
        shared: a.type === 'shared' || a.type === 'trip' || (a._count?.members ?? 0) > 1,
        included: !encrypted && !excluded.has(a.id) && (only === null || only.has(a.id)),
      };
    });
    return { accounts, includedIds: accounts.filter((a) => a.included).map((a) => a.id), tierById };
  }

  async loadLedger(
    userId: string,
    base: string,
    language: string,
    start: string,
    end: string,
    filter: LedgerFilter,
  ): Promise<{ accounts: AccountMeta[]; includedIds: string[]; rows: LedgerRow[] }> {
    const resolved = await this.resolve(userId, filter);
    const rows = await this.loadRows(resolved, base, language, start, end);
    return { accounts: resolved.accounts, includedIds: resolved.includedIds, rows };
  }

  private async loadRows(resolved: Resolved, base: string, language: string, start: string, end: string): Promise<LedgerRow[]> {
    const { includedIds, tierById } = resolved;
    if (includedIds.length === 0) return [];
    const dateWhere = { gte: day(start), lte: day(end) };
    const [rates, expenses, incomes, transfers] = await Promise.all([
      getRatesSafe(this.exchangeRateService, base),
      this.prisma.expense.findMany({
        where: { accountId: { in: includedIds }, isDeleted: false, date: dateWhere },
        select: {
          accountId: true,
          amount: true,
          currencyCode: true,
          date: true,
          description: true,
          isPlanned: true,
          isSplitReceivable: true,
          categoryId: true,
          category: CATEGORY_WITH_PARENT,
          categorySplits: { where: { isDeleted: false }, select: { categoryId: true, amount: true, category: CATEGORY_WITH_PARENT } },
        },
      }),
      this.prisma.income.findMany({
        where: { accountId: { in: includedIds }, isDeleted: false, date: dateWhere },
        select: {
          id: true,
          accountId: true,
          amount: true,
          currencyCode: true,
          date: true,
          description: true,
          isSplitReceivable: true,
          category: CATEGORY_WITH_PARENT,
        },
      }),
      this.prisma.accountTransfer.findMany({
        where: { countAsIncome: true, isDeleted: false, linkedIncomeId: { not: null }, fromAccountId: { in: includedIds } },
        select: { linkedIncomeId: true },
      }),
    ]);
    const internalIncomeIds = new Set<string>((transfers as any[]).map((t) => t.linkedIncomeId as string));
    const toBase = (amount: number, cur: string) => convertAmount(amount, cur, base, rates);
    const opts = (accountId: string) => ({ language, namesReadable: (tierById.get(accountId) ?? 0) < 1 });
    const rows: LedgerRow[] = [];

    for (const e of expenses as any[]) {
      const note: LedgerNote = e.isPlanned ? 'planned' : e.isSplitReceivable ? 'splitReceivable' : null;
      const parts = attributeToCategories({
        amount: e.amount,
        categoryId: e.categoryId,
        category: e.category,
        categorySplits: e.categorySplits,
      });
      const hasSplits = (e.categorySplits?.length ?? 0) > 0;
      parts.forEach((p, i) => {
        const cat: MergeableCategory | null = hasSplits ? (e.categorySplits[i].category ?? null) : (e.category ?? null);
        rows.push({
          accountId: e.accountId,
          kind: 'expense',
          date: isoDay(e.date),
          description: e.description ?? '',
          amount: p.amount,
          currencyCode: e.currencyCode,
          amountBase: toBase(p.amount, e.currencyCode),
          category: mergedCategory(cat, opts(e.accountId), 'expense'),
          note,
        });
      });
    }

    for (const i of incomes as any[]) {
      const note: LedgerNote = i.isSplitReceivable ? 'splitReceivable' : internalIncomeIds.has(i.id) ? 'internalTransfer' : null;
      const amount = Number(i.amount) || 0;
      rows.push({
        accountId: i.accountId,
        kind: 'income',
        date: isoDay(i.date),
        description: i.description ?? '',
        amount,
        currencyCode: i.currencyCode,
        amountBase: toBase(amount, i.currencyCode),
        category: mergedCategory(i.category ?? null, opts(i.accountId), 'income'),
        note,
      });
    }
    return rows;
  }

  async getAnalytics(user: { id: string; currencyCode: string }, q: AnalyticsQuery): Promise<AllAccountsAnalyticsResponse> {
    const base = user.currencyCode || 'USD';
    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { language: true } });
    const language = (u as any)?.language || 'en';
    const resolved = await this.resolve(user.id, { exclude: q.exclude, onlyAccountIds: q.onlyAccountIds });
    const key = allAccountsCacheKey(user.id, base, language, q.start, q.end, resolved.includedIds, q.groupId);
    const cached = await this.cache.get<AllAccountsAnalyticsResponse>(key);
    if (cached) return cached;

    const prev = previousPeriod(q.start, q.end);
    const [rows, prevRows] = await Promise.all([
      this.loadRows(resolved, base, language, q.start, q.end),
      this.loadRows(resolved, base, language, prev.start, prev.end),
    ]);
    const cur = aggregateLedger(rows, resolved.includedIds, q.start, q.end);
    const prevAgg = aggregateLedger(prevRows, resolved.includedIds, prev.start, prev.end);

    const accounts: AllAccountsAccountRow[] = resolved.accounts.map((a) => {
      const m = cur.perAccount[a.id] ?? { spent: 0, income: 0, net: 0 };
      const p = prevAgg.perAccount[a.id];
      return { ...a, ...m, prevSpent: a.included && p ? p.spent : null, prevIncome: a.included && p ? p.income : null };
    });

    const result: AllAccountsAnalyticsResponse = {
      currencyCode: base,
      start: q.start,
      end: q.end,
      groupId: q.groupId,
      fxApproximate: cur.fxApproximate,
      computedAt: new Date().toISOString(),
      totals: cur.totals,
      accounts,
      months: cur.months,
      expenseCategories: cur.expenseCategories,
      incomeCategories: cur.incomeCategories,
    };
    await this.cache.set(key, result, CACHE_TTL_SEC);
    return result;
  }
}
