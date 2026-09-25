import { AiToolsService } from './ai-tools.service';

/**
 * Dispatcher-level tests for AiToolsService: schema exposure (getToolDefinitions),
 * write/read classification (isWriteAction), the executeAction switch, and the
 * executeWithCache cache-hit/cache-miss wrapper. Per-tool execution logic is
 * covered in the corresponding provider service spec (ai-expense-tools.*.spec.ts,
 * ai-budget-tools.service.spec.ts, ai-debt-goal-tools.service.spec.ts,
 * ai-shopping-tools.service.spec.ts, ai-undo-tools.service.spec.ts) — see
 * tech-debt ai-tools-service-god-file for why this was split.
 */
function buildService(overrides: {
  aiExpenseTools?: Record<string, jest.Mock>;
  aiBudgetTools?: Record<string, jest.Mock>;
  aiDebtGoalTools?: Record<string, jest.Mock>;
  aiShoppingTools?: Record<string, jest.Mock>;
  aiUndoTools?: Record<string, jest.Mock>;
  cacheService?: Record<string, jest.Mock>;
} = {}) {
  const aiExpenseTools = {
    executeCreateExpense: jest.fn().mockResolvedValue({ actionType: 'create_expense', success: true, data: {} }),
    executeCreateIncome: jest.fn(),
    executeGetExpenses: jest.fn(),
    executeGetCategoryBreakdown: jest.fn(),
    executeGetDepositTotal: jest.fn(),
    executeGetDiscountTotal: jest.fn(),
    ...overrides.aiExpenseTools,
  };
  const aiBudgetTools = {
    executeCreateBudget: jest.fn(),
    executeGetBudgetStatus: jest.fn(),
    executeCreateCategory: jest.fn(),
    ...overrides.aiBudgetTools,
  };
  const aiDebtGoalTools = {
    executeGetDebtSummary: jest.fn(),
    executeRecordDebtRepayment: jest.fn(),
    executeCreateDebt: jest.fn(),
    executeUpdateGoalBalance: jest.fn(),
    executeCheckAffordability: jest.fn(),
    ...overrides.aiDebtGoalTools,
  };
  const aiShoppingTools = {
    executeAddToShoppingList: jest.fn(),
    executeRemoveFromShoppingList: jest.fn(),
    executeGetShoppingSuggestions: jest.fn(),
    executeGetInflationShield: jest.fn(),
    ...overrides.aiShoppingTools,
  };
  const aiUndoTools = {
    executeUndoLastAction: jest.fn(),
    ...overrides.aiUndoTools,
  };
  const cacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    ...overrides.cacheService,
  };

  const svc = new AiToolsService(
    cacheService as any,
    aiExpenseTools as any,
    aiBudgetTools as any,
    aiDebtGoalTools as any,
    aiShoppingTools as any,
    aiUndoTools as any,
  );
  return { svc, aiExpenseTools, aiBudgetTools, aiDebtGoalTools, aiShoppingTools, aiUndoTools, cacheService };
}

describe('AiToolsService.getToolDefinitions', () => {
  it('exposes all 18 tool schemas', () => {
    const { svc } = buildService();
    const names = svc.getToolDefinitions().map((t) => t.function.name);
    expect(names).toEqual([
      'create_expense',
      'create_income',
      'create_budget',
      'create_category',
      'get_expenses',
      'get_budget_status',
      'get_category_breakdown',
      'get_debt_summary',
      'record_debt_repayment',
      'create_debt',
      'update_goal_balance',
      'check_affordability',
      'add_to_shopping_list',
      'get_inflation_shield',
      'remove_from_shopping_list',
      'get_shopping_suggestions',
      'get_deposit_total',
      'get_discount_total',
      'undo_last_action',
    ]);
  });
});

describe('AiToolsService.isWriteAction', () => {
  it('treats create/record/update/undo actions as writes requiring confirmation', () => {
    const { svc } = buildService();
    for (const action of [
      'create_expense',
      'create_income',
      'create_budget',
      'create_category',
      'record_debt_repayment',
      'create_debt',
      'update_goal_balance',
      'undo_last_action',
    ]) {
      expect(svc.isWriteAction(action)).toBe(true);
    }
  });

  it('treats every get_* action and check_affordability as reads (no confirmation)', () => {
    const { svc } = buildService();
    for (const action of [
      'get_expenses',
      'get_budget_status',
      'get_category_breakdown',
      'get_debt_summary',
      'check_affordability',
      'add_to_shopping_list',
      'get_inflation_shield',
      'remove_from_shopping_list',
      'get_shopping_suggestions',
      'get_deposit_total',
      'get_discount_total',
    ]) {
      expect(svc.isWriteAction(action)).toBe(false);
    }
  });
});

