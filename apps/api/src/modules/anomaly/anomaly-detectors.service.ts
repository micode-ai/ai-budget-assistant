import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as ni18n from '../notifications/notification-i18n';
import { PriceHistoryService } from '../price-history/price-history.service';
import {
  checkReceiptPrices,
  perUnitPrice,
  resolveReceiptCheckConfig,
  type ReceiptCheckLine,
} from '../price-history/receipt-check.util';
import { AnomalyAlertWriterService } from './anomaly-alert-writer.service';
import {
  DAY_MS,
  PRICE_INCREASE_FACTOR,
  SPIKE_THRESHOLD_PERCENT,
  detectCycle,
  expensePayee,
  monthKey,
  normalizeMerchant,
} from './anomaly-helpers.util';
import type { DetectorExpense } from './anomaly.types';

/**
 * The 6 independently-evolving anomaly detectors, each with its own domain
 * logic and dedup-key scheme (`dup:`, `price:`, `spike:`, `recur:`, `merge:`,
 * `overcharge:`). Split out of AnomalyService, which stays the thin
 * orchestrator (checkExpense/checkExpenseBatch) + alert CRUD (see
 * docs/tech-debt/anomaly-service-god-class.md). All 6 write through the
 * shared AnomalyAlertWriterService rather than each re-implementing the
 * create+dedup+push mechanism.
 */
@Injectable()
export class AnomalyDetectorsService {
  private readonly logger = new Logger(AnomalyDetectorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceHistory: PriceHistoryService,
    private readonly config: ConfigService,
    private readonly alertWriter: AnomalyAlertWriterService,
  ) {}

  /**
   * Receipt price-check alert write gate (defaults OFF). The mobile card for the
   * price_overcharge alert type ships in a later plan, and the alerts screen's
   * default branch renders the raw type string — so an un-gated deploy would show
   * already-installed apps a card titled "price_overcharge" with an empty body.
   */
  private receiptCheckAlertsEnabled(): boolean {
    return this.config.get<string>('RECEIPT_CHECK_ALERTS_ENABLED') === 'true';
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
    await this.alertWriter.createAlert({
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
    await this.alertWriter.createAlert({
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
    await this.alertWriter.createAlert({
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
   *
   * When the duplicate pair is an auto-captured / imported expense vs a scanned
   * receipt (source 'ocr'), the alert carries `suggestMerge: true` — the receipt
   * is the richer record, so the feed offers to MERGE the two expenses (carrying
   * the receipt's items + image onto the survivor) instead of just flagging a
   * double charge.
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
      select: { id: true, merchant: true, description: true, source: true },
    });
    const other = candidates.find((c: { merchant?: string | null; description?: string | null }) => expensePayee(c) === label);
    if (!other) return;

    // Receipt-scan vs auto-captured/imported row → the same purchase recorded
    // twice by different capture channels. Offer the merge instead of a plain
    // duplicate warning (the receipt carries the line items and the image).
    const autoSources = new Set(['notification', 'import']);
    const expenseIsAuto = autoSources.has(expense.source ?? '');
    const otherIsAuto = autoSources.has((other as { source?: string | null }).source ?? '');
    const expenseIsReceipt = expense.source === 'ocr';
    const otherIsReceipt = (other as { source?: string | null }).source === 'ocr';
    const suggestMerge = (expenseIsAuto && otherIsReceipt) || (otherIsAuto && expenseIsReceipt);

    const params = {
      merchant: expense.merchant?.trim() || expense.description?.trim() || '',
      amount: Number(expense.amount).toFixed(2),
      currencyCode: expense.currencyCode,
      otherExpenseId: other.id,
      ...(suggestMerge ? { suggestMerge: true } : {}),
    };
    await this.alertWriter.createAlert({
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

    await this.alertWriter.createAlert({
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

  /**
   * Persists the receipt price check as one feed row per receipt. The same pure
   * engine also runs inline at scan time; this pass exists because the expense
   * (and therefore the dedup key) does not exist yet during the scan. Never
   * pushes — a notification arriving after the user has left the store has
   * nothing actionable in it.
   */
  async detectPriceOvercharge(
    accountId: string,
    userId: string,
    expense: DetectorExpense,
  ): Promise<void> {
    try {
      const merchant = expense.merchant?.trim();
      if (!merchant) return;

      const items: Array<{
        canonicalName: string | null;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }> = await (this.prisma as any).expenseItem.findMany({
        where: { expenseId: expense.id, isDeleted: false, canonicalName: { not: null } },
        select: { canonicalName: true, quantity: true, unitPrice: true, totalPrice: true },
      });
      if (items.length === 0) return;

      const lines: ReceiptCheckLine[] = items.map((item) => ({
        canonicalName: item.canonicalName as string,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unitPrice: perUnitPrice(item),
      }));

      const config = resolveReceiptCheckConfig(process.env);
      const now = expense.date;
      const since = new Date(now.getTime() - config.lookbackWeeks * 7 * DAY_MS);

      // excludeExpenseId=expense.id: by the time this pass runs, this expense's
      // own items are already committed (ExpensesService.create commits before
      // firing checkExpense) — without this exclusion the receipt being checked
      // would count as its own prior purchase, and this pass would disagree
      // with OcrService.runPriceCheck's inline scan-time result even though both
      // call the same deterministic engine.
      const history = await this.priceHistory.getProductTrendsFor(
        accountId,
        lines.map((l) => l.canonicalName),
        merchant.toLowerCase(),
        since,
        expense.currencyCode,
        expense.id,
      );

      const { findings } = checkReceiptPrices({
        lines,
        history,
        merchant,
        currencyCode: expense.currencyCode,
        now,
        config,
      });
      if (findings.length === 0) return;

      if (!this.receiptCheckAlertsEnabled()) {
        const totalAmount = findings.reduce((sum, f) => sum + f.overpaidAmount, 0).toFixed(2);
        this.logger.log(
          `[PriceCheck] ${findings.length} line(s) above the usual price, total ${totalAmount} ${expense.currencyCode} — alert write disabled`,
        );
        return;
      }

      await this.alertWriter.createAlert({
        accountId,
        userId,
        type: 'price_overcharge',
        dedupKey: `overcharge:${expense.id}`,
        expenseId: expense.id,
        params: {
          merchant,
          currencyCode: expense.currencyCode,
          totalAmount: findings.reduce((sum, f) => sum + f.overpaidAmount, 0).toFixed(2),
          findings,
        },
        skipPush: true,
      });
    } catch (error) {
      // Fail-silent, mirroring OcrService.runPriceCheck's own local catch: without
      // this, a price-check failure here bubbles up into checkExpense's outer
      // handler, which logs at `error` and blames "checkExpense failed" — masking
      // that the actual fault was in this one detector.
      this.logger.warn(`[PriceCheck] detectPriceOvercharge skipped: ${error}`);
    }
  }
}
