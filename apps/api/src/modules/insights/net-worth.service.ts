import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { WalletService } from '../wallet/wallet.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { HistoricalRateService } from '../currency-exchange/historical-rate.service';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import type { NetWorthResponse } from '@budget/shared-types';
import {
  closeOnOrBefore,
  convertViaEur,
  debtRemainingAt,
  monthEnds,
  quantityAt,
  withNet,
  type DebtRow,
  type RepaymentRow,
  type TradeRow,
} from './net-worth.util';

const CACHE_TTL_SEC = 600;
const MONTHS = 12;

export function netWorthCacheKey(userId: string, base: string, excluded: string[]): string {
  return `nw:${userId}:${base}:${[...excluded].sort().join(',')}`;
}

type Money = { accountId: string; currencyCode: string; amount: number; at: Date };

/**
 * Net worth across every account the user belongs to (ABA-799): cash,
 * investments, money owed to the user and the user's debts, now and at the
 * last 12 month-ends, in the display currency.
 *
 * User-scoped: it enumerates memberships itself (like `GET /wallet/summaries`)
 * and never reads `req.accountId`. An excluded account is listed but not
 * summed; a fully encrypted account (tier ≥ 2) is listed with no figures.
 * See docs/superpowers/specs/2026-11-16-net-worth-design.md.
 */
@Injectable()
export class NetWorthService {
  private readonly logger = new Logger(NetWorthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly cache: CacheService,
    @Optional() private readonly historicalRates?: HistoricalRateService,
  ) {}

  async getNetWorth(userId: string, baseCurrency: string, excluded: string[] = []): Promise<NetWorthResponse> {
    const key = netWorthCacheKey(userId, baseCurrency, excluded);
    const cached = await this.cache.get<NetWorthResponse>(key);
    if (cached) return cached;
    const result = await this.compute(userId, baseCurrency, excluded, new Date());
    await this.cache.set(key, result, CACHE_TTL_SEC);
    return result;
  }

