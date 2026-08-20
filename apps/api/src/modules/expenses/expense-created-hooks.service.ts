import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AnomalyService, expensePayee, DUP_DAY_MS } from '../anomaly/anomaly.service';
import { FamilyFeedService } from '../family-feed/family-feed.service';
import { CommunityPriceService } from '../community-prices/community-price.service';
import { InflationShieldTrackingService } from '../insights/inflation-shield-tracking.service';
import { ProductRulesService } from '../merchant-rules/product-rules.service';
import { invalidateExpenseChatCache } from './expense-cache.util';

/** The subset of a persisted Expense row the post-create hook chain needs. */
export interface ExpenseCreatedHookExpense {
  id: string;
  amount: unknown;
  currencyCode: string;
  source: string | null;
}

/** A resolved, already-server-categorized receipt line, ready to teach a product rule. */
export interface LearnableExpenseItem {
  canonicalName: string;
  categoryId: string;
}

/**
 * The post-create fire-and-forget hook chain, extracted out of ExpensesService
 * (see docs/tech-debt/expenses-service-regrowth-after-split.md). A new "what
 * happens after an expense is created" feature belongs HERE — a new
 * `@Optional()` sibling-service injection plus a new branch in
 * `onExpenseCreated` — not another constructor param and inline `.catch()` on
 * `ExpensesService` itself, which is exactly how that class regrew after the
 * ABA-368 split (bulkUpdate -> ExpenseBulkService,
 * mergeExpenses/moveToAccount -> ExpenseCrossAccountService).
 *
 * `ExpensesService.create()` calls `onExpenseCreated()` exactly once,
 * fire-and-forget, only for genuinely new expenses (`result.isNew`).
 * `onExpenseCreated` never throws into the caller — every branch already
 * swallows its own errors.
 */
@Injectable()
export class ExpenseCreatedHooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyService: AnomalyService,
    private readonly cacheService: CacheService,
    @Optional() private readonly familyFeed?: FamilyFeedService,
    @Optional() private readonly communityPrices?: CommunityPriceService,
    @Optional() private readonly shieldTracking?: InflationShieldTrackingService,
    @Optional() private readonly productRules?: ProductRulesService,
  ) {}

  /**
   * Tier 1 Case A — stub-yield reconciliation.
   * Called AFTER the create transaction commits (to keep the create lock short)
   * and BEFORE anomalyService.checkExpense fires (so detectDuplicateCharge
   * won't see the already-reconciled stub and raise a spurious alert).
   *
   * Finds a non-deleted source:'notification' expense in the same account that
   * satisfies predicate P (same amount + currency + date ±1 day + same payee)
   * and soft-deletes it. SAFETY: only source:'notification' rows are candidates —
   * two genuine non-notification expenses can never delete each other.
   */
  private async reconcileNotificationStub(accountId: string, newExpenseId: string): Promise<void> {
    const e = await this.prisma.expense.findFirst({
      where: { id: newExpenseId, accountId, isDeleted: false },
      select: {
        id: true,
        amount: true,
        currencyCode: true,
        date: true,
        merchant: true,
        description: true,
      },
    });
    if (!e) return;

    const label = expensePayee(e as any);
    if (!label) return; // unidentifiable — never dedup blank vs blank

    const stubs = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        source: 'notification',
        id: { not: e.id },
        amount: e.amount as any,
        currencyCode: e.currencyCode,
        date: {
          gte: new Date((e.date as Date).getTime() - DUP_DAY_MS),
          lte: new Date((e.date as Date).getTime() + DUP_DAY_MS),
        },
      },
      select: { id: true, merchant: true, description: true },
    });

    const stub = stubs.find((s) => expensePayee(s as any) === label);
    if (!stub) return;

    await this.prisma.expense.update({
      where: { id: stub.id },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });

    // The stub may already carry a duplicate_charge alert — drop it so it doesn't
    // dead-end on the now-deleted stub.
    void this.anomalyService.dismissForExpense(accountId, stub.id);

    // Also invalidate the cache since we mutated a row outside the main transaction.
    await invalidateExpenseChatCache(this.cacheService, accountId);
  }

  /**
   * Run every post-create side effect for a genuinely new expense.
   * `learnableItems` must already be the RESOLVED (server categoryId,
   * non-empty canonicalName/description) list — computing it from
   * `dto.items`/`resolvedItemCategoryIds` is the caller's job
   * (`ExpensesService.create()`), since that's where the raw dto and the
   * resolved-per-index category ids both live.
   */
  async onExpenseCreated(
    accountId: string,
    userId: string,
    expense: ExpenseCreatedHookExpense,
    learnableItems: LearnableExpenseItem[],
  ): Promise<void> {
    // ORDERING IS CRITICAL: reconcileNotificationStub must run BEFORE checkExpense
    // so detectDuplicateCharge sees the stub already gone (isDeleted:true) and
    // does not raise a spurious duplicate_charge alert for the auto-reconciled pair.
    const run = async () => {
      if (expense.source !== 'notification') {
        // Case A: a richer source supersedes the stub. Soft-delete any matching
        // source:'notification' stub. SAFETY: query is hard-scoped to notification
        // rows — two genuine non-notification expenses can never delete each other.
        await this.reconcileNotificationStub(accountId, expense.id).catch(() => {});
      }
      await this.anomalyService.checkExpense(accountId, userId, expense.id).catch(() => {});
    };
    void run().catch(() => {});

    // fire-and-forget: record in family feed (non-personal accounts only)
    void this.familyFeed
      ?.recordEvent(accountId, userId, 'EXPENSE_ADDED', expense.id, {
        amount: Number(expense.amount),
        currency: expense.currencyCode,
      })
      .catch(() => {});

    // fire-and-forget: contribute to the community price corpus (ABA-335,
    // consent + location + E2EE gated inside the service; never throws)
    void this.communityPrices?.recordContribution(accountId, userId, expense.id).catch(() => {});

    // fire-and-forget: credit any active inflation-shield recommendation this
    // purchase acts on (realized-savings tracking). Never throws.
    void this.shieldTracking?.reconcilePurchase(accountId, expense.id).catch(() => {});

    // A new expense changes the shield's inputs (new price point) and may have
    // just reconciled a recommendation — bust the cached shield so the next read
    // recomputes. Fire-and-forget; never throws.
    void this.cacheService.delByPrefix(`shield:${accountId}:`).catch(() => {});

    // fire-and-forget: teach a product rule from every categorized receipt
    // line, so the next receipt containing that product classifies for free.
    // `learnableItems` already carries the RESOLVED server categoryId, not the
    // raw client-supplied one — the rule map is consumed elsewhere as a real
    // server categoryId. Never throws: ProductRulesService.upsertRules already
    // never throws on its own, and the .catch here is the belt-and-suspenders
    // guarantee for this call site specifically.
    if (learnableItems.length > 0) {
      void this.productRules?.upsertRules(accountId, learnableItems).catch(() => {});
    }
  }
}
