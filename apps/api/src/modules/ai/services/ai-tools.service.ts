import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { CacheService } from '../../../common/cache/cache.service';
import { AiExpenseToolsService } from './ai-expense-tools.service';
import { AiBudgetToolsService } from './ai-budget-tools.service';
import { AiDebtGoalToolsService } from './ai-debt-goal-tools.service';
import { AiShoppingToolsService } from './ai-shopping-tools.service';
import { AiUndoToolsService } from './ai-undo-tools.service';
import { AI_TOOL_DEFINITIONS, AI_WRITE_ACTION_TYPES } from './ai-tool-schemas';
import type { ChatActionType, ChatActionResult } from '@budget/shared-types';

/**
 * Thin dispatcher over the 18 AI function-calling tools. The schemas live in
 * ai-tool-schemas.ts and the per-tool logic lives in five domain provider services
 * (ai-expense-tools, ai-budget-tools, ai-debt-goal-tools, ai-shopping-tools,
 * ai-undo-tools) — see tech-debt ai-tools-service-god-file for why this was split.
 * This class's public API (getToolDefinitions/isWriteAction/executeAction/
 * executeWithCache) is unchanged, so chat.service.ts needed no changes.
 */
@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly aiExpenseTools: AiExpenseToolsService,
    private readonly aiBudgetTools: AiBudgetToolsService,
    private readonly aiDebtGoalTools: AiDebtGoalToolsService,
    private readonly aiShoppingTools: AiShoppingToolsService,
    private readonly aiUndoTools: AiUndoToolsService,
  ) {}

  getToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return AI_TOOL_DEFINITIONS;
  }

  // 'check_affordability' is intentionally NOT in this list — it is a READ action
  // (no confirmation required, executes immediately via executeWithCache).
  isWriteAction(actionType: string): boolean {
    return (AI_WRITE_ACTION_TYPES as readonly string[]).includes(actionType);
  }

  buildToolCacheKey(
    actionType: ChatActionType,
    accountId: string,
    args: Record<string, unknown>,
    baseCurrency?: string,
  ): string {
    const sortedArgs = Object.keys(args)
      .sort()
      .reduce((acc, k) => { acc[k] = args[k]; return acc; }, {} as Record<string, unknown>);
    // baseCurrency is per-user (display currency) and changes the converted amounts,
    // so it MUST be part of the key — otherwise two members of one account with
    // different display currencies would share a cached (wrongly-converted) result.
    return `chat:${actionType}:${accountId}:${baseCurrency || '-'}:${JSON.stringify(sortedArgs)}`;
  }

  async executeAction(
    actionType: ChatActionType,
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    try {
      switch (actionType) {
        case 'create_expense':
          return await this.aiExpenseTools.executeCreateExpense(data, accountId, userId);
        case 'create_income':
          return await this.aiExpenseTools.executeCreateIncome(data, accountId, userId);
        case 'create_budget':
          return await this.aiBudgetTools.executeCreateBudget(data, accountId, userId);
        case 'create_category':
          return await this.aiBudgetTools.executeCreateCategory(data, accountId, userId);
        case 'get_expenses':
          return await this.aiExpenseTools.executeGetExpenses(data, accountId, baseCurrency);
        case 'get_budget_status':
          return await this.aiBudgetTools.executeGetBudgetStatus(data, accountId, baseCurrency);
        case 'get_category_breakdown':
          return await this.aiExpenseTools.executeGetCategoryBreakdown(data, accountId, baseCurrency);
        case 'get_debt_summary':
          return await this.aiDebtGoalTools.executeGetDebtSummary(accountId);
        case 'record_debt_repayment':
          return await this.aiDebtGoalTools.executeRecordDebtRepayment(data, accountId, userId);
        case 'create_debt':
          return await this.aiDebtGoalTools.executeCreateDebt(data, accountId, userId);
        case 'update_goal_balance':
          return await this.aiDebtGoalTools.executeUpdateGoalBalance(data, accountId, userId);
        case 'check_affordability':
          return await this.aiDebtGoalTools.executeCheckAffordability(data, accountId, userId, baseCurrency);
        case 'add_to_shopping_list':
          return await this.aiShoppingTools.executeAddToShoppingList(data, accountId, userId);
        case 'get_inflation_shield':
          return await this.aiShoppingTools.executeGetInflationShield(accountId, userId, baseCurrency);
        case 'remove_from_shopping_list':
          return await this.aiShoppingTools.executeRemoveFromShoppingList(data, accountId);
        case 'get_shopping_suggestions':
          return await this.aiShoppingTools.executeGetShoppingSuggestions(accountId);
        case 'get_deposit_total':
          return await this.aiExpenseTools.executeGetDepositTotal(data, accountId, baseCurrency);
        case 'get_discount_total':
          return await this.aiExpenseTools.executeGetDiscountTotal(data, accountId, baseCurrency);
        case 'undo_last_action':
          return await this.aiUndoTools.executeUndoLastAction(data, accountId);
        default:
          return { actionType, success: false, errorMessage: 'Unknown action type' };
      }
    } catch (error) {
      return {
        actionType,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Action execution failed',
      };
    }
  }

  async executeWithCache(
    actionType: ChatActionType,
    args: Record<string, unknown>,
    accountId: string,
    userId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const cacheKey = accountId ? this.buildToolCacheKey(actionType, accountId, args, baseCurrency) : null;
    if (cacheKey) {
      const cached = await this.cacheService.get<ChatActionResult>(cacheKey);
      if (cached) {
        this.logger.log(`[chat] cache hit ${cacheKey}`);
        return cached;
      }
      const result = await this.executeAction(actionType, args, accountId, userId, baseCurrency);
      // 10-min TTL keeps "this month" answers fresh enough
      await this.cacheService.set(cacheKey, result, 600);
      return result;
    }
    return this.executeAction(actionType, args, accountId, userId, baseCurrency);
  }
}
