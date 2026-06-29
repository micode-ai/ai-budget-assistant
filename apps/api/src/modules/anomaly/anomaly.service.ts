import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AnomalyAlertType } from '@budget/shared-types';
import * as ni18n from '../notifications/notification-i18n';

const PUSH_DAILY_CAP = 3;
export const PRICE_INCREASE_FACTOR = 1.1;
export const SPIKE_THRESHOLD_PERCENT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds in one calendar day — exported so other modules can reuse the same constant. */
export const DUP_DAY_MS = DAY_MS;

/**
 * Canonical payee label for dedup predicates P and Q.
 * Prefers merchant over description, trims whitespace, lowercases.
 * Returns '' when both fields are absent/empty — callers must treat '' as "unidentifiable"
 * and must NOT match it against another '' (empty-vs-empty is NOT a match).
 */
export function expensePayee(e: { merchant?: string | null; description?: string | null }): string {
  return (e.merchant?.trim() || e.description?.trim() || '').toLowerCase();
}

export function normalizeMerchant(merchant: string): string {
  return merchant.trim().toLowerCase();
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 3+ same-amount charges form a series when every gap between the 3 most
 * recent consecutive charges falls in the monthly (25–35 d) or weekly (6–8 d) window.
 */
export function detectCycle(dates: Date[]): 'monthly' | 'weekly' | null {
  if (dates.length < 3) return null;
  const last = dates.slice(-3);
  const gaps = [
    (last[1].getTime() - last[0].getTime()) / DAY_MS,
    (last[2].getTime() - last[1].getTime()) / DAY_MS,
  ];
  if (gaps.every((g) => g >= 25 && g <= 35)) return 'monthly';
  if (gaps.every((g) => g >= 6 && g <= 8)) return 'weekly';
  return null;
}

export interface CreateAlertInput {
  accountId: string;
  userId: string;
  type: AnomalyAlertType;
  dedupKey: string;
  params: Record<string, unknown>;
  expenseId?: string;
  categoryId?: string;
  pushTitle: (lang: string) => string;
  pushBody: (lang: string) => string;
}

/** The expense fields the detectors read — callers must pass a Prisma Expense row (or superset). */
export interface DetectorExpense {
  id: string;
  merchant: string | null;
  description: string | null;
  amount: string | number | { toString(): string }; // Prisma Decimal serializes as string | number — always wrap with Number() for arithmetic
  currencyCode: string;
  date: Date;
  recurringId: string | null;
  isRecurring: boolean;
  categoryId: string | null;
  importBatchId: string | null;
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Insert a feed row (dedupKey collision = already alerted, silent skip) and
   * push it unless the account already received PUSH_DAILY_CAP pushes today.
   */
  async createAlert(input: CreateAlertInput): Promise<void> {
    let alert: { id: string };
    try {
      alert = await this.prisma.anomalyAlert.create({
        data: {
          accountId: input.accountId,
          userId: input.userId,
          type: input.type,
          dedupKey: input.dedupKey,
          params: input.params as object,
          expenseId: input.expenseId ?? null,
          categoryId: input.categoryId ?? null,
        },
        select: { id: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return; // already alerted for this dedupKey
      throw err;
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    // Read-then-act race: two concurrent alerts may both pass the cap check and
    // overshoot by 1-2 pushes. Known and acceptable — the cap is a courtesy limit.
    const sentToday = await this.prisma.anomalyAlert.count({
      where: { accountId: input.accountId, pushSent: true, createdAt: { gte: todayStart } },
    });
    if (sentToday >= PUSH_DAILY_CAP) return;

    const sentOk = await this.notifications.sendToUser(
      input.userId,
      input.pushTitle,
      input.pushBody,
      { alertId: alert.id, anomalyType: input.type, expenseId: input.expenseId },
      'spending_anomaly',
    );
    if (sentOk) {
      await this.prisma.anomalyAlert.update({ where: { id: alert.id }, data: { pushSent: true } });
    }
  }

  /** Entry point for a single new expense. Never throws. */
  async checkExpense(accountId: string, userId: string, expenseId: string): Promise<void> {
    try {
      const expense = await this.prisma.expense.findFirst({
        where: { id: expenseId, accountId, isDeleted: false },
      });
      if (!expense) return;
      // duplicate first — highest priority for the daily push cap
      await this.detectDuplicateCharge(accountId, userId, expense as DetectorExpense);
      await this.detectPriceIncrease(accountId, userId, expense as DetectorExpense);
      await this.detectRecurringSuggestion(accountId, userId, expense as DetectorExpense);
      await this.detectCategorySpike(accountId, userId, expense.categoryId, expense.currencyCode);
      // possible_merge is last — lower priority than genuine duplicate/price alerts
      await this.detectPossibleMerge(accountId, userId, expense as DetectorExpense);
    } catch (error) {
      this.logger.error(`checkExpense failed: ${error}`);
    }
  }

  /** Entry point for import commits. Skips the duplicate detector (preview already dedups). */
  async checkExpenseBatch(accountId: string, userId: string, expenseIds: string[]): Promise<void> {
    try {
      if (expenseIds.length === 0) return;
      const expenses = await this.prisma.expense.findMany({
        where: { id: { in: expenseIds }, accountId, isDeleted: false },
      });
      const categoryCurrencies = new Map<string, { categoryId: string; currencyCode: string }>();
      for (const expense of expenses) {
        await this.detectPriceIncrease(accountId, userId, expense as DetectorExpense);
        await this.detectRecurringSuggestion(accountId, userId, expense as DetectorExpense);
        if (expense.categoryId) {
          categoryCurrencies.set(`${expense.categoryId}:${expense.currencyCode}`, {
            categoryId: expense.categoryId,
            currencyCode: expense.currencyCode,
          });
        }
      }
      for (const { categoryId, currencyCode } of categoryCurrencies.values()) {
        await this.detectCategorySpike(accountId, userId, categoryId, currencyCode);
      }
    } catch (error) {
      this.logger.error(`checkExpenseBatch failed: ${error}`);
    }
  }

  // ---- Feed ----

  async findAll(accountId: string, unreadOnly: boolean) {
    const [alerts, unreadCount] = await Promise.all([
      this.prisma.anomalyAlert.findMany({
        where: { accountId, dismissedAt: null, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          accountId: true,
          userId: true,
          type: true,
          params: true,
          expenseId: true,
          categoryId: true,
          readAt: true,
          dismissedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.anomalyAlert.count({
        where: { accountId, dismissedAt: null, readAt: null },
      }),
    ]);
    return { alerts, unreadCount };
  }

  async markRead(accountId: string, id: string) {
    const result = await this.prisma.anomalyAlert.updateMany({
      where: { id, accountId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: result.count };
  }

  async markAllRead(accountId: string) {
    const result = await this.prisma.anomalyAlert.updateMany({
      where: { accountId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: result.count };
  }

  async dismiss(accountId: string, id: string) {
    const result = await this.prisma.anomalyAlert.updateMany({
      where: { id, accountId },
      data: { dismissedAt: new Date() },
    });
    return { success: true, updated: result.count };
  }

  /** A tracked subscription or recurring series charged >10% more than before. */
  async detectPriceIncrease(accountId: string, userId: string, expense: DetectorExpense): Promise<void> {
    const amount = Number(expense.amount);
    if (amount <= 0) return;
    const merchantNorm = expense.merchant?.trim() ? normalizeMerchant(expense.merchant) : null;
    const descNorm = expense.description?.trim() ? normalizeMerchant(expense.description) : null;

    let prevAmount: number | null = null;
    let seriesKey: string | null = null;

    // 1) active tracked subscription matched by name vs merchant or description
    if (merchantNorm || descNorm) {
      const subs = await this.prisma.userSubscription.findMany({
        where: { accountId, isActive: true, currencyCode: expense.currencyCode },
        select: { id: true, name: true, amount: true },
      });
      const sub = subs.find((s: { name: string }) => {
        const n = normalizeMerchant(s.name);
        return n === merchantNorm || n === descNorm;
      });
      if (sub) {
        prevAmount = Number(sub.amount);
        seriesKey = merchantNorm ?? sub.id;
      }
    }

    // 2) else: previous expense of the same recurring series
    if (prevAmount === null && expense.recurringId) {
      const prev = await this.prisma.expense.findFirst({
        where: {
          accountId,
          isDeleted: false,
          recurringId: expense.recurringId,
          currencyCode: expense.currencyCode,
          id: { not: expense.id },
          date: { lt: expense.date },
        },
        orderBy: { date: 'desc' },
        select: { amount: true },
      });
      if (prev) {
        prevAmount = Number(prev.amount);
        seriesKey = merchantNorm ?? expense.recurringId;
      }
    }

    if (prevAmount === null || prevAmount <= 0 || !seriesKey) return;
    if (amount <= prevAmount * PRICE_INCREASE_FACTOR) return;

    const params = {
      merchant: expense.merchant ?? expense.description ?? '',
      oldAmount: prevAmount.toFixed(2),
      newAmount: amount.toFixed(2),
      currencyCode: expense.currencyCode,
      percent: Math.round(((amount - prevAmount) / prevAmount) * 100),
    };
    await this.createAlert({
      accountId,
      userId,
      type: 'price_increase',
      dedupKey: `price:${seriesKey}:${monthKey(expense.date)}`,
      params,
      expenseId: expense.id,
      pushTitle: (lang) => ni18n.priceIncreaseTitle(lang, params),
      pushBody: (lang) => ni18n.priceIncreaseBody(lang, params),
    });
  }

  /** 3+ regular same-amount charges from an untracked merchant → suggest tracking as a subscription. */
  async detectRecurringSuggestion(accountId: string, userId: string, expense: DetectorExpense): Promise<void> {
    if (!expense.merchant?.trim()) return;
    if (expense.isRecurring || expense.recurringId) return;
    const merchantNorm = normalizeMerchant(expense.merchant);

    const subs = await this.prisma.userSubscription.findMany({
      where: { accountId, isActive: true },
      select: { name: true },
    });
    if (subs.some((s: { name: string }) => normalizeMerchant(s.name) === merchantNorm)) return;

    const charges = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        merchant: { equals: expense.merchant, mode: 'insensitive' },
        amount: expense.amount as string | number,
        currencyCode: expense.currencyCode,
        date: { gte: new Date(expense.date.getTime() - 100 * DAY_MS), lte: expense.date },
      },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    if (charges.length < 3) return;

    const cycle = detectCycle(charges.map((c: { date: Date }) => c.date));
    if (!cycle) return;

    const params = {
      merchant: expense.merchant,
      amount: Number(expense.amount).toFixed(2),
      currencyCode: expense.currencyCode,
      cycle,
    };
    const i18nParams = { merchant: params.merchant, amount: params.amount, currencyCode: params.currencyCode };
    await this.createAlert({
      accountId,
      userId,
      type: 'recurring_suggestion',
      dedupKey: `recur:${merchantNorm}`,
      params,
      expenseId: expense.id,
      pushTitle: (lang) => ni18n.recurringSuggestionTitle(lang, i18nParams),
      pushBody: (lang) => ni18n.recurringSuggestionBody(lang, i18nParams),
    });
  }

  /**
   * Current-month category total ≥30% above the avg of the previous ≤3 months (≥2 required).
   * Compared per currency — summing mixed currencies would produce meaningless spikes.
   */
  async detectCategorySpike(
    accountId: string,
    userId: string,
    categoryId: string | null,
    currencyCode: string,
  ): Promise<void> {
    if (!categoryId) return;
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const current = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: { accountId, categoryId, currencyCode, isDeleted: false, date: { gte: currentMonthStart } },
    });
    const currentAmount = Number(current._sum.amount ?? 0);
    if (currentAmount <= 0) return;

    const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
    const previous = await this.prisma.expense.findMany({
      where: { accountId, categoryId, currencyCode, isDeleted: false, date: { gte: threeMonthsAgo, lt: currentMonthStart } },
      select: { amount: true, date: true },
    });
    const byMonth = new Map<string, number>();
    for (const e of previous) {
      const k = `${e.date.getUTCFullYear()}-${e.date.getUTCMonth()}`;
      byMonth.set(k, (byMonth.get(k) ?? 0) + Number(e.amount));
    }
    if (byMonth.size < 2) return;
    const avg = Array.from(byMonth.values()).reduce((a, b) => a + b, 0) / byMonth.size;
    if (avg <= 0) return;

    const rawPercent = ((currentAmount - avg) / avg) * 100;
    if (rawPercent < SPIKE_THRESHOLD_PERCENT) return;
    const percent = Math.round(rawPercent);

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, accountId },
      select: { name: true },
    });
    const i18nParams = { categoryName: category?.name ?? 'Uncategorized', percent };
    await this.createAlert({
      accountId,
      userId,
      type: 'category_spike',
      dedupKey: `spike:${categoryId}:${monthKey(now)}`,
      params: { categoryId, ...i18nParams },
      categoryId,
      pushTitle: (lang) => ni18n.anomalyTitle(lang, i18nParams),
      pushBody: (lang) => ni18n.anomalyBody(lang, i18nParams),
    });
  }

  /**
   * Same payee + amount + currency within ±1 calendar day → possible double billing.
   * The "payee" is the merchant, or the description when no merchant is set, so a
   * duplicated expense without a merchant (just a description) is still caught.
   */
  async detectDuplicateCharge(accountId: string, userId: string, expense: DetectorExpense): Promise<void> {
    const label = expensePayee(expense);
    if (!label) return; // nothing to identify the charge by

    // Candidates share amount + currency + date window; the payee label is
    // matched in JS so merchant OR description can identify the duplicate.
    const candidates = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        id: { not: expense.id },
        amount: expense.amount as string | number,
        currencyCode: expense.currencyCode,
        date: {
          gte: new Date(expense.date.getTime() - DAY_MS),
          lte: new Date(expense.date.getTime() + DAY_MS),
        },
        ...(expense.importBatchId ? { NOT: { importBatchId: expense.importBatchId } } : {}),
      },
      select: { id: true, merchant: true, description: true },
    });
    const other = candidates.find((c: { merchant?: string | null; description?: string | null }) => expensePayee(c) === label);
    if (!other) return;

    const params = {
      merchant: expense.merchant?.trim() || expense.description?.trim() || '',
      amount: Number(expense.amount).toFixed(2),
      currencyCode: expense.currencyCode,
      otherExpenseId: other.id,
    };
    await this.createAlert({
      accountId,
      userId,
      type: 'duplicate_charge',
      dedupKey: `dup:${expense.id}`,
      params,
      expenseId: expense.id,
      pushTitle: (lang) => ni18n.duplicateChargeTitle(lang, { merchant: params.merchant, amount: params.amount, currencyCode: params.currencyCode }),
      pushBody: (lang) => ni18n.duplicateChargeBody(lang, { merchant: params.merchant, amount: params.amount, currencyCode: params.currencyCode }),
    });
  }

  /**
   * Tier 2 — cross-currency suggest-merge (predicate Q).
   * Fires when a newly-created expense Q-matches an existing account expense:
   * same payee + date ±1 day + DIFFERENT currency. Never auto-acts; inserts a
   * 'possible_merge' feed row so the user can confirm the merge manually.
   * P and Q are mutually exclusive (same-currency vs different-currency), so this
   * can never fire on the same pair as detectDuplicateCharge.
   */
  async detectPossibleMerge(accountId: string, userId: string, expense: DetectorExpense): Promise<void> {
    const label = expensePayee(expense);
    if (!label) return;

    const candidates = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        id: { not: expense.id },
        // Q: currencies DIFFER — distinguishes this from detectDuplicateCharge (same currency)
        currencyCode: { not: expense.currencyCode },
        date: {
          gte: new Date(expense.date.getTime() - DAY_MS),
          lte: new Date(expense.date.getTime() + DAY_MS),
        },
      },
      select: { id: true, merchant: true, description: true, currencyCode: true, amount: true },
    });

    const other = candidates.find((c) => expensePayee(c) === label);
    if (!other) return;

    const params = {
      expenseId: expense.id,
      otherExpenseId: other.id,
      merchant: expense.merchant?.trim() || expense.description?.trim() || '',
      currencyA: expense.currencyCode,
      currencyB: other.currencyCode,
      amountA: Number(expense.amount).toFixed(2),
      amountB: Number(other.amount).toFixed(2),
    };

    // dedupKey is order-independent: same sorted pair produces the same key regardless
    // of which expense was created second. The @@unique on anomaly_alerts makes this
    // fire exactly once per pair, ever.
    const dedupKey = `merge:${[expense.id, other.id].sort().join(':')}`;

    await this.createAlert({
      accountId,
      userId,
      type: 'possible_merge',
      dedupKey,
      params,
      expenseId: expense.id,
      pushTitle: (lang) => ni18n.possibleMergeTitle(lang, params),
      pushBody: (lang) => ni18n.possibleMergeBody(lang, params),
    });
  }
}
