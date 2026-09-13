import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { PriceCheckSummary } from '@budget/shared-types';
import { AnomalyDetectorsService } from './anomaly-detectors.service';
import type { DetectorExpense } from './anomaly.types';

/**
 * Thin orchestrator: fans a new expense (or a batch of imported expenses) out
 * to the 6 detectors on AnomalyDetectorsService, plus the alert feed's CRUD
 * surface (list/read/dismiss). Detector logic itself lives on
 * AnomalyDetectorsService — see docs/tech-debt/anomaly-service-god-class.md
 * for why this was split.
 */
@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly detectors: AnomalyDetectorsService,
  ) {}

  /** Entry point for a single new expense. Never throws. */
  async checkExpense(accountId: string, userId: string, expenseId: string): Promise<void> {
    try {
      const expense = await this.prisma.expense.findFirst({
        where: { id: expenseId, accountId, isDeleted: false },
      });
      if (!expense) return;
      // duplicate first — highest priority for the daily push cap
      await this.detectors.detectDuplicateCharge(accountId, userId, expense as DetectorExpense);
      await this.detectors.detectPriceIncrease(accountId, userId, expense as DetectorExpense);
      await this.detectors.detectRecurringSuggestion(accountId, userId, expense as DetectorExpense);
      await this.detectors.detectCategorySpike(accountId, userId, expense.categoryId, expense.currencyCode);
      // possible_merge is last — lower priority than genuine duplicate/price alerts
      await this.detectors.detectPossibleMerge(accountId, userId, expense as DetectorExpense);
      // price_overcharge writes feed-only via skipPush: true, so it never touches the push budget.
      await this.detectors.detectPriceOvercharge(accountId, userId, expense as DetectorExpense);
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
        await this.detectors.detectPriceIncrease(accountId, userId, expense as DetectorExpense);
        await this.detectors.detectRecurringSuggestion(accountId, userId, expense as DetectorExpense);
        if (expense.categoryId) {
          categoryCurrencies.set(`${expense.categoryId}:${expense.currencyCode}`, {
            categoryId: expense.categoryId,
            currencyCode: expense.currencyCode,
          });
        }
      }
      for (const { categoryId, currencyCode } of categoryCurrencies.values()) {
        await this.detectors.detectCategorySpike(accountId, userId, categoryId, currencyCode);
      }
    } catch (error) {
      this.logger.error(`checkExpenseBatch failed: ${error}`);
    }
  }

  // ---- Feed (alert CRUD / read API) ----

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

  /**
   * How much the price check has FOUND above the user's usual prices since a
   * given date. Per currency on purpose — this feature never converts between
   * currencies, so a single blended figure would be a lie.
   */
  async getPriceCheckSummary(accountId: string, since: Date): Promise<PriceCheckSummary> {
    const alerts = await this.prisma.anomalyAlert.findMany({
      where: { accountId, type: 'price_overcharge', dismissedAt: null, createdAt: { gte: since } },
      select: { params: true },
    });

    const totalsByCurrency: Record<string, number> = {};
    for (const alert of alerts) {
      const params = alert.params as { currencyCode?: unknown; findings?: unknown } | null;
      const currency = typeof params?.currencyCode === 'string' ? params.currencyCode : null;
      if (!currency || !Array.isArray(params?.findings)) continue;
      for (const finding of params.findings as Array<{ overpaidAmount?: unknown }>) {
        const amount = Number(finding?.overpaidAmount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        // Rounding per-iteration (not once at the end) looks like it violates this
        // codebase's round-once convention, but it doesn't: every stored
        // overpaidAmount is already 2 dp, so this round is only scrubbing float
        // noise from the running sum, not re-deriving precision — it is
        // bit-identical to rounding once after the loop. Do not "fix" this.
        totalsByCurrency[currency] = Math.round(((totalsByCurrency[currency] ?? 0) + amount) * 100) / 100;
      }
    }

    return { totalsByCurrency, alertCount: alerts.length, since: since.toISOString().slice(0, 10) };
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

  /**
   * Resolve-on-delete cleanup: dismiss any active alert that deep-links to an
   * expense that has just been soft-deleted (manual delete, merge, or
   * notification-stub reconciliation). Without this a duplicate_charge /
   * possible_merge alert keeps pointing at a row that no longer exists, and the
   * deep-link dead-ends on "Expense not found" — the user has to hunt down and
   * clean the duplicate by hand (the reported bug). Matches on the alert's
   * top-level `expenseId` column OR on `params.otherExpenseId` (the paired row of
   * a duplicate/merge alert) so deleting EITHER side of the pair clears the alert.
   * Fire-and-forget; never throws.
   */
  async dismissForExpense(accountId: string, expenseId: string): Promise<void> {
    if (!expenseId) return;
    try {
      await this.prisma.anomalyAlert.updateMany({
        where: {
          accountId,
          dismissedAt: null,
          OR: [
            { expenseId },
            { params: { path: ['otherExpenseId'], equals: expenseId } },
          ],
        },
        data: { dismissedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`dismissForExpense failed: ${error}`);
    }
  }
}
