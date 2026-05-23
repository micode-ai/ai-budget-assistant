import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { ExpensesService } from '../../expenses/expenses.service';
import { IncomesService } from '../../incomes/incomes.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { CategoriesService } from '../../categories/categories.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { CacheService } from '../../../common/cache/cache.service';
import { DebtsService } from '../../debts/debts.service';
import { GoalPlannerService } from './goal-planner.service';
import type { ChatActionType, ChatActionResult } from '@budget/shared-types';

@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
    private readonly budgetsService: BudgetsService,
    private readonly categoriesService: CategoriesService,
    private readonly analyticsService: AnalyticsService,
    private readonly cacheService: CacheService,
    private readonly debtsService: DebtsService,
    private readonly goalPlannerService: GoalPlannerService,
  ) {}

  getToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'create_expense',
          description: 'Create a new expense/spending entry. Use when the user asks to add, log, or record an expense.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'The expense amount' },
              currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'], description: 'Currency code. Infer from symbols: ₴=UAH, $=USD, €=EUR, zł=PLN, £=GBP, ₽=RUB' },
              description: { type: 'string', description: 'What the expense was for' },
              categoryName: { type: 'string', description: 'Category name (e.g., "Food & Drinks", "Entertainment", "Transport")' },
              date: { type: 'string', description: 'ISO date string (YYYY-MM-DD). Default to today if not specified.' },
            },
            required: ['amount', 'currencyCode', 'description'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_income',
          description: 'Create a new income entry. Use when the user asks to add or record income.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'The income amount' },
              currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'] },
              description: { type: 'string', description: 'Income source description' },
              categoryName: { type: 'string', description: 'Category name' },
              date: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
            },
            required: ['amount', 'currencyCode', 'description'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_budget',
          description: 'Create a new budget. Use when the user asks to set up or create a budget for a category or period.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Budget name' },
              amount: { type: 'number', description: 'Budget limit amount' },
              currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'] },
              period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'], description: 'Budget period' },
              categoryName: { type: 'string', description: 'Category to budget for' },
              startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD), for custom period' },
            },
            required: ['name', 'amount', 'currencyCode', 'period', 'startDate'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_category',
          description: 'Create a new expense or income category. Use when the user asks to add, create, or make a new category.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Category name (e.g., "Food", "Freelance", "Transport")' },
              type: { type: 'string', enum: ['expense', 'income'], description: 'Whether this is an expense or income category' },
            },
            required: ['name', 'type'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_expenses',
          description: 'Retrieve and display user expenses for a date range. Use when user asks to show, list, or view their spending.',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD)' },
              categoryName: { type: 'string', description: 'Filter by category name' },
            },
            required: ['startDate', 'endDate'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_budget_status',
          description: 'Get the current status and progress of budgets. Use when user asks about budget status, how much is left, or if they are on track.',
          parameters: {
            type: 'object',
            properties: {
              budgetName: { type: 'string', description: 'Specific budget name to check' },
              categoryName: { type: 'string', description: 'Category-linked budget to check' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_category_breakdown',
          description: 'Get spending breakdown by category for a period. Use when user asks for category analysis, breakdown, or pie chart data.',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD)' },
            },
            required: ['startDate', 'endDate'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_debt_summary',
          description: 'Get a summary of all active debts — money lent to others and money borrowed. Use when the user asks about debts, who owes them money, or how much they owe.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'record_debt_repayment',
          description: 'Record a (partial or full) repayment for an existing debt. Use when user says someone repaid them, or they repaid someone. IMPORTANT: use the debt id from the activeDebts context, not the contact name directly. If multiple debts match the same contact name, ask the user to clarify which one.',
          parameters: {
            type: 'object',
            properties: {
              debtId: { type: 'string', description: 'The id of the debt being repaid (from activeDebts context)' },
              amount: { type: 'number', description: 'Repayment amount' },
              date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Default to today if not specified.' },
            },
            required: ['debtId', 'amount'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_debt',
          description: 'Create a new debt entry — either money lent to someone or money borrowed from someone. Use when user says they lent money to someone or borrowed from someone.',
          parameters: {
            type: 'object',
            properties: {
              contactName: { type: 'string', description: 'Name of the person lent to or borrowed from' },
              amount: { type: 'number', description: 'Debt amount' },
              currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'], description: 'Currency code' },
              direction: { type: 'string', enum: ['lent', 'borrowed'], description: '"lent" = I gave money to someone; "borrowed" = I received money from someone' },
              dueDate: { type: 'string', description: 'Optional due date ISO string (YYYY-MM-DD)' },
            },
            required: ['contactName', 'amount', 'currencyCode', 'direction'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_goal_balance',
          description: 'Update the current saved amount for a savings goal. Use when user says they added money to a goal, saved some amount towards a goal, or want to set the current balance of a goal. Use the goalId from the savingsGoals context.',
          parameters: {
            type: 'object',
            properties: {
              goalId: { type: 'string', description: 'The id of the savings goal (from savingsGoals context)' },
              newAmount: { type: 'number', description: 'The new current amount saved towards the goal' },
            },
            required: ['goalId', 'newAmount'],
          },
        },
      },
    ];
  }

  isWriteAction(actionType: string): boolean {
    return ['create_expense', 'create_income', 'create_budget', 'create_category', 'record_debt_repayment', 'create_debt', 'update_goal_balance'].includes(actionType);
  }

  buildToolCacheKey(
    actionType: ChatActionType,
    accountId: string,
    args: Record<string, unknown>,
  ): string {
    const sortedArgs = Object.keys(args)
      .sort()
      .reduce((acc, k) => { acc[k] = args[k]; return acc; }, {} as Record<string, unknown>);
    return `chat:${actionType}:${accountId}:${JSON.stringify(sortedArgs)}`;
  }

  async executeAction(
    actionType: ChatActionType,
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    try {
      switch (actionType) {
        case 'create_expense':
          return await this.executeCreateExpense(data, accountId, userId);
        case 'create_income':
          return await this.executeCreateIncome(data, accountId, userId);
        case 'create_budget':
          return await this.executeCreateBudget(data, accountId, userId);
        case 'create_category':
          return await this.executeCreateCategory(data, accountId, userId);
        case 'get_expenses':
          return await this.executeGetExpenses(data, accountId);
        case 'get_budget_status':
          return await this.executeGetBudgetStatus(data, accountId);
        case 'get_category_breakdown':
          return await this.executeGetCategoryBreakdown(data, accountId);
        case 'get_debt_summary':
          return await this.executeGetDebtSummary(accountId);
        case 'record_debt_repayment':
          return await this.executeRecordDebtRepayment(data, accountId, userId);
        case 'create_debt':
          return await this.executeCreateDebt(data, accountId, userId);
        case 'update_goal_balance':
          return await this.executeUpdateGoalBalance(data, accountId);
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
  ): Promise<ChatActionResult> {
    const cacheKey = accountId ? this.buildToolCacheKey(actionType, accountId, args) : null;
    if (cacheKey) {
      const cached = await this.cacheService.get<ChatActionResult>(cacheKey);
      if (cached) {
        this.logger.log(`[chat] cache hit ${cacheKey}`);
        return cached;
      }
      const result = await this.executeAction(actionType, args, accountId, userId);
      // 10-min TTL keeps "this month" answers fresh enough
      await this.cacheService.set(cacheKey, result, 600);
      return result;
    }
    return this.executeAction(actionType, args, accountId, userId);
  }

  private async executeCreateExpense(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const dto = {
      localId: randomUUID(),
      amount: Number(data.amount),
      currencyCode: String(data.currencyCode),
      description: String(data.description || ''),
      categoryId: data.categoryName ? String(data.categoryName) : undefined,
      date: String(data.date || new Date().toISOString().split('T')[0]),
      source: 'manual',
    };

    const { expense } = await this.expensesService.create(accountId, userId, dto as any);
    if (!expense) {
      return { actionType: 'create_expense', success: false, errorMessage: 'Failed to create expense' };
    }
    return {
      actionType: 'create_expense',
      success: true,
      data: {
        id: expense.id,
        amount: Number(expense.amount),
        currencyCode: expense.currencyCode,
        description: expense.description,
        category: (expense as any).category?.name,
        date: expense.date,
      },
    };
  }

  private async executeCreateIncome(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const dto = {
      localId: randomUUID(),
      amount: Number(data.amount),
      currencyCode: String(data.currencyCode),
      description: String(data.description || ''),
      categoryId: data.categoryName ? String(data.categoryName) : undefined,
      date: String(data.date || new Date().toISOString().split('T')[0]),
    };

    const income = await this.incomesService.create(accountId, userId, dto as any);
    if (!income) {
      return { actionType: 'create_income', success: false, errorMessage: 'Failed to create income' };
    }
    return {
      actionType: 'create_income',
      success: true,
      data: {
        id: income.id,
        amount: Number(income.amount),
        currencyCode: income.currencyCode,
        description: income.description,
        date: income.date,
      },
    };
  }

  private async executeCreateBudget(
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

  private async executeCreateCategory(
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
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return { actionType: 'create_category', success: false, errorMessage: `Category "${name}" already exists` };
      }
      throw error;
    }
  }

  private async executeGetExpenses(
    data: Record<string, unknown>,
    accountId: string,
  ): Promise<ChatActionResult> {
    const filters: any = {
      startDate: String(data.startDate),
      endDate: String(data.endDate),
      limit: 500,
    };

    if (data.categoryName) {
      const categories = await this.categoriesService.findAll(accountId);
      const match = categories.find(
        (c: { name: string }) => c.name.toLowerCase() === String(data.categoryName).toLowerCase(),
      );
      if (match) filters.categoryId = match.id;
    }

    const result = await this.expensesService.findAll(accountId, filters);
    const expenses = (result as any).data || result;
    const pagination = (result as any).pagination;
    const expenseList = (Array.isArray(expenses) ? expenses : []).map((e: any) => ({
      id: e.id,
      amount: Number(e.amount),
      currencyCode: e.currencyCode,
      description: e.description,
      category: e.category?.name,
      date: e.date,
    }));

    const totalsByCurrency: Record<string, number> = {};
    for (const e of expenseList) {
      const cur = e.currencyCode || 'USD';
      totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + e.amount;
    }

    const categoryBreakdown: Record<string, { amount: number; count: number; currency: string }> = {};
    for (const e of expenseList) {
      const key = `${e.category || 'Uncategorized'}|${e.currencyCode || 'USD'}`;
      if (!categoryBreakdown[key]) {
        categoryBreakdown[key] = { amount: 0, count: 0, currency: e.currencyCode || 'USD' };
      }
      categoryBreakdown[key].amount += e.amount;
      categoryBreakdown[key].count += 1;
    }
    const categoryTotals = Object.entries(categoryBreakdown).map(([key, val]) => ({
      category: key.split('|')[0],
      amount: Math.round(val.amount * 100) / 100,
      count: val.count,
      currencyCode: val.currency,
    })).sort((a, b) => b.amount - a.amount);

    const actualCount = pagination?.total ?? expenseList.length;

    return {
      actionType: 'get_expenses',
      success: true,
      data: {
        recentExpenses: expenseList.slice(0, 20),
        categoryTotals,
        totalsByCurrency,
        count: actualCount,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    };
  }

  private async executeGetBudgetStatus(
    data: Record<string, unknown>,
    accountId: string,
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

    const progressList = await Promise.all(
      targetBudgets.map(async (b: any) => {
        try {
          const progress = await this.budgetsService.getProgress(accountId, b.id);
          return {
            name: b.name,
            amount: Number(b.amount),
            currencyCode: b.currencyCode,
            period: b.period,
            category: b.category?.name,
            spent: progress.spent,
            remaining: progress.remaining,
            // overBy is precomputed server-side — the LLM must report this
            // verbatim; never recompute spent − amount.
            overBy: progress.overBy,
            percentageUsed: progress.percentageUsed,
            isOverBudget: progress.isOverBudget,
            daysRemaining: progress.daysRemaining,
          };
        } catch {
          return {
            name: b.name,
            amount: Number(b.amount),
            currencyCode: b.currencyCode,
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
      },
    };
  }

  private async executeGetCategoryBreakdown(
    data: Record<string, unknown>,
    accountId: string,
  ): Promise<ChatActionResult> {
    const startDate = new Date(String(data.startDate));
    const endDate = new Date(String(data.endDate));

    const summary = await this.analyticsService.getSummary(accountId, startDate, endDate);

    return {
      actionType: 'get_category_breakdown',
      success: true,
      data: {
        categories: (summary as any).expensesByCategory || [],
        totalExpenses: (summary as any).totalExpenses || 0,
        expensesByCurrency: (summary as any).expensesByCurrency || [],
        period: { startDate: data.startDate, endDate: data.endDate },
      },
    };
  }

  private async executeGetDebtSummary(accountId: string): Promise<ChatActionResult> {
    const summary = await this.debtsService.getDebtSummary(accountId);
    const activeDebts = [
      ...summary.lent.filter((d: any) => d.status !== 'paid'),
      ...summary.borrowed.filter((d: any) => d.status !== 'paid'),
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

  private async executeRecordDebtRepayment(
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

  private async executeCreateDebt(
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

  private async executeUpdateGoalBalance(
    data: Record<string, unknown>,
    accountId: string,
  ): Promise<ChatActionResult> {
    const goalId = String(data.goalId || '');
    const newAmount = Number(data.newAmount);

    if (!goalId || newAmount < 0) {
      return { actionType: 'update_goal_balance', success: false, errorMessage: 'Invalid goalId or amount' };
    }

    try {
      const updated = await this.goalPlannerService.updateGoal(accountId, goalId, { currentAmount: newAmount });
      return {
        actionType: 'update_goal_balance',
        success: true,
        data: {
          goalId: updated.id,
          goalName: updated.name,
          newAmount: updated.currentAmount,
          targetAmount: updated.targetAmount,
          status: updated.status,
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
}
