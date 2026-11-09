import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { PriceCheckSummary } from '@budget/shared-types';
import { AnomalyDetectorsService } from './anomaly-detectors.service';
import type { DetectorExpense } from './anomaly.types';
import { suppressionSubject } from './anomaly-helpers.util';
import { attributeToCategories, type AttributableExpense } from '../../common/utils/category-attribution';

/** Live splits ride along so the spike check sees split-only categories (ABA-400 §3). */
const SPLITS_INCLUDE = {
  categorySplits: { where: { isDeleted: false }, select: { categoryId: true, amount: true } },
} as const;

/** Every category an expense counts toward — its splits when it has any, else its own. */
function spikeCategories(expense: AttributableExpense): string[] {
  const ids = attributeToCategories(expense).map((a) => a.categoryId).filter((id): id is string => !!id);
  return Array.from(new Set(ids));
}

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
        include: SPLITS_INCLUDE,
      });
      if (!expense) return;
      // duplicate first — highest priority for the daily push cap
      await this.detectors.detectDuplicateCharge(accountId, userId, expense as DetectorExpense);
      await this.detectors.detectPriceIncrease(accountId, userId, expense as DetectorExpense);
      await this.detectors.detectRecurringSuggestion(accountId, userId, expense as DetectorExpense);
      for (const categoryId of spikeCategories(expense)) {
        await this.detectors.detectCategorySpike(accountId, userId, categoryId, expense.currencyCode);
      }
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
        include: SPLITS_INCLUDE,
      });
      for (const expense of expenses) {
        await this.detectors.detectPriceIncrease(accountId, userId, expense as DetectorExpense);
        await this.detectors.detectRecurringSuggestion(accountId, userId, expense as DetectorExpense);
      }
      await this.runCategorySpikes(accountId, userId, expenses);
    } catch (error) {
      this.logger.error(`checkExpenseBatch failed: ${error}`);
    }
  }

  /**
   * Only the category-spike check, for expenses whose splits arrived after the
   * expense itself — the app syncs a scanned receipt's splits as separate
   * changes, so `checkExpense` ran before they existed (ABA-400 §3). Never throws.
   */
  async checkCategorySpikes(accountId: string, userId: string, expenseIds: string[]): Promise<void> {
    try {
      if (expenseIds.length === 0) return;
      const expenses = await this.prisma.expense.findMany({
        where: { id: { in: expenseIds }, accountId, isDeleted: false },
        include: SPLITS_INCLUDE,
      });
      await this.runCategorySpikes(accountId, userId, expenses);
    } catch (error) {
      this.logger.error(`checkCategorySpikes failed: ${error}`);
    }
  }

  /** One spike check per (category, currency) the expenses count toward. */
  private async runCategorySpikes(
    accountId: string,
    userId: string,
    expenses: Array<AttributableExpense & { currencyCode: string }>,
  ): Promise<void> {
    const categoryCurrencies = new Map<string, { categoryId: string; currencyCode: string }>();
    for (const expense of expenses) {
      for (const categoryId of spikeCategories(expense)) {
        categoryCurrencies.set(`${categoryId}:${expense.currencyCode}`, { categoryId, currencyCode: expense.currencyCode });
      }
    }
    for (const { categoryId, currencyCode } of categoryCurrencies.values()) {
      await this.detectors.detectCategorySpike(accountId, userId, categoryId, currencyCode);
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

  /** "Normal for me": mute this alert's type for its merchant/category, then dismiss it. Idempotent. */
  async markNormal(accountId: string, userId: string, id: string) {
    const alert = await this.prisma.anomalyAlert.findFirst({ where: { id, accountId } });
    if (!alert) throw new NotFoundException('Alert not found');
    const params = (alert.params ?? {}) as Record<string, unknown>;
    const subjectKey = suppressionSubject(alert.type, params, alert.categoryId);
    if (!subjectKey) throw new BadRequestException('This alert cannot be marked as normal');
    const label = String(params.merchant ?? params.categoryName ?? '').trim() || subjectKey;
    await this.prisma.anomalySuppression.upsert({
      where: { accountId_type_subjectKey: { accountId, type: alert.type, subjectKey } },
      create: { accountId, type: alert.type, subjectKey, label, createdByUserId: userId },
      update: {},
    });
    await this.prisma.anomalyAlert.update({ where: { id }, data: { dismissedAt: new Date() } });
    return { success: true };
  }

  async listSuppressions(accountId: string) {
    const rows = await this.prisma.anomalySuppression.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async removeSuppression(accountId: string, id: string) {
    const result = await this.prisma.anomalySuppression.deleteMany({ where: { id, accountId } });
    if (result.count === 0) throw new NotFoundException('Suppression not found');
    return { success: true };
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
