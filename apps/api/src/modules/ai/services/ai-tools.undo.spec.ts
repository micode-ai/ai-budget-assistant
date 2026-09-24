import { AiToolsService } from './ai-tools.service';

/**
 * `undo_last_action` reverts the single most recent write in a conversation
 * (see docs/wiki/features/chat-undo-last-action.md). ChatService resolves
 * WHICH write to undo from conversation history; these tests cover only
 * AiToolsService's execution half — given an already-resolved
 * `{ originalActionType, originalResultData }`, does it revert the right row,
 * and does it refuse safely when it shouldn't.
 */
function makeService(overrides: {
  expensesService?: Record<string, jest.Mock>;
  incomesService?: Record<string, jest.Mock>;
  goalPlannerService?: Record<string, jest.Mock>;
} = {}) {
  const expensesService = { findOne: jest.fn(), remove: jest.fn(), ...overrides.expensesService };
  const incomesService = { findOne: jest.fn(), remove: jest.fn(), ...overrides.incomesService };
  const goalPlannerService = { getGoal: jest.fn(), revertGoalUpdate: jest.fn(), ...overrides.goalPlannerService };

  const svc = new AiToolsService(
    expensesService as any,
    incomesService as any,
    undefined as any, // budgetsService
    undefined as any, // categoriesService
    undefined as any, // analyticsService
    undefined as any, // cacheService
    undefined as any, // debtsService
    goalPlannerService as any,
    undefined as any, // exchangeRateService
    undefined as any, // safeToSpendService
    undefined as any, // shoppingListService
    undefined as any, // inflationShieldService
  );
  return { svc, expensesService, incomesService, goalPlannerService };
}

const run = (svc: AiToolsService, data: Record<string, unknown>) =>
  (svc as any).executeAction('undo_last_action', data, 'a1', 'u1');

const NOW = new Date('2026-09-24T12:00:00Z');

