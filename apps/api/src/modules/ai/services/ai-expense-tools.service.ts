import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExpensesService } from '../../expenses/expenses.service';
import { CreateExpenseDto, ExpenseFiltersDto } from '../../expenses/dto';
import { IncomesService } from '../../incomes/incomes.service';
import { CreateIncomeDto } from '../../incomes/dto';
import { CategoriesService } from '../../categories/categories.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ExchangeRateService } from '../../currency-exchange/exchange-rate.service';
import { attributeToCategories } from '../../../common/utils/category-attribution';
import { buildSearchUnits } from '../utils/semantic-filter';
import { summariseDeposits } from '../utils/deposit-summary';
import { summariseDiscounts } from '../utils/discount-summary';
import { getRatesSafe, convertAmount } from '../../../common/utils/fx';
import type { ChatActionResult } from '@budget/shared-types';

// Cap on the number of searchable units (expense-level rows + receipt line items)
// sent to the semantic filter for a single keyword query. Generous enough to cover
// full-history product searches while bounding token cost / latency.
const SEARCH_UNIT_LIMIT = 1500;

// The "no period given" start date shared by the read tools that default to the
// user's whole history. Well before any account in this system could exist, so
// it reads every row without needing a real earliest-row lookup.
const ALL_TIME_START = '2000-01-01';

/**
 * The expense/income-reading and -writing chat tools: create_expense, create_income,
 * get_expenses, get_category_breakdown, get_deposit_total, get_discount_total.
 * Extracted from AiToolsService (tech-debt ai-tools-service-god-file) — see
 * AiToolsService.executeAction for the dispatch switch that calls into this class.
 */