describe('AiToolsService.executeAction dispatch', () => {
  it('dispatches each action type to its owning provider service', async () => {
    const { svc, aiExpenseTools, aiBudgetTools, aiDebtGoalTools, aiShoppingTools, aiUndoTools } = buildService();

    await svc.executeAction('create_expense', {}, 'a1', 'u1');
    expect(aiExpenseTools.executeCreateExpense).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('create_income', {}, 'a1', 'u1');
    expect(aiExpenseTools.executeCreateIncome).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('get_expenses', {}, 'a1', 'u1', 'PLN');
    expect(aiExpenseTools.executeGetExpenses).toHaveBeenCalledWith({}, 'a1', 'PLN');

    await svc.executeAction('get_category_breakdown', {}, 'a1', 'u1', 'PLN');
    expect(aiExpenseTools.executeGetCategoryBreakdown).toHaveBeenCalledWith({}, 'a1', 'PLN');

    await svc.executeAction('get_deposit_total', {}, 'a1', 'u1', 'PLN');
    expect(aiExpenseTools.executeGetDepositTotal).toHaveBeenCalledWith({}, 'a1', 'PLN');

    await svc.executeAction('get_discount_total', {}, 'a1', 'u1', 'PLN');
    expect(aiExpenseTools.executeGetDiscountTotal).toHaveBeenCalledWith({}, 'a1', 'PLN');

    await svc.executeAction('create_budget', {}, 'a1', 'u1');
    expect(aiBudgetTools.executeCreateBudget).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('create_category', {}, 'a1', 'u1');
    expect(aiBudgetTools.executeCreateCategory).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('get_budget_status', {}, 'a1', 'u1', 'PLN');
    expect(aiBudgetTools.executeGetBudgetStatus).toHaveBeenCalledWith({}, 'a1', 'PLN');

    await svc.executeAction('get_debt_summary', {}, 'a1', 'u1');
    expect(aiDebtGoalTools.executeGetDebtSummary).toHaveBeenCalledWith('a1');

    await svc.executeAction('record_debt_repayment', {}, 'a1', 'u1');
    expect(aiDebtGoalTools.executeRecordDebtRepayment).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('create_debt', {}, 'a1', 'u1');
    expect(aiDebtGoalTools.executeCreateDebt).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('update_goal_balance', {}, 'a1', 'u1');
    expect(aiDebtGoalTools.executeUpdateGoalBalance).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('check_affordability', {}, 'a1', 'u1', 'PLN');
    expect(aiDebtGoalTools.executeCheckAffordability).toHaveBeenCalledWith({}, 'a1', 'u1', 'PLN');

    await svc.executeAction('add_to_shopping_list', {}, 'a1', 'u1');
    expect(aiShoppingTools.executeAddToShoppingList).toHaveBeenCalledWith({}, 'a1', 'u1');

    await svc.executeAction('remove_from_shopping_list', {}, 'a1', 'u1');
    expect(aiShoppingTools.executeRemoveFromShoppingList).toHaveBeenCalledWith({}, 'a1');

    await svc.executeAction('get_shopping_suggestions', {}, 'a1', 'u1');
    expect(aiShoppingTools.executeGetShoppingSuggestions).toHaveBeenCalledWith('a1');

    await svc.executeAction('get_inflation_shield', {}, 'a1', 'u1', 'PLN');
    expect(aiShoppingTools.executeGetInflationShield).toHaveBeenCalledWith('a1', 'u1', 'PLN');

    await svc.executeAction('undo_last_action', {}, 'a1', 'u1');
    expect(aiUndoTools.executeUndoLastAction).toHaveBeenCalledWith({}, 'a1');
  });

  it('returns success:false for an unknown action type instead of throwing', async () => {
    const { svc } = buildService();
    const res = await svc.executeAction('bogus_action' as any, {}, 'a1', 'u1');
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBe('Unknown action type');
  });

  it('catches a thrown error from the provider and reports it, rather than propagating', async () => {
    const { svc } = buildService({
      aiExpenseTools: { executeCreateExpense: jest.fn().mockRejectedValue(new Error('boom')) },
    });
    const res = await svc.executeAction('create_expense', {}, 'a1', 'u1');
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBe('boom');
  });
});

describe('AiToolsService.executeWithCache', () => {
  it('executes and caches on a miss', async () => {
    const { svc, aiExpenseTools, cacheService } = buildService({
      aiExpenseTools: {
        executeGetExpenses: jest.fn().mockResolvedValue({ actionType: 'get_expenses', success: true, data: { count: 1 } }),
      },
    });

    const res = await svc.executeWithCache('get_expenses', {}, 'a1', 'u1', 'PLN');

    expect(cacheService.get).toHaveBeenCalled();
    expect(aiExpenseTools.executeGetExpenses).toHaveBeenCalled();
    expect(cacheService.set).toHaveBeenCalledWith(expect.any(String), res, 600);
    expect(res.data).toEqual({ count: 1 });
  });

  it('returns the cached result and skips execution on a hit', async () => {
    const cached = { actionType: 'get_expenses', success: true, data: { count: 99 } };
    const { svc, aiExpenseTools } = buildService({
      cacheService: { get: jest.fn().mockResolvedValue(cached) },
    });

    const res = await svc.executeWithCache('get_expenses', {}, 'a1', 'u1', 'PLN');

    expect(res).toBe(cached);
    expect(aiExpenseTools.executeGetExpenses).not.toHaveBeenCalled();
  });

  it('bypasses the cache entirely when accountId is empty', async () => {
    const { svc, aiExpenseTools, cacheService } = buildService({
      aiExpenseTools: {
        executeGetExpenses: jest.fn().mockResolvedValue({ actionType: 'get_expenses', success: true, data: {} }),
      },
    });

    await svc.executeWithCache('get_expenses', {}, '', 'u1', 'PLN');

    expect(cacheService.get).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
    expect(aiExpenseTools.executeGetExpenses).toHaveBeenCalled();
  });
});
