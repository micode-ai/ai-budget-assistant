import { Injectable } from '@nestjs/common';
import { DebtsService } from '../../debts/debts.service';
import { GoalPlannerService } from './goal-planner.service';
import { SafeToSpendService } from '../../insights/safe-to-spend.service';
import type { ChatActionResult } from '@budget/shared-types';

/**
 * The debt/goal chat tools: get_debt_summary, record_debt_repayment, create_debt,
 * update_goal_balance, check_affordability. Extracted from AiToolsService (tech-debt
 * ai-tools-service-god-file) — see AiToolsService.executeAction for the dispatch
 * switch that calls into this class.
 */
@Injectable()
export class AiDebtGoalToolsService {
  constructor(
    private readonly debtsService: DebtsService,
    private readonly goalPlannerService: GoalPlannerService,
    private readonly safeToSpendService: SafeToSpendService,
  ) {}

  async executeGetDebtSummary(accountId: string): Promise<ChatActionResult> {
    const summary = await this.debtsService.getDebtSummary(accountId);
    const activeDebts = [
      ...summary.lent.filter(d => d.status !== 'paid'),
      ...summary.borrowed.filter(d => d.status !== 'paid'),
    ];
    return {
      actionType: 'get_debt_summary',
      success: true,
      data: {
        lent: summary.lent,
        borrowed: summary.borrowed,
        totals: summary.totals,
        activeCount: activeDebts.length,
      },
    };
  }

  async executeRecordDebtRepayment(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const debtId = String(data.debtId || '');
    const amount = Number(data.amount);
    const date = data.date ? String(data.date) : undefined;

    if (!debtId || amount <= 0) {
      return { actionType: 'record_debt_repayment', success: false, errorMessage: 'Invalid debtId or amount' };
    }

    try {
      const result = await this.debtsService.recordRepayment(accountId, userId, debtId, amount, date);
      return {
        actionType: 'record_debt_repayment',
        success: true,
        data: {
          type: result.type,
          recordId: result.record.id,
          amount,
          date: date || new Date().toISOString().split('T')[0],
          // Additive — read off the created record itself, not the request args. Needed by the
          // chat "undo" tool's narration (executeUndoLastAction); harmless for every other caller.
          currencyCode: result.record.currencyCode,
          contactName: result.record.debtContactName ?? undefined,
        },
      };
    } catch (error) {
      return {
        actionType: 'record_debt_repayment',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to record repayment',
      };
    }
  }

  async executeCreateDebt(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const contactName = String(data.contactName || '').trim();
    const amount = Number(data.amount);
    const currencyCode = String(data.currencyCode || 'USD');
    const direction = String(data.direction) as 'lent' | 'borrowed';
    const dueDate = data.dueDate ? String(data.dueDate) : undefined;

    if (!contactName || amount <= 0 || !['lent', 'borrowed'].includes(direction)) {
      return { actionType: 'create_debt', success: false, errorMessage: 'Invalid debt parameters' };
    }

    const result = await this.debtsService.createDebt(accountId, userId, {
      contactName,
      amount,
      currencyCode,
      direction,
      dueDate,
    });
    return {
      actionType: 'create_debt',
      success: true,
      data: {
        type: result.type,
        recordId: result.record.id,
        contactName,
        amount,
        currencyCode,
        direction,
      },
    };
  }

  async executeUpdateGoalBalance(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const goalId = String(data.goalId || '');
    const newAmount = Number(data.newAmount);

    if (!goalId || newAmount < 0) {
      return { actionType: 'update_goal_balance', success: false, errorMessage: 'Invalid goalId or amount' };
    }

    try {
      // Snapshot BEFORE the write — this is what the chat "undo" tool restores. Mirrors
      // GoalPlannerService.updateGoal's own `shouldRecordContribution` condition below, so
      // `contributionId` only gets set when a contribution row actually exists to clean up.
      const before = await this.goalPlannerService.getGoal(accountId, goalId);
      const updated = await this.goalPlannerService.updateGoal(
        accountId,
        goalId,
        { currentAmount: newAmount },
        { userId, note: 'AI update' },
      );

      let contributionId: string | undefined;
      if (newAmount > Number(before.currentAmount)) {
        const contributions = await this.goalPlannerService.getContributions(accountId, goalId);
        contributionId = contributions[0]?.id;
      }

      return {
        actionType: 'update_goal_balance',
        success: true,
        data: {
          goalId: updated.id,
          goalName: updated.name,
          newAmount: updated.currentAmount,
          targetAmount: updated.targetAmount,
          status: updated.status,
          // Additive — needed by the chat "undo" tool (executeUndoLastAction /
          // revertGoalBalance); no other caller reads these.
          previousAmount: Number(before.currentAmount),
          previousStatus: before.status,
          contributionId,
        },
      };
    } catch (error) {
      return {
        actionType: 'update_goal_balance',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to update goal',
      };
    }
  }

  /**
   * READ action: deterministic affordability verdict from the cashflow engine.
   * No confirmation required — executes immediately via executeWithCache.
   * The LLM receives the verdict struct and writes the one-liner narration only.
   */
  async executeCheckAffordability(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const amount = Number(data.amount);
    // Default to baseCurrency when the LLM omits currencyCode (common for unambiguous requests)
    const currencyCode = data.currencyCode ? String(data.currencyCode) : (baseCurrency || 'USD');

    if (!amount || amount <= 0) {
      return { actionType: 'check_affordability', success: false, errorMessage: 'Invalid amount' };
    }

    const resolvedBase = baseCurrency || 'USD';

    try {
      const verdict = await this.safeToSpendService.checkAffordability(
        accountId,
        userId,
        resolvedBase,
        amount,
        currencyCode,
      );

      return {
        actionType: 'check_affordability',
        success: true,
        data: {
          affordable: verdict.affordable,
          amount: verdict.amount,
          currencyCode: verdict.currencyCode,
          amountInBase: verdict.amountInBase,
          safeToSpendToday: verdict.safeToSpendToday,
          reasonCode: verdict.reasonCode,
          goalImpact: verdict.goalImpact,
          suggestedDate: verdict.suggestedDate,
          baseCurrency: verdict.baseCurrency,
          // Hint for the LLM: report `affordable` and `reasonCode` verbatim — never guess.
          // If fxConverted, note the conversion was approximate.
        },
      };
    } catch (error) {
      return {
        actionType: 'check_affordability',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to check affordability',
      };
    }
  }
}
