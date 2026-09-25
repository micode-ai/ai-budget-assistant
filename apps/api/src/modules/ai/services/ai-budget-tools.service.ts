import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BudgetsService } from '../../budgets/budgets.service';
import { CategoriesService } from '../../categories/categories.service';
import { ExchangeRateService } from '../../currency-exchange/exchange-rate.service';
import { getRatesSafe, convertAmount } from '../../../common/utils/fx';
import type { ChatActionResult } from '@budget/shared-types';

/**
 * The budget/category chat tools: create_budget, get_budget_status, create_category.
 * Extracted from AiToolsService (tech-debt ai-tools-service-god-file) — see
 * AiToolsService.executeAction for the dispatch switch that calls into this class.
 */
@Injectable()
export class AiBudgetToolsService {
  private readonly logger = new Logger(AiBudgetToolsService.name);

  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly categoriesService: CategoriesService,
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

  async executeCreateBudget(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    let categoryId: string | undefined;
    if (data.categoryName) {
      const categories = await this.categoriesService.findAll(accountId);
      const match = categories.find(
        (c: { name: string }) => c.name.toLowerCase() === String(data.categoryName).toLowerCase(),
      );
      categoryId = match?.id;
    }

    const dto = {
      localId: randomUUID(),
      name: String(data.name),
      amount: Number(data.amount),
      currencyCode: String(data.currencyCode),
      period: String(data.period),
      startDate: String(data.startDate),
      endDate: data.endDate ? String(data.endDate) : undefined,
      categoryId,
    };

    const budget = await this.budgetsService.create(accountId, userId, dto);
    if (!budget) {
      return { actionType: 'create_budget', success: false, errorMessage: 'Failed to create budget' };
    }
    return {
      actionType: 'create_budget',
      success: true,
      data: {
        id: budget.id,
        name: budget.name,
        amount: Number(budget.amount),
        currencyCode: budget.currencyCode,
        period: budget.period,
      },
    };
  }

  async executeCreateCategory(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const name = String(data.name).trim();
    const type = String(data.type);

    if (name.length === 0 || name.length > 50) {
      return { actionType: 'create_category', success: false, errorMessage: 'Category name must be 1-50 characters' };
    }

    try {
      const category = await this.categoriesService.create(accountId, userId, { name, type });
      return {
        actionType: 'create_category',
        success: true,
        data: {
          id: category.id,
          name: category.name,
          type: category.type,
        },
      };
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        return { actionType: 'create_category', success: false, errorMessage: `Category "${name}" already exists` };
      }
      throw error;
    }
  }

  async executeGetBudgetStatus(
    data: Record<string, unknown>,
    accountId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const budgets = await this.budgetsService.findAll(accountId, { isActive: true });
    let targetBudgets = Array.isArray(budgets) ? budgets : [];

    if (data.budgetName) {
      const name = String(data.budgetName).toLowerCase();
      targetBudgets = targetBudgets.filter((b: any) => b.name.toLowerCase().includes(name));
    }
    if (data.categoryName) {
      const catName = String(data.categoryName).toLowerCase();
      targetBudgets = targetBudgets.filter((b: any) =>
        b.category?.name?.toLowerCase().includes(catName),
      );
    }

    // Convert monetary fields into the display currency; percentageUsed is a ratio (unchanged).
    const rates = await this.getRatesSafe(baseCurrency);
    let fxConverted = false;
    // Convert a value from the budget's currency into the display currency (no-op without rates).
    const conv = (val: number, from: string): { value: number; currency: string } => {
      if (baseCurrency && rates) {
        const c = convertAmount(val, from || baseCurrency, baseCurrency, rates);
        if (c != null) { fxConverted = true; return { value: c, currency: baseCurrency }; }
      }
      return { value: val, currency: from };
    };

    // No HTTP request reaches this dispatcher, so the anchor is resolved from
    // the account row directly — same reasoning as BudgetAlertService — so the
    // chat answer agrees with what the budget screen shows for an anchored account.
    const anchorDay = await this.budgetsService.getAccountAnchorDay(accountId);

    const progressList = await Promise.all(
      targetBudgets.map(async (b: any) => {
        const cur = b.currencyCode;
        try {
          const progress = await this.budgetsService.getProgress(accountId, b.id, anchorDay);
          return {
            name: b.name,
            amount: conv(Number(b.amount), cur).value,
            currencyCode: conv(Number(b.amount), cur).currency,
            period: b.period,
            category: b.category?.name,
            spent: conv(progress.spent, cur).value,
            remaining: conv(progress.remaining, cur).value,
            // overBy is precomputed server-side — the LLM must report this
            // verbatim; never recompute spent − amount.
            overBy: conv(progress.overBy, cur).value,
            percentageUsed: progress.percentageUsed,
            isOverBudget: progress.isOverBudget,
            daysRemaining: progress.daysRemaining,
          };
        } catch {
          return {
            name: b.name,
            amount: conv(Number(b.amount), cur).value,
            currencyCode: conv(Number(b.amount), cur).currency,
            period: b.period,
            error: 'Could not calculate progress',
          };
        }
      }),
    );

    return {
      actionType: 'get_budget_status',
      success: true,
      data: {
        budgets: progressList,
        count: progressList.length,
        ...(fxConverted ? { baseCurrency, fxConverted: true, fxApproximate: true } : {}),
      },
    };
  }
}
