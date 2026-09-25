import { Injectable } from '@nestjs/common';
import { ExpensesService } from '../../expenses/expenses.service';
import { IncomesService } from '../../incomes/incomes.service';
import { GoalPlannerService } from './goal-planner.service';
import type { ChatActionResult } from '@budget/shared-types';

/**
 * The undo_last_action chat tool. Extracted from AiToolsService (tech-debt
 * ai-tools-service-god-file) — see AiToolsService.executeAction for the dispatch
 * switch that calls into this class.
 */
@Injectable()
export class AiUndoToolsService {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
    private readonly goalPlannerService: GoalPlannerService,
  ) {}

  /**
   * Resolves which table + row an undo must revert, from the ORIGINAL write's own actionType and
   * captured ChatActionResult.data (`od`). `create_debt`/`record_debt_repayment` can each land on
   * either table depending on `od.type` ('lent' vs 'borrowed') — see debts.service.ts
   * createDebt/recordRepayment, which this mirrors exactly. Returns null for any actionType this
   * feature doesn't support undoing (update_goal_balance is handled separately by the caller, not
   * through this table).
   */
  private resolveUndoEntity(
    originalActionType: string,
    od: Record<string, unknown>,
  ): { kind: 'expense' | 'income'; id: string } | null {
    switch (originalActionType) {
      case 'create_expense':
        return { kind: 'expense', id: String(od.id || '') };
      case 'create_income':
        return { kind: 'income', id: String(od.id || '') };
      case 'create_debt':
        return { kind: od.type === 'lent' ? 'expense' : 'income', id: String(od.recordId || '') };
      case 'record_debt_repayment':
        return { kind: od.type === 'lent' ? 'income' : 'expense', id: String(od.recordId || '') };
      default:
        return null;
    }
  }

  /**
   * Reverts a create_expense/create_income/create_debt/record_debt_repayment write by
   * soft-deleting the row it created — the exact same soft-delete every entity already supports
   * via its own service's `remove()`. Refuses (success:false, never throws to the caller) when the
   * row no longer exists (already deleted — findOne filters `isDeleted:false` and throws) or was
   * edited since creation: `updatedAt` more than 5s past `createdAt` means something touched it
   * after the insert (Prisma sets both together at create time), so undoing now would discard an
   * edit the user made on purpose.
   */
  private async revertEntityCreate(
    kind: 'expense' | 'income',
    id: string,
    accountId: string,
  ): Promise<ChatActionResult> {
    if (!id) {
      return { actionType: 'undo_last_action', success: false, errorMessage: 'Nothing to undo' };
    }
    let row: { id: string; amount: unknown; currencyCode: string; description: string | null; createdAt: Date; updatedAt: Date };
    try {
      row = kind === 'expense'
        ? await this.expensesService.findOne(accountId, id)
        : await this.incomesService.findOne(accountId, id);
    } catch {
      return { actionType: 'undo_last_action', success: false, errorMessage: 'That entry no longer exists' };
    }
    if (Math.abs(row.updatedAt.getTime() - row.createdAt.getTime()) > 5000) {
      return {
        actionType: 'undo_last_action',
        success: false,
        errorMessage: 'That entry was edited since it was created — undo it manually from the Transactions tab instead',
      };
    }
    if (kind === 'expense') {
      await this.expensesService.remove(accountId, id);
    } else {
      await this.incomesService.remove(accountId, id);
    }
    return {
      actionType: 'undo_last_action',
      success: true,
      data: {
        undoneEntityType: kind,
        amount: Number(row.amount),
        currencyCode: row.currencyCode,
        description: row.description,
      },
    };
  }

  /**
   * Reverts an update_goal_balance write: restores the pre-write currentAmount/status and removes
   * the GoalContribution row it created (if any). Refuses if the goal's CURRENT currentAmount no
   * longer equals the newAmount our write set it to — something else changed it since (another
   * manual edit, or a second undo racing this one), so the snapshot in `od` is stale.
   */
  private async revertGoalBalance(od: Record<string, unknown>, accountId: string): Promise<ChatActionResult> {
    const goalId = String(od.goalId || '');
    const previousAmount = od.previousAmount != null ? Number(od.previousAmount) : null;
    const previousStatus = od.previousStatus != null ? String(od.previousStatus) : 'active';
    const contributionId = od.contributionId ? String(od.contributionId) : undefined;
    const newAmount = od.newAmount != null ? Number(od.newAmount) : null;

    if (!goalId || previousAmount == null) {
      return { actionType: 'undo_last_action', success: false, errorMessage: 'Nothing to undo' };
    }
    try {
      const current = await this.goalPlannerService.getGoal(accountId, goalId);
      if (newAmount != null && Number(current.currentAmount) !== newAmount) {
        return {
          actionType: 'undo_last_action',
          success: false,
          errorMessage: 'That goal has changed since — undo it manually from the goal screen instead',
        };
      }
      const reverted = await this.goalPlannerService.revertGoalUpdate(
        accountId,
        goalId,
        previousAmount,
        previousStatus,
        contributionId,
      );
      return {
        actionType: 'undo_last_action',
        success: true,
        data: { undoneEntityType: 'goal', goalName: reverted.name, restoredAmount: previousAmount },
      };
    } catch (error) {
      return {
        actionType: 'undo_last_action',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to undo goal update',
      };
    }
  }

  /**
   * Dispatcher for the chat "undo" tool (see docs/contracts/chat-undo-last-action.md). `data` is
   * the `UndoLastActionData` the request-time resolution in ChatService built — already scoped to
   * exactly one of the 5 supported original action types.
   */
  async executeUndoLastAction(data: Record<string, unknown>, accountId: string): Promise<ChatActionResult> {
    const originalActionType = String(data.originalActionType || '');
    const od = (data.originalResultData as Record<string, unknown>) || {};

    if (originalActionType === 'update_goal_balance') {
      return this.revertGoalBalance(od, accountId);
    }
    const entity = this.resolveUndoEntity(originalActionType, od);
    if (!entity) {
      return { actionType: 'undo_last_action', success: false, errorMessage: 'This action can no longer be undone' };
    }
    return this.revertEntityCreate(entity.kind, entity.id, accountId);
  }
}