@Injectable()
export class AiExpenseToolsService {
  private readonly logger = new Logger(AiExpenseToolsService.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
    private readonly categoriesService: CategoriesService,
    private readonly analyticsService: AnalyticsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  /**
   * Fetch exchange rates for `base` (1 base = rates[X] X). Returns null if no base
   * currency is given or the rate provider is unavailable (caller keeps native amounts).
   */
  private async getRatesSafe(base?: string): Promise<Record<string, number> | null> {
    if (!base) return null;
    return getRatesSafe(this.exchangeRateService, base);
  }

  async executeCreateExpense(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const dto: CreateExpenseDto = {
      localId: randomUUID(),
      amount: Number(data.amount),
      currencyCode: String(data.currencyCode),
      description: String(data.description || ''),
      categoryId: data.categoryName ? String(data.categoryName) : undefined,
      date: String(data.date || new Date().toISOString().split('T')[0]),
      source: 'manual',
    };

    const { expense } = await this.expensesService.create(accountId, userId, dto);
    if (!expense) {
      return { actionType: 'create_expense', success: false, errorMessage: 'Failed to create expense' };
    }
    return {
      actionType: 'create_expense',
      success: true,
      data: {
        id: expense.id,
        amount: Number(expense.amount),
        currencyCode: expense.currencyCode,
        description: expense.description,
        category: expense.category?.name,
        date: expense.date,
      },
    };
  }

  async executeCreateIncome(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const dto: CreateIncomeDto = {
      localId: randomUUID(),
      amount: Number(data.amount),
      currencyCode: String(data.currencyCode),
      description: String(data.description || ''),
      categoryId: data.categoryName ? String(data.categoryName) : undefined,
      date: String(data.date || new Date().toISOString().split('T')[0]),
    };

    const income = await this.incomesService.create(accountId, userId, dto);
    if (!income) {
      return { actionType: 'create_income', success: false, errorMessage: 'Failed to create income' };
    }
    return {
      actionType: 'create_income',
      success: true,
      data: {
        id: income.id,
        amount: Number(income.amount),
        currencyCode: income.currencyCode,
        description: income.description,
        date: income.date,
      },
    };
  }

  async executeGetExpenses(
    data: Record<string, unknown>,
    accountId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    // Product/item/merchant questions ("how much did I spend on beer") are almost always
    // lifetime questions. If the model didn't scope an explicit period, search the full
    // history so we never miss older purchases (the #1 cause of "found nothing"). An
    // explicit date from the model is always respected.
    const hasKeyword = !!data.descriptionKeyword;
    const todayIso = new Date().toISOString().slice(0, 10);
    const endDate = data.endDate ? String(data.endDate) : todayIso;
    const startDate = data.startDate
      ? String(data.startDate)
      : hasKeyword
        ? ALL_TIME_START
        : `${todayIso.slice(0, 7)}-01`;
    const filters: ExpenseFiltersDto = {
      startDate,
      endDate,
      limit: 500,
    };

    // Resolved, but deliberately NOT pushed into the SQL filter. A category can
    // exist purely as a receipt SPLIT — deposits, alcohol, household — and
    // `expenses.category_id` would never match one, so a pushed-down filter
    // answered "nothing" for a question the Analytics tab answers with a
    // number. The matching happens over the attribution below instead.
    let categoryFilterId: string | undefined;
    if (data.categoryName) {
      const categories = await this.categoriesService.findAll(accountId);
      const match = categories.find(
        (c: { name: string }) => c.name.toLowerCase() === String(data.categoryName).toLowerCase(),
      );
      if (match) categoryFilterId = match.id;
    }

    const result = await this.expensesService.findAll(accountId, filters);
    const expenses = Array.isArray(result.data) ? result.data : [];
    const pagination = result.pagination;

    // Filtering after the fetch means the page cap now bites before the filter
    // rather than after it. Say so rather than truncating silently — same
    // reason the keyword search logs its own cap below.
    if (categoryFilterId && expenses.length >= (filters.limit ?? Infinity)) {
      this.logger.warn(
        `[chat] get_expenses category filter: page cap ${filters.limit} reached before filtering, older matches may be missing`,
      );
    }

    const round2 = (value: number): number => Math.round(value * 100) / 100;

    // One row per expense that answers the question, carrying the categories it
    // counts toward. A category-filtered row reports only its matching share:
    // answering "233.98 spent on deposits" is worse than answering nothing.
    const rows = expenses
      .map((e) => {
        const attribution = attributeToCategories(e);
        if (!categoryFilterId) {
          return { e, attribution, amount: Number(e.amount), categoryName: e.category?.name };
        }
        const mine = attribution.filter((a) => a.categoryId === categoryFilterId);
        if (mine.length === 0) return null;
        return {
          e,
          attribution: mine,
          amount: round2(mine.reduce((sum, a) => sum + a.amount, 0)),
          categoryName: mine[0].categoryName,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const rawList = rows.map(({ e, amount, categoryName }) => ({
      id: e.id,
      amount,
      currencyCode: e.currencyCode,
      description: e.description,
      merchant: e.merchant,
      category: categoryName,
      date: e.date,
      items: Array.isArray(e.items)
        ? e.items.map((it: { id: string; description?: string | null; canonicalName?: string | null; totalPrice: unknown }) => ({
            id: it.id,
            description: it.description,
            canonicalName: it.canonicalName,
            totalPrice: Number(it.totalPrice),
          }))
        : [],
    }));

    // Convert every amount into the user's display currency so the chat answers in one
    // currency. If rates are unavailable we keep native amounts (graceful fallback).
    const rates = await this.getRatesSafe(baseCurrency);
    let fxConverted = false;
    const convert = (amount: number, from: string | null | undefined): { amount: number; currencyCode: string } => {
      if (baseCurrency && rates) {
        const conv = convertAmount(amount, from || baseCurrency, baseCurrency, rates);
        if (conv != null) {
          fxConverted = true;
          return { amount: conv, currencyCode: baseCurrency };
        }
      }
      return { amount, currencyCode: from || 'USD' };
    };
    const expenseList = rawList.map((e) => {
      const c = convert(e.amount, e.currencyCode);
      return c.currencyCode === baseCurrency && baseCurrency
        ? { ...e, amount: c.amount, currencyCode: c.currencyCode, originalAmount: e.amount, originalCurrencyCode: e.currencyCode }
        : e;
    });

    // For product/item keyword queries, flatten receipts into searchable UNITS so the
    // semantic filter can match a "beer" line item inside a grocery receipt (and count
    // only that line's price), not just the receipt's top-level description.
    let matchedUnits: ReturnType<typeof buildSearchUnits> | null = null;
    if (hasKeyword) {
      const units = buildSearchUnits(rawList, convert);
      if (units.length > SEARCH_UNIT_LIMIT) {
        this.logger.warn(`[chat] get_expenses keyword search: ${units.length} units exceeds cap ${SEARCH_UNIT_LIMIT}, truncating (newest first)`);
      }
      matchedUnits = units.slice(0, SEARCH_UNIT_LIMIT);
    }

    const totalsByCurrency: Record<string, number> = {};
    const categoryBreakdown = new Map<string, { name: string; amount: number; count: number; currency: string }>();
    for (const row of rows) {
      const from = row.e.currencyCode;
      const paid = convert(row.amount, from);
      totalsByCurrency[paid.currencyCode] = round2((totalsByCurrency[paid.currencyCode] || 0) + paid.amount);
      // Per split, so the chat's own breakdown agrees with the Analytics tab.
      // The period total above still comes from what was actually paid.
      for (const share of row.attribution) {
        const converted = convert(share.amount, from);
        const key = `${share.categoryName}|${converted.currencyCode}`;
        const entry = categoryBreakdown.get(key)
          || { name: share.categoryName, amount: 0, count: 0, currency: converted.currencyCode };
        entry.amount += converted.amount;
        entry.count += 1;
        categoryBreakdown.set(key, entry);
      }
    }
    const categoryTotals = Array.from(categoryBreakdown.values())
      .map((val) => ({
        category: val.name,
        amount: round2(val.amount),
        count: val.count,
        currencyCode: val.currency,
      }))
      .sort((a, b) => b.amount - a.amount);

    // A category filter is applied in memory, so the query's own total counts
    // the whole period and cannot be reported as the answer's size.
    const actualCount = categoryFilterId ? rows.length : (pagination?.total ?? rows.length);

    return {
      actionType: 'get_expenses',
      success: true,
      data: {
        recentExpenses: expenseList.slice(0, 20),
        // When descriptionKeyword is set, expose ALL searchable units (expense rows +
        // receipt line items) for semantic filtering in ChatService (AI-powered,
        // language-agnostic). ChatService replaces matchedExpenses + totals with the
        // semantically filtered subset.
        ...(hasKeyword && matchedUnits
          ? {
              matchedExpenses: matchedUnits,
              matchedByKeyword: String(data.descriptionKeyword),
            }
          : {}),
        categoryTotals,
        totalsByCurrency,
        count: actualCount,
        startDate,
        endDate,
        ...(fxConverted ? { baseCurrency, fxConverted: true, fxApproximate: true } : {}),
      },
    };
  }

  async executeGetCategoryBreakdown(
    data: Record<string, unknown>,
    accountId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    // Compute the breakdown from the raw expenses (converting each into the display
    // currency) rather than analyticsService.getSummary, which sums across currencies
    // into one currency-blind number that cannot be correctly converted afterwards.
    const result = await this.expensesService.findAll(accountId, {
      startDate: String(data.startDate),
      endDate: String(data.endDate),
      limit: 1000,
    });
    const expenses = Array.isArray(result.data) ? result.data : [];

    const rates = await this.getRatesSafe(baseCurrency);
    let fxConverted = false;
    // Converts into the display currency, flagging that a conversion happened.
    // Falls back to the native amount when no rate is available — the tool's
    // long-standing behaviour, unchanged by the split handling below.
    const conv = (val: number, from: string): number => {
      if (baseCurrency && rates) {
        const c = convertAmount(val, from, baseCurrency, rates);
        if (c != null) { fxConverted = true; return c; }
      }
      return val;
    };

    const catMap = new Map<string, { categoryId?: string; categoryName: string; amount: number; count: number }>();
    const totalsByCurrency: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      const raw = Number(e.amount);
      const from = e.currencyCode || baseCurrency || 'USD';
      const value = conv(raw, from);
      totalsByCurrency[from] = Math.round(((totalsByCurrency[from] || 0) + raw) * 100) / 100;
      // The period total always comes from the expense amount, never from the
      // splits — exactly how analytics.service.ts:194 computes it.
      total += value;

      const addToCategory = (categoryId: string | undefined, categoryName: string, amount: number) => {
        const entry = catMap.get(categoryName) || { categoryId, categoryName, amount: 0, count: 0 };
        entry.amount += amount;
        entry.count += 1;
        catMap.set(categoryName, entry);
      };

      // A receipt split across categories is attributed per split, mirroring
      // analytics.service.ts:218 — otherwise "how much did I spend on alcohol?"
      // answers 0 in chat while the Analytics tab shows 25 zł for the same
      // period. A category breakdown is an analytics surface; budgets and
      // get_budget_status stay deliberately split-blind (design spec,
      // locked decision 1).
      for (const share of attributeToCategories(e)) {
        addToCategory(share.categoryId, share.categoryName, conv(share.amount, from));
      }
    }

    const outCurrency = fxConverted ? baseCurrency : undefined;
    const categories = Array.from(catMap.values())
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        amount: Math.round(c.amount * 100) / 100,
        percentage: total > 0 ? Math.round((c.amount / total) * 1000) / 10 : 0,
        count: c.count,
        currencyCode: outCurrency,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      actionType: 'get_category_breakdown',
      success: true,
      data: {
        categories,
        totalExpenses: Math.round(total * 100) / 100,
        // Native per-currency totals, for transparency when amounts are mixed/unconverted.
        expensesByCurrency: totalsByCurrency,
        period: { startDate: data.startDate, endDate: data.endDate },
        ...(fxConverted ? { baseCurrency, fxConverted: true, fxApproximate: true } : {}),
      },
    };
  }

  /**
   * How much the user has paid in returnable-packaging deposits.
   *
   * Reads `Expense.depositAmount`, NOT the deposit category. The category only
   * exists when the receipt's category split survived (>= 2 categories and
   * reconciling arithmetic), so a chat answer built on it is silent for
   * exactly the trips where the deposit is the whole question — and it would
   * additionally require the model to guess the category's name in the account
   * owner's language. A number carries no language, so this answers a Polish
   * `kaucja` question and a German `Pfand` one through one code path.
   *
   * Default period is the WHOLE history: "how much kaucja have I paid" is
   * almost never scoped to a month, and defaulting to a narrow window is the
   * known first cause of "found nothing" answers (see `executeGetExpenses`).
   */
  async executeGetDepositTotal(
    data: Record<string, unknown>,
    accountId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const todayIso = new Date().toISOString().slice(0, 10);
    const startDate = data.startDate ? String(data.startDate) : ALL_TIME_START;
    const endDate = data.endDate ? String(data.endDate) : todayIso;

    const result = await this.analyticsService.getDepositRows(
      accountId,
      new Date(startDate),
      new Date(endDate),
    );

    // Answering "0" for an account whose amounts we cannot read would be a
    // false statement, not a missing feature — say which it is.
    if ('encryptionRestricted' in result && result.encryptionRestricted) {
      return {
        actionType: 'get_deposit_total',
        success: true,
        data: { encryptionRestricted: true, period: { startDate, endDate } },
      };
    }

    const rates = await this.getRatesSafe(baseCurrency);
    let fxConverted = false;
    // A row in the display currency needs no rate at all, so a single-currency
    // account is answered exactly even when the rate provider is down. A
    // foreign row with no rate returns null and the util drops it from the
    // total rather than adding it in the wrong currency.
    const convert = (amount: number, from: string): number | null => {
      if (!baseCurrency || !from || from === baseCurrency) return amount;
      if (!rates) return null;
      const converted = convertAmount(amount, from, baseCurrency, rates);
      if (converted == null) return null;
      fxConverted = true;
      return converted;
    };

    const summary = summariseDeposits(result.rows, convert);

    return {
      actionType: 'get_deposit_total',
      success: true,
      data: {
        total: summary.total,
        receiptCount: summary.receiptCount,
        byMerchant: summary.byMerchant,
        recent: summary.recent,
        // Native per-currency totals, so an amount dropped for want of a rate
        // is still visible instead of silently missing.
        depositsByCurrency: summary.totalsByCurrency,
        period: { startDate, endDate },
        ...(baseCurrency ? { baseCurrency } : {}),
        ...(fxConverted ? { fxConverted: true } : {}),
        ...(summary.unconvertedCount > 0 ? { fxApproximate: true, unconvertedCount: summary.unconvertedCount } : {}),
        ...(result.truncated ? { truncated: true } : {}),
      },
    };
  }

  /**
   * How much the user has been given in discounts on their purchases.
   *
   * Reads `Expense.discountAmount`, NOT the category split — the split only
   * exists when it survived (>= 2 categories and reconciling arithmetic), so
   * a chat answer built on it is silent for exactly the shopping trips where
   * the discount is the whole question. A number carries no language, so this
   * answers a Polish "rabat" question and a German "Rabatt" one through one
   * code path. Mirrors `executeGetDepositTotal` deliberately.
   *
   * Default period is the WHOLE history, same rationale as the deposit tool:
   * a bare "how much have I saved in discounts" carries no period, and
   * defaulting to a narrow window is the known first cause of "found nothing"
   * answers (see `executeGetExpenses`).
   */
  async executeGetDiscountTotal(
    data: Record<string, unknown>,
    accountId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const todayIso = new Date().toISOString().slice(0, 10);
    const startDate = data.startDate ? String(data.startDate) : ALL_TIME_START;
    const endDate = data.endDate ? String(data.endDate) : todayIso;

    const result = await this.analyticsService.getDiscountRows(
      accountId,
      new Date(startDate),
      new Date(endDate),
    );

    // Answering "0" for an account whose amounts we cannot read would be a
    // false statement, not a missing feature — say which it is.
    if ('encryptionRestricted' in result && result.encryptionRestricted) {
      return {
        actionType: 'get_discount_total',
        success: true,
        data: { encryptionRestricted: true, period: { startDate, endDate } },
      };
    }

    const rates = await this.getRatesSafe(baseCurrency);
    let fxConverted = false;
    // A row in the display currency needs no rate at all, so a single-currency
    // account is answered exactly even when the rate provider is down. A
    // foreign row with no rate returns null and the util drops it from the
    // total rather than adding it in the wrong currency.
    const convert = (amount: number, from: string): number | null => {
      if (!baseCurrency || !from || from === baseCurrency) return amount;
      if (!rates) return null;
      const converted = convertAmount(amount, from, baseCurrency, rates);
      if (converted == null) return null;
      fxConverted = true;
      return converted;
    };

    const summary = summariseDiscounts(result.rows, convert);

    return {
      actionType: 'get_discount_total',
      success: true,
      data: {
        total: summary.total,
        receiptCount: summary.receiptCount,
        byMerchant: summary.byMerchant,
        recent: summary.recent,
        // Native per-currency totals, so an amount dropped for want of a rate
        // is still visible instead of silently missing.
        discountsByCurrency: summary.totalsByCurrency,
        period: { startDate, endDate },
        ...(baseCurrency ? { baseCurrency } : {}),
        ...(fxConverted ? { fxConverted: true } : {}),
        ...(summary.unconvertedCount > 0 ? { fxApproximate: true, unconvertedCount: summary.unconvertedCount } : {}),
        ...(result.truncated ? { truncated: true } : {}),
      },
    };
  }
}
