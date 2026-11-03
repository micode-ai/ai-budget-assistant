import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import {
  attributeToCategories,
  type AttributableExpense,
} from '../../common/utils/category-attribution';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { PrismaService } from '../../database/prisma.service';
import {
  ExchangeRateService,
  SUPPORTED_RATE_CURRENCIES,
} from '../currency-exchange/exchange-rate.service';
import {
  ANALYTICS_MAX_DAYS,
  ANALYTICS_MAX_MONTHS,
  type PublicAnalyticsByCategory,
  type PublicAnalyticsCategoryAmount,
  type PublicAnalyticsMonthly,
  type PublicAnalyticsSummary,
  type PublicAnalyticsType,
} from './dto/public-analytics.dto';
import { dateRangeFilter, utcDay } from './list-feed.util';
import { PublicApiError } from './public-api-error';
import { ANALYTICS_BY_CATEGORY_TIER1_ENCRYPTED_FIELDS } from './public-encryption-fields';

/**
 * The public API's analytics: totals computed by the server so an integrator never sums raw rows.
 *
 * Counting rules (spec "Analytics", decided by the product owner 2026-11-03):
 * - every row is converted into ONE currency with the server's rates, then aggregated; a row whose
 *   rate is unknown is left out and sets `fx_approximate` — never summed unconverted
 *   (`common/utils/fx.ts`);
 * - deleted rows, planned expenses and split receivables (`EXCLUDE_SPLIT_RECEIVABLE`) are excluded;
 * - debts and transfers are counted as the app's Analytics tab counts them: it removes ONLY split
 *   receivables (`filterConsumption`/`filterIncomeConsumption` in
 *   `apps/mobile/src/features/analytics/useFilteredTransactions.ts`), so a lent or borrowed debt, a
 *   repayment either way and a transfer's linked income (“count as income”) all count. A transfer
 *   itself is not an expense or income row. Never filter on `isDebt` here;
 * - a split expense is attributed to its split categories (`attributeToCategories`, the one place
 *   that rule lives).
 *
 * NOT built on `AnalyticsService.getSummary/getTrends`: those sum across currencies and keep
 * planned expenses.
 *
 * Results are cached for 60 s, tier-independent; tier-1 nulling is applied on the way out, so a
 * result cached for a tier-0 request can never serve names to a tier-1 one.
 */

export interface PublicAnalyticsQuery {
  from: string;
  to: string;
  currency?: string;
}

type Route = 'summary' | 'by-category' | 'monthly';
type Kind = PublicAnalyticsType;
type Envelope = Pick<
  PublicAnalyticsSummary,
  'currency' | 'from' | 'to' | 'fx_converted' | 'fx_approximate'
>;
type Uncached<T extends Envelope> = Omit<T, 'encrypted_fields'>;

const CACHE_TTL_SEC = 60;
const DAY_MS = 86_400_000;

const AMOUNT_SELECT = { amount: true, currencyCode: true, date: true } as const;
const CATEGORY_REF = { select: { id: true, name: true } } as const;

interface AmountRow {
  amount: Prisma.Decimal | number;
  currencyCode: string;
  date: Date;
}

/** Whole cents, so sums never drift by floating point. */
const toCents = (amount: number): number => Math.round(amount * 100);
const money = (cents: number): string => (cents / 100).toFixed(2);

function invalid(field: string, message: string): PublicApiError {
  return new PublicApiError(400, 'validation_failed', 'The request is invalid.', {
    fields: { [field]: [message] },
  });
}

/** Months from `from` to `to` (both `YYYY-MM-DD`), as `YYYY-MM`, inclusive. */
function monthsOf(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= last) return out;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

/**
 * Converts amounts into `currency`, recording whether anything was converted or left out. Rates are
 * fetched once, and only when a row is in another currency.
 */
class Fx {
  converted = false;
  approximate = false;

  private constructor(
    private readonly currency: string,
    private readonly rates: Record<string, number> | null
  ) {}

  static async for(
    provider: ExchangeRateService,
    currency: string,
    rows: AmountRow[]
  ): Promise<Fx> {
    const foreign = rows.some((r) => r.currencyCode !== currency);
    return new Fx(currency, foreign ? await getRatesSafe(provider, currency) : null);
  }