  async compute(userId: string, base: string, excluded: string[], now: Date): Promise<NetWorthResponse> {
    const memberships = await this.prisma.accountMember.findMany({
      where: { userId },
      select: { account: { select: { id: true, name: true, type: true, encryptionTier: true } } },
    });
    const accounts = memberships.map((m) => m.account);
    const excludedSet = new Set(excluded);
    const ids = accounts
      .filter((a) => !excludedSet.has(a.id) && (a.encryptionTier ?? 0) < 2)
      .map((a) => a.id);

    const ends = monthEnds(now, MONTHS);
    const since = new Date(ends[0].at.getFullYear(), ends[0].at.getMonth(), 1);
    const rates = await getRatesSafe(this.exchangeRateService, base);
    const pastMonths = ends.filter((e) => !e.current).map((e) => e.month);
    const monthRates = this.historicalRates && ids.length > 0 ? await this.historicalRates.getMonthEndRates(pastMonths) : {};

    let fxApproximate = false;
    /** Converts at the month's closing rate for a past month, today's rate otherwise. */
    const toBase = (amount: number, from: string, month: string | null): number => {
      if (amount === 0) return 0;
      const eur = month ? monthRates[month] : undefined;
      const v = eur ? convertViaEur(amount, from, base, eur) : convertAmount(amount, from, base, rates);
      if (v === null) {
        fxApproximate = true;
        return 0;
      }
      return v;
    };

    if (ids.length === 0) {
      return {
        currencyCode: base,
        current: withNet({ cash: 0, investments: 0, owedToMe: 0, debts: 0 }),
        history: ends.map((e) => ({ month: e.month, ...withNet({ cash: 0, investments: 0, owedToMe: 0, debts: 0 }), approximate: false })),
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          included: !excludedSet.has(a.id),
          encrypted: (a.encryptionTier ?? 0) >= 2,
          net: null,
        })),
        fxApproximate: false,
        computedAt: now.toISOString(),
      };
    }

    // ---- Cash: today's balances, walked back with the movements after each month-end.
    const summaries = await this.walletService.getSummariesForAccounts(userId);
    const balances: { accountId: string; currencyCode: string; balance: number }[] = [];
    for (const s of summaries.accounts) {
      if (!ids.includes(s.accountId)) continue;
      for (const b of s.balances) balances.push({ accountId: s.accountId, currencyCode: b.currencyCode, balance: b.currentBalance });
    }
    const movements = await this.movementsSince(ids, since);

    // ---- Debts (whole history: a debt from three years ago can still be open).
    const [lent, lentRepay, borrowed, borrowedRepay] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId: { in: ids }, isDebt: true, isDeleted: false },
        select: { id: true, accountId: true, amount: true, currencyCode: true, date: true },
      }),
      this.prisma.income.findMany({
        where: { accountId: { in: ids }, isDebtRepayment: true, isDeleted: false, relatedDebtExpenseId: { not: null } },
        select: { relatedDebtExpenseId: true, amount: true, date: true },
      }),
      this.prisma.income.findMany({
        where: { accountId: { in: ids }, isDebt: true, isDeleted: false },
        select: { id: true, accountId: true, amount: true, currencyCode: true, date: true },
      }),
      this.prisma.expense.findMany({
        where: { accountId: { in: ids }, isDebtRepayment: true, isDeleted: false, relatedDebtIncomeId: { not: null } },
        select: { relatedDebtIncomeId: true, amount: true, date: true },
      }),
    ]);
    const asDebt = (r: { id: string; accountId: string; amount: unknown; currencyCode: string; date: Date }) => ({
      id: r.id,
      accountId: r.accountId,
      amount: Number(r.amount),
      currencyCode: r.currencyCode,
      date: new Date(r.date),
    });
    const lentRows = lent.map(asDebt);
    const borrowedRows = borrowed.map(asDebt);
    const lentRepayRows: RepaymentRow[] = lentRepay.map((r) => ({ debtId: r.relatedDebtExpenseId!, amount: Number(r.amount), date: new Date(r.date) }));
    const borrowedRepayRows: RepaymentRow[] = borrowedRepay.map((r) => ({ debtId: r.relatedDebtIncomeId!, amount: Number(r.amount), date: new Date(r.date) }));

    // ---- Investments.
    const holdings = await this.prisma.portfolioHolding.findMany({
      where: { accountId: { in: ids }, isDeleted: false },
      select: {
        id: true,
        accountId: true,
        assetId: true,
        quantity: true,
        averageCostBasis: true,
        createdAt: true,
        asset: { select: { currentPrice: true, priceCurrency: true } },
      },
    });
    const [trades, prices] = holdings.length
      ? await Promise.all([
          this.prisma.investmentTransaction.findMany({
            where: { holdingId: { in: holdings.map((h) => h.id) }, isDeleted: false },
            select: { holdingId: true, type: true, quantity: true, date: true },
          }),
          this.prisma.assetPriceHistory.findMany({
            where: {
              assetId: { in: [...new Set(holdings.map((h) => h.assetId))] },
              date: { gte: new Date(since.getFullYear(), since.getMonth(), since.getDate() - 14) },
            },
            select: { assetId: true, date: true, closePrice: true },
            orderBy: { date: 'asc' },
          }),
        ])
      : [[], []];
    const tradesByHolding = new Map<string, TradeRow[]>();
    for (const t of trades) {
      const list = tradesByHolding.get(t.holdingId) ?? [];
      list.push({ type: t.type, quantity: Number(t.quantity), date: new Date(t.date) });
      tradesByHolding.set(t.holdingId, list);
    }
    const pricesByAsset = new Map<string, { date: Date; close: number }[]>();
    for (const p of prices) {
      const list = pricesByAsset.get(p.assetId) ?? [];
      list.push({ date: new Date(p.date), close: Number(p.closePrice) });
      pricesByAsset.set(p.assetId, list);
    }

    /** All four parts at one moment, for the given accounts. */
    const partsAt = (at: Date, month: string | null, onlyAccount?: string) => {
      const inScope = (accountId: string) => !onlyAccount || accountId === onlyAccount;
      let approximate = false;

      let cash = 0;
      for (const b of balances) {
        if (!inScope(b.accountId)) continue;
        const later = month
          ? movements
              .filter((m) => m.accountId === b.accountId && m.currencyCode === b.currencyCode && m.at > at)
              .reduce((s, m) => s + m.amount, 0)
          : 0;
        cash += toBase(b.balance - later, b.currencyCode, month);
      }

      let investments = 0;
      for (const h of holdings) {
        if (!inScope(h.accountId)) continue;
        const currency = h.asset.priceCurrency || 'USD';
        if (!month) {
          const price = h.asset.currentPrice != null ? Number(h.asset.currentPrice) : Number(h.averageCostBasis);
          if (h.asset.currentPrice == null) approximate = true;
          investments += toBase(Number(h.quantity) * price, currency, null);
          continue;
        }
        const qty = quantityAt(
          { quantity: Number(h.quantity), createdAt: new Date(h.createdAt) },
          tradesByHolding.get(h.id) ?? [],
          at,
        );
        if (qty <= 0) continue;
        let price = closeOnOrBefore(pricesByAsset.get(h.assetId) ?? [], at);
        if (price === null) {
          price = Number(h.averageCostBasis);
          approximate = true;
        }
        investments += toBase(qty * price, currency, month);
      }

      const sumDebts = (rows: (DebtRow & { accountId: string })[], repay: RepaymentRow[]) => {
        let total = 0;
        for (const [currency, amount] of debtRemainingAt(rows.filter((r) => inScope(r.accountId)), repay, at)) {
          total += toBase(amount, currency, month);
        }
        return total;
      };

      return {
        parts: withNet({
          cash,
          investments,
          owedToMe: sumDebts(lentRows, lentRepayRows),
          debts: sumDebts(borrowedRows, borrowedRepayRows),
        }),
        approximate,
      };
    };

    const current = partsAt(now, null);
    const history = ends.map((e) => {
      const p = e.current ? current : partsAt(e.at, e.month);
      return { month: e.month, ...p.parts, approximate: p.approximate };
    });

    return {
      currencyCode: base,
      current: current.parts,
      history,
      accounts: accounts.map((a) => {
        const encrypted = (a.encryptionTier ?? 0) >= 2;
        const included = !excludedSet.has(a.id);
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          included,
          encrypted,
          net: !encrypted && included ? partsAt(now, null, a.id).parts.net : null,
        };
      }),
      fxApproximate,
      computedAt: now.toISOString(),
    };
  }

  /**
   * Every wallet movement since `since`, signed as it moves the balance, per
   * account and currency — the same sources as the wallet balance formula
   * (`buildWalletBalanceRow`), so walking back from today's balance lands on
   * the balance at a past moment.
   */
  private async movementsSince(ids: string[], since: Date): Promise<Money[]> {
    const dateFrom = { gte: since };
    const [incomes, expenses, exchanges, transfersOut, transfersIn, adjustments] = await Promise.all([
      this.prisma.income.findMany({
        where: { accountId: { in: ids }, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE, date: dateFrom },
        select: { accountId: true, currencyCode: true, amount: true, date: true },
      }),
      this.prisma.expense.findMany({
        where: { accountId: { in: ids }, isDeleted: false, isPlanned: false, ...EXCLUDE_SPLIT_RECEIVABLE, date: dateFrom },
        select: { accountId: true, currencyCode: true, amount: true, date: true },
      }),
      this.prisma.currencyExchange.findMany({
        where: { accountId: { in: ids }, isDeleted: false, date: dateFrom },
        select: { accountId: true, fromCurrency: true, fromAmount: true, toCurrency: true, toAmount: true, date: true },
      }),
      this.prisma.accountTransfer.findMany({
        where: { fromAccountId: { in: ids }, isDeleted: false, date: dateFrom },
        select: { fromAccountId: true, fromCurrency: true, fromAmount: true, date: true },
      }),
      // countAsIncome transfers are already counted through their linked Income row.
      this.prisma.accountTransfer.findMany({
        where: { toAccountId: { in: ids }, isDeleted: false, countAsIncome: false, date: dateFrom },
        select: { toAccountId: true, toCurrency: true, toAmount: true, date: true },
      }),
      this.prisma.walletAdjustment.findMany({
        where: { accountId: { in: ids }, isDeleted: false, createdAt: dateFrom },
        select: { accountId: true, currencyCode: true, delta: true, createdAt: true },
      }),
    ]);
    // `date` columns are @db.Date (UTC midnight): read them as that calendar day, local midnight.
    const day = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const out: Money[] = [];
    for (const r of incomes) out.push({ accountId: r.accountId, currencyCode: r.currencyCode, amount: Number(r.amount), at: day(r.date) });
    for (const r of expenses) out.push({ accountId: r.accountId, currencyCode: r.currencyCode, amount: -Number(r.amount), at: day(r.date) });
    for (const r of exchanges) {
      out.push({ accountId: r.accountId, currencyCode: r.fromCurrency, amount: -Number(r.fromAmount), at: day(r.date) });
      out.push({ accountId: r.accountId, currencyCode: r.toCurrency, amount: Number(r.toAmount), at: day(r.date) });
    }
    for (const r of transfersOut) out.push({ accountId: r.fromAccountId, currencyCode: r.fromCurrency, amount: -Number(r.fromAmount), at: day(r.date) });
    for (const r of transfersIn) out.push({ accountId: r.toAccountId, currencyCode: r.toCurrency, amount: Number(r.toAmount), at: day(r.date) });
    for (const r of adjustments) out.push({ accountId: r.accountId, currencyCode: r.currencyCode, amount: Number(r.delta), at: new Date(r.createdAt) });
    this.logger.debug(`[net-worth] ${out.length} movements since ${since.toISOString()}`);
    return out;
  }
}