describe('AiToolsService undo_last_action', () => {
  it('is a write action requiring confirmation', () => {
    const { svc } = makeService();
    expect(svc.isWriteAction('undo_last_action')).toBe(true);
  });

  it('is exposed to the model with no parameters', () => {
    const { svc } = makeService();
    const tool = svc.getToolDefinitions().find((t: any) => t.function.name === 'undo_last_action');
    expect(tool).toBeDefined();
    expect(Object.keys((tool as any).function.parameters.properties)).toEqual([]);
    expect((tool as any).function.parameters.required).toEqual([]);
  });

  describe('create_expense / create_income', () => {
    it('soft-deletes the expense row create_expense made', async () => {
      const { svc, expensesService } = makeService({
        expensesService: {
          findOne: jest.fn().mockResolvedValue({
            id: 'e1', amount: '50.00', currencyCode: 'PLN', description: 'Groceries',
            createdAt: NOW, updatedAt: NOW,
          }),
          remove: jest.fn().mockResolvedValue({ success: true }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'create_expense',
        originalResultData: { id: 'e1', amount: 50, currencyCode: 'PLN', description: 'Groceries' },
      });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ undoneEntityType: 'expense', amount: 50, currencyCode: 'PLN', description: 'Groceries' });
      expect(expensesService.remove).toHaveBeenCalledWith('a1', 'e1');
    });

    it('soft-deletes the income row create_income made', async () => {
      const { svc, incomesService } = makeService({
        incomesService: {
          findOne: jest.fn().mockResolvedValue({
            id: 'i1', amount: '1000.00', currencyCode: 'USD', description: 'Salary',
            createdAt: NOW, updatedAt: NOW,
          }),
          remove: jest.fn().mockResolvedValue({ success: true }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'create_income',
        originalResultData: { id: 'i1', amount: 1000, currencyCode: 'USD', description: 'Salary' },
      });

      expect(res.success).toBe(true);
      expect(res.data.undoneEntityType).toBe('income');
      expect(incomesService.remove).toHaveBeenCalledWith('a1', 'i1');
    });

    it('refuses when the entry was edited since it was created', async () => {
      const { svc, expensesService } = makeService({
        expensesService: {
          findOne: jest.fn().mockResolvedValue({
            id: 'e1', amount: '50.00', currencyCode: 'PLN', description: 'Groceries',
            createdAt: NOW, updatedAt: new Date(NOW.getTime() + 60_000), // edited a minute later
          }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'create_expense',
        originalResultData: { id: 'e1' },
      });

      expect(res.success).toBe(false);
      expect(expensesService.remove).not.toHaveBeenCalled();
    });

    it('refuses gracefully when the entry no longer exists', async () => {
      const { svc } = makeService({
        expensesService: { findOne: jest.fn().mockRejectedValue(new Error('Expense not found')) },
      });

      const res = await run(svc, {
        originalActionType: 'create_expense',
        originalResultData: { id: 'gone' },
      });

      expect(res.success).toBe(false);
      expect(res.errorMessage).toMatch(/no longer exists/);
    });
  });

  describe('create_debt / record_debt_repayment — table depends on direction', () => {
    it('undoes a "lent" debt by removing the EXPENSE it created', async () => {
      const { svc, expensesService, incomesService } = makeService({
        expensesService: {
          findOne: jest.fn().mockResolvedValue({
            id: 'x1', amount: '100', currencyCode: 'PLN', description: null, createdAt: NOW, updatedAt: NOW,
          }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'create_debt',
        originalResultData: { type: 'lent', recordId: 'x1', amount: 100, currencyCode: 'PLN' },
      });

      expect(res.success).toBe(true);
      expect(expensesService.remove).toHaveBeenCalledWith('a1', 'x1');
      expect(incomesService.remove).not.toHaveBeenCalled();
    });

    it('undoes a "borrowed" debt by removing the INCOME it created', async () => {
      const { svc, incomesService, expensesService } = makeService({
        incomesService: {
          findOne: jest.fn().mockResolvedValue({
            id: 'y1', amount: '100', currencyCode: 'PLN', description: null, createdAt: NOW, updatedAt: NOW,
          }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'create_debt',
        originalResultData: { type: 'borrowed', recordId: 'y1', amount: 100, currencyCode: 'PLN' },
      });

      expect(res.success).toBe(true);
      expect(incomesService.remove).toHaveBeenCalledWith('a1', 'y1');
      expect(expensesService.remove).not.toHaveBeenCalled();
    });

    it('undoes a repayment for a "lent" debt by removing the INCOME it created (mirror of create_debt)', async () => {
      const { svc, incomesService } = makeService({
        incomesService: {
          findOne: jest.fn().mockResolvedValue({
            id: 'r1', amount: '20', currencyCode: 'PLN', description: null, createdAt: NOW, updatedAt: NOW,
          }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'record_debt_repayment',
        originalResultData: { type: 'lent', recordId: 'r1', amount: 20 },
      });

      expect(res.success).toBe(true);
      expect(incomesService.remove).toHaveBeenCalledWith('a1', 'r1');
    });

    it('undoes a repayment for a "borrowed" debt by removing the EXPENSE it created', async () => {
      const { svc, expensesService } = makeService({
        expensesService: {
          findOne: jest.fn().mockResolvedValue({
            id: 'r2', amount: '20', currencyCode: 'PLN', description: null, createdAt: NOW, updatedAt: NOW,
          }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'record_debt_repayment',
        originalResultData: { type: 'borrowed', recordId: 'r2', amount: 20 },
      });

      expect(res.success).toBe(true);
      expect(expensesService.remove).toHaveBeenCalledWith('a1', 'r2');
    });
  });

  describe('update_goal_balance', () => {
    it('restores the previous amount/status and deletes the contribution row', async () => {
      const { svc, goalPlannerService } = makeService({
        goalPlannerService: {
          getGoal: jest.fn().mockResolvedValue({ id: 'g1', currentAmount: 500 }), // matches newAmount below
          revertGoalUpdate: jest.fn().mockResolvedValue({ id: 'g1', name: 'Vacation', currentAmount: 300 }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'update_goal_balance',
        originalResultData: {
          goalId: 'g1', newAmount: 500, previousAmount: 300, previousStatus: 'active', contributionId: 'c1',
        },
      });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ undoneEntityType: 'goal', goalName: 'Vacation', restoredAmount: 300 });
      expect(goalPlannerService.revertGoalUpdate).toHaveBeenCalledWith('a1', 'g1', 300, 'active', 'c1');
    });

    it('refuses when the goal has moved again since the write being undone', async () => {
      const { svc, goalPlannerService } = makeService({
        goalPlannerService: {
          // Someone/something changed it to 700 after our 500 write — stale snapshot.
          getGoal: jest.fn().mockResolvedValue({ id: 'g1', currentAmount: 700 }),
        },
      });

      const res = await run(svc, {
        originalActionType: 'update_goal_balance',
        originalResultData: { goalId: 'g1', newAmount: 500, previousAmount: 300, previousStatus: 'active' },
      });

      expect(res.success).toBe(false);
      expect(goalPlannerService.revertGoalUpdate).not.toHaveBeenCalled();
    });
  });

  it('refuses an unsupported original action type instead of throwing', async () => {
    const { svc } = makeService();
    const res = await run(svc, { originalActionType: 'create_budget', originalResultData: {} });
    expect(res.success).toBe(false);
  });
});