  /** Cents in the target currency, or null (the row is left out) when the rate is unknown. */
  cents(amount: unknown, from: string): number | null {
    const value = convertAmount(Number(amount) || 0, from, this.currency, this.rates);
    if (value === null) {
      this.approximate = true;
      return null;
    }
    if (from !== this.currency) this.converted = true;
    return toCents(value);
  }
}

@Injectable()
export class PublicAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRateService,
    private readonly cache: CacheService
  ) {}

  /** Period totals: income, expenses, net and the number of rows counted. */
  async summary(
    accountId: string,
    userId: string,
    q: PublicAnalyticsQuery,
    _tier: number
  ): Promise<PublicAnalyticsSummary> {
    const computed = await this.run<Uncached<PublicAnalyticsSummary>>(
      accountId,
      userId,
      'summary',
      q,
      undefined,
      async (currency) => {
        const { expenses, incomes, fx } = await this.loadAmounts(accountId, q, currency);
        const exp = sumBy(expenses, fx, () => 'all');
        const inc = sumBy(incomes, fx, () => 'all');
        const spent = exp.totals.get('all') ?? 0;
        const earned = inc.totals.get('all') ?? 0;
        return {
          ...envelope(q, currency, fx),
          total_income: money(earned),
          total_expenses: money(spent),
          net: money(earned - spent),
          transaction_count: exp.counted + inc.counted,
        };
      }
    );
    return { ...computed, encrypted_fields: [] };
  }

  /** Spending (or income) per category, split-aware, sorted by amount. */
  async byCategory(
    accountId: string,
    userId: string,
    q: PublicAnalyticsQuery & { type: Kind },
    tier: number
  ): Promise<PublicAnalyticsByCategory> {
    const computed = await this.run<Uncached<PublicAnalyticsByCategory>>(
      accountId,
      userId,
      'by-category',
      q,
      q.type,
      async (currency) => {
        const select = {
          ...AMOUNT_SELECT,
          categoryId: true,
          category: CATEGORY_REF,
          ...(q.type === 'expense'
            ? {
                categorySplits: {
                  where: { isDeleted: false },
                  select: { categoryId: true, amount: true, category: CATEGORY_REF },
                },
              }
            : {}),
        };
        const rows = (await this.load(accountId, q, q.type, select)) as Array<
          AmountRow & AttributableExpense
        >;
        const fx = await Fx.for(this.exchangeRates, currency, rows);

        const byId = new Map<string | null, { name: string | null; cents: number }>();
        for (const row of rows) {
          // The row's own conversion decides whether it is counted at all; its shares then use the
          // same (known) rate.
          if (fx.cents(row.amount, row.currencyCode) === null) continue;
          for (const share of attributeToCategories(row)) {
            const id = share.categoryId ?? null;
            const entry = byId.get(id) ?? {
              name: id === null ? null : share.categoryName,
              cents: 0,
            };
            entry.cents += fx.cents(share.amount, row.currencyCode) ?? 0;
            byId.set(id, entry);
          }
        }

        const total = [...byId.values()].reduce((s, e) => s + e.cents, 0);
        const data: PublicAnalyticsCategoryAmount[] = [...byId.entries()]
          .sort(([, a], [, b]) => b.cents - a.cents)
          .map(([id, e]) => ({
            category_id: id,
            category_name: e.name,
            amount: money(e.cents),
            share: total > 0 ? Math.round((e.cents / total) * 10_000) / 10_000 : 0,
          }));
        return { ...envelope(q, currency, fx), data };
      }
    );

    if (tier < 1) return { ...computed, encrypted_fields: [] };
    return {
      ...computed,
      data: computed.data.map((d) => ({ ...d, category_name: null })),
      encrypted_fields: [...ANALYTICS_BY_CATEGORY_TIER1_ENCRYPTED_FIELDS],
    };
  }

  /** Income, expenses and net per calendar month; every month of the range is present. */
  async monthly(
    accountId: string,
    userId: string,
    q: PublicAnalyticsQuery,
    _tier: number
  ): Promise<PublicAnalyticsMonthly> {
    const computed = await this.run<Uncached<PublicAnalyticsMonthly>>(
      accountId,
      userId,
      'monthly',
      q,
      undefined,
      async (currency) => {
        const { expenses, incomes, fx } = await this.loadAmounts(accountId, q, currency);
        const monthOf = (r: AmountRow) => r.date.toISOString().slice(0, 7);
        const exp = sumBy(expenses, fx, monthOf).totals;
        const inc = sumBy(incomes, fx, monthOf).totals;
        const data = monthsOf(q.from, q.to).map((month) => {
          const spent = exp.get(month) ?? 0;
          const earned = inc.get(month) ?? 0;
          return {
            month,
            income: money(earned),
            expenses: money(spent),
            net: money(earned - spent),
          };
        });
        return { ...envelope(q, currency, fx), data };
      }
    );
    return { ...computed, encrypted_fields: [] };
  }

  /** Validates the range and currency, resolves the default currency, and serves from cache. */
  private async run<T>(
    accountId: string,
    userId: string,
    route: Route,
    q: PublicAnalyticsQuery,
    type: Kind | undefined,
    compute: (currency: string) => Promise<T>
  ): Promise<T> {
    assertRange(route, q.from, q.to);
    if (
      q.currency !== undefined &&
      !(SUPPORTED_RATE_CURRENCIES as readonly string[]).includes(q.currency)
    ) {
      throw invalid('currency', `currency must be one of ${SUPPORTED_RATE_CURRENCIES.join(', ')}`);
    }
    const currency = q.currency ?? (await this.grantorCurrency(userId));

    const key = `pa:an:${accountId}:${route}:${q.from}:${q.to}:${type ?? '-'}:${currency}`;
    const hit = await this.cache.get<T>(key);
    if (hit) return hit;
    const result = await compute(currency);
    await this.cache.set(key, result, CACHE_TTL_SEC);
    return result;
  }

  /** Both sides' amounts for summary/monthly, and the converter for them. */
  private async loadAmounts(accountId: string, q: PublicAnalyticsQuery, currency: string) {
    const [expenses, incomes] = await Promise.all([
      this.load(accountId, q, 'expense', AMOUNT_SELECT),
      this.load(accountId, q, 'income', AMOUNT_SELECT),
    ]);
    const fx = await Fx.for(this.exchangeRates, currency, [...expenses, ...incomes]);
    return { expenses, incomes, fx };
  }

  /** The display currency of the user who connected the app — what they see on their phone. */
  private async grantorCurrency(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { currencyCode: true },
    });
    return user?.currencyCode || 'USD';
  }

  private load<S extends Record<string, unknown>>(
    accountId: string,
    q: PublicAnalyticsQuery,
    kind: Kind,
    select: S
  ): Promise<AmountRow[]> {
    const where = {
      accountId,
      isDeleted: false,
      ...EXCLUDE_SPLIT_RECEIVABLE,
      ...(kind === 'expense' ? { isPlanned: false } : {}),
      date: dateRangeFilter(q.from, q.to),
    };
    return kind === 'expense'
      ? (this.prisma.expense.findMany({ where, select }) as unknown as Promise<AmountRow[]>)
      : (this.prisma.income.findMany({ where, select }) as unknown as Promise<AmountRow[]>);
  }
}

function envelope(q: PublicAnalyticsQuery, currency: string, fx: Fx): Envelope {
  return {
    currency,
    from: q.from,
    to: q.to,
    fx_converted: fx.converted,
    fx_approximate: fx.approximate,
  };
}

/** Converted cents per key, plus how many rows were counted (rows with no rate are not). */
function sumBy(
  rows: AmountRow[],
  fx: Fx,
  keyOf: (r: AmountRow) => string
): { totals: Map<string, number>; counted: number } {
  const totals = new Map<string, number>();
  let counted = 0;
  for (const row of rows) {
    const cents = fx.cents(row.amount, row.currencyCode);
    if (cents === null) continue;
    counted += 1;
    const key = keyOf(row);
    totals.set(key, (totals.get(key) ?? 0) + cents);
  }
  return { totals, counted };
}

function assertRange(route: Route, from: string, to: string): void {
  if (to < from) throw invalid('to', 'to must not be earlier than from');
  if (route === 'monthly') {
    const index = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
    if (index(to) - index(from) + 1 > ANALYTICS_MAX_MONTHS) {
      throw invalid('to', `the range must cover at most ${ANALYTICS_MAX_MONTHS} calendar months`);
    }
    return;
  }
  const days = (utcDay(to).getTime() - utcDay(from).getTime()) / DAY_MS + 1;
  if (days > ANALYTICS_MAX_DAYS)
    throw invalid('to', `the range must cover at most ${ANALYTICS_MAX_DAYS} days`);
}
