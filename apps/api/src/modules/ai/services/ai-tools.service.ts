import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { ExpensesService } from '../../expenses/expenses.service';
import { CreateExpenseDto, ExpenseFiltersDto } from '../../expenses/dto';
import { IncomesService } from '../../incomes/incomes.service';
import { CreateIncomeDto } from '../../incomes/dto';
import { BudgetsService } from '../../budgets/budgets.service';
import { CategoriesService } from '../../categories/categories.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { CacheService } from '../../../common/cache/cache.service';
import { DebtsService } from '../../debts/debts.service';
import { ExchangeRateService } from '../../currency-exchange/exchange-rate.service';
import { GoalPlannerService } from './goal-planner.service';
import { SafeToSpendService } from '../../insights/safe-to-spend.service';
import { InflationShieldService } from '../../insights/inflation-shield.service';
import { ShoppingListService } from '../../shopping-list/shopping-list.service';
import { buildSearchUnits } from '../utils/semantic-filter';
import type { ChatActionType, ChatActionResult } from '@budget/shared-types';

// Cap on the number of searchable units (expense-level rows + receipt line items)
// sent to the semantic filter for a single keyword query. Generous enough to cover
// full-history product searches while bounding token cost / latency.
const SEARCH_UNIT_LIMIT = 1500;

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
    private readonly exchangeRateService: ExchangeRateService,
    private readonly safeToSpendService: SafeToSpendService,
    private readonly shoppingListService: ShoppingListService,
    private readonly inflationShieldService: InflationShieldService,
  ) {}

  /**
   * Fetch exchange rates for `base` (1 base = rates[X] X). Returns null if no base
   * currency is given or the rate provider is unavailable (caller keeps native amounts).
   */
  private async getRatesSafe(base?: string): Promise<Record<string, number> | null> {
    if (!base) return null;
    try {
      const { rates } = await this.exchangeRateService.getRates(base);
      return rates || null;
    } catch {
      return null;
    }
  }

  /** Convert `amount` from `from` currency into `base`. Returns null if no rate is known. */
  private convertAmount(amount: number, from: string, base: string, rates: Record<string, number>): number | null {
    if (from === base) return amount;
    const r = rates[from];
    if (!r || r <= 0) return null;
    return Math.round((amount / r) * 100) / 100;
  }

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
              startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD). OMIT this for product/item/merchant questions ("how much did I spend on beer") unless the user names an explicit time period — the tool then searches the full history so older purchases are not missed.' },
              endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD). OMIT together with startDate for un-scoped product/item questions; defaults to today.' },
              categoryName: { type: 'string', description: 'Filter by category name. ONLY set this when the user explicitly names a category to filter by. Never derive it from a speaker-name prefix like "[Name]:" in a shared conversation.' },
              descriptionKeyword: { type: 'string', description: 'The product/merchant/item the user asks about, copied from their message in whatever language and spelling they used (e.g. "beer", "пиво", "пивка", "cerveza", a typo like "cofee"). The server performs a semantic, language- and typo-tolerant match across all expenses AND receipt line items in the range — not a plain substring — so it finds brand names, misspellings and cross-language equivalents. Do NOT translate or "correct" the term yourself; pass what the user wrote. Can be combined with categoryName.' },
            },
            required: [],
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
      {
        type: 'function',
        function: {
          name: 'check_affordability',
          description: 'Answer "can I afford X" questions. Computes a deterministic YES/NO from the cashflow engine. Use whenever the user asks if they can afford/buy something for an amount.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'The price the user wants to spend' },
              currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'], description: 'Currency code. Infer from symbols: ₴=UAH, $=USD, €=EUR, zł=PLN, £=GBP, ₽=RUB' },
              description: { type: 'string', description: 'What they want to buy (optional)' },
            },
            required: ['amount'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_to_shopping_list',
          description: 'Add one or more items to the user\'s shopping / grocery list. Use when the user asks to put something on their shopping list, add groceries to buy, or remember to buy something (e.g. "add milk and bread to my shopping list", "put eggs on the list", "добавь молоко и хлеб в список покупок"). This is NOT for recording money spent — that is create_expense.',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { type: 'string' },
                description: 'The product/item names to add, e.g. ["milk", "bread", "eggs"]. Copy each name from the user\'s message in their own language and spelling — do NOT translate or correct them.',
              },
            },
            required: ['items'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_inflation_shield',
          description: 'Get the user\'s Inflation Shield: which of their regularly-bought products are rising in price and what to stock up on NOW to save money, plus how much the shield has saved them so far. Use when the user asks what to buy ahead / stock up on, what is getting more expensive, or how much they have saved by buying ahead. Read-only, no parameters.',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];
  }

  // 'check_affordability' is intentionally NOT in this list — it is a READ action
  // (no confirmation required, executes immediately via executeWithCache).
  isWriteAction(actionType: string): boolean {
    return ['create_expense', 'create_income', 'create_budget', 'create_category', 'record_debt_repayment', 'create_debt', 'update_goal_balance'].includes(actionType);
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
          return await this.executeCreateExpense(data, accountId, userId);
        case 'create_income':
          return await this.executeCreateIncome(data, accountId, userId);
        case 'create_budget':
          return await this.executeCreateBudget(data, accountId, userId);
        case 'create_category':
          return await this.executeCreateCategory(data, accountId, userId);
        case 'get_expenses':
          return await this.executeGetExpenses(data, accountId, baseCurrency);
        case 'get_budget_status':
          return await this.executeGetBudgetStatus(data, accountId, baseCurrency);
        case 'get_category_breakdown':
          return await this.executeGetCategoryBreakdown(data, accountId, baseCurrency);
        case 'get_debt_summary':
          return await this.executeGetDebtSummary(accountId);
        case 'record_debt_repayment':
          return await this.executeRecordDebtRepayment(data, accountId, userId);
        case 'create_debt':
          return await this.executeCreateDebt(data, accountId, userId);
        case 'update_goal_balance':
          return await this.executeUpdateGoalBalance(data, accountId, userId);
        case 'check_affordability':
          return await this.executeCheckAffordability(data, accountId, userId, baseCurrency);
        case 'add_to_shopping_list':
          return await this.executeAddToShoppingList(data, accountId, userId);
        case 'get_inflation_shield':
          return await this.executeGetInflationShield(accountId, userId, baseCurrency);
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

  private async executeCreateExpense(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const dto: CreateExpenseDto = {
      localId: randomUUID(),
      amount: Number(data.amount),
      currencyCode: String(data.currencyCode),
      description: String(data.description || ''),
      categoryId: data.categoryName ? String(data.categoryName) : undefined,
      date: String(data.date || new Date().toISOString().split('T')[0]),
      source: 'manual',
    };

    const { expense } = await this.expensesService.create(accountId, userId, dto);
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
        category: expense.category?.name,
        date: expense.date,
      },
    };
  }

  private async executeAddToShoppingList(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    // Accept both `items: string[]` (the schema) and a lone `item: string`
    // (some models emit the singular form) — normalize to a string array.
    const raw = Array.isArray(data.items)
      ? data.items
      : data.item != null
        ? [data.item]
        : [];
    const names = raw.map((x) => String(x));
    if (names.filter((n) => n.trim().length > 0).length === 0) {
      return { actionType: 'add_to_shopping_list', success: false, errorMessage: 'No items to add' };
    }
    const { listName, addedLabels } = await this.shoppingListService.addItemsByName(accountId, userId, names);
    return {
      actionType: 'add_to_shopping_list',
      success: true,
      data: { listName, items: addedLabels, count: addedLabels.length },
    };
  }

  private async executeCreateIncome(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    const dto: CreateIncomeDto = {
      localId: randomUUID(),
      amount: Number(data.amount),
      currencyCode: String(data.currencyCode),
      description: String(data.description || ''),
      categoryId: data.categoryName ? String(data.categoryName) : undefined,
      date: String(data.date || new Date().toISOString().split('T')[0]),
    };

    const income = await this.incomesService.create(accountId, userId, dto);
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
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        return { actionType: 'create_category', success: false, errorMessage: `Category "${name}" already exists` };
      }
      throw error;
    }
  }

  private async executeGetExpenses(
    data: Record<string, unknown>,
    accountId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    // Product/item/merchant questions ("how much did I spend on beer") are almost always
    // lifetime questions. If the model didn't scope an explicit period, search the full
    // history so we never miss older purchases (the #1 cause of "found nothing"). An
    // explicit date from the model is always respected.
    const hasKeyword = !!data.descriptionKeyword;
    const todayIso = new Date().toISOString().slice(0, 10);
    const endDate = data.endDate ? String(data.endDate) : todayIso;
    const startDate = data.startDate
      ? String(data.startDate)
      : hasKeyword
        ? '2000-01-01'
        : `${todayIso.slice(0, 7)}-01`;
    const filters: ExpenseFiltersDto = {
      startDate,
      endDate,
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
    const expenses = result.data;
    const pagination = result.pagination;
    const rawList = (Array.isArray(expenses) ? expenses : []).map((e) => ({
      id: e.id,
      amount: Number(e.amount),
      currencyCode: e.currencyCode,
      description: e.description,
      merchant: e.merchant,
      category: e.category?.name,
      date: e.date,
      items: Array.isArray(e.items)
        ? e.items.map((it: { id: string; description?: string | null; canonicalName?: string | null; totalPrice: unknown }) => ({
            id: it.id,
            description: it.description,
            canonicalName: it.canonicalName,
            totalPrice: Number(it.totalPrice),
          }))
        : [],
    }));

    // Convert every amount into the user's display currency so the chat answers in one
    // currency. If rates are unavailable we keep native amounts (graceful fallback).
    const rates = await this.getRatesSafe(baseCurrency);
    let fxConverted = false;
    const convert = (amount: number, from: string | null | undefined): { amount: number; currencyCode: string } => {
      if (baseCurrency && rates) {
        const conv = this.convertAmount(amount, from || baseCurrency, baseCurrency, rates);
        if (conv != null) {
          fxConverted = true;
          return { amount: conv, currencyCode: baseCurrency };
        }
      }
      return { amount, currencyCode: from || 'USD' };
    };
    const expenseList = rawList.map((e) => {
      const c = convert(e.amount, e.currencyCode);
      return c.currencyCode === baseCurrency && baseCurrency
        ? { ...e, amount: c.amount, currencyCode: c.currencyCode, originalAmount: e.amount, originalCurrencyCode: e.currencyCode }
        : e;
    });

    // For product/item keyword queries, flatten receipts into searchable UNITS so the
    // semantic filter can match a "beer" line item inside a grocery receipt (and count
    // only that line's price), not just the receipt's top-level description.
    let matchedUnits: ReturnType<typeof buildSearchUnits> | null = null;
    if (hasKeyword) {
      const units = buildSearchUnits(rawList, convert);
      if (units.length > SEARCH_UNIT_LIMIT) {
        this.logger.warn(`[chat] get_expenses keyword search: ${units.length} units exceeds cap ${SEARCH_UNIT_LIMIT}, truncating (newest first)`);
      }
      matchedUnits = units.slice(0, SEARCH_UNIT_LIMIT);
    }

    const buildTotals = (list: typeof expenseList) => {
      const totalsByCurrency: Record<string, number> = {};
      const categoryBreakdown: Record<string, { amount: number; count: number; currency: string }> = {};
      for (const e of list) {
        const cur = e.currencyCode || 'USD';
        totalsByCurrency[cur] = Math.round(((totalsByCurrency[cur] || 0) + e.amount) * 100) / 100;
        const key = `${e.category || 'Uncategorized'}|${cur}`;
        if (!categoryBreakdown[key]) categoryBreakdown[key] = { amount: 0, count: 0, currency: cur };
        categoryBreakdown[key].amount += e.amount;
        categoryBreakdown[key].count += 1;
      }
      const categoryTotals = Object.entries(categoryBreakdown).map(([key, val]) => ({
        category: key.split('|')[0],
        amount: Math.round(val.amount * 100) / 100,
        count: val.count,
        currencyCode: val.currency,
      })).sort((a, b) => b.amount - a.amount);
      return { totalsByCurrency, categoryTotals };
    };

    const { totalsByCurrency, categoryTotals } = buildTotals(expenseList);
    const actualCount = pagination?.total ?? expenseList.length;

    return {
      actionType: 'get_expenses',
      success: true,
      data: {
        recentExpenses: expenseList.slice(0, 20),
        // When descriptionKeyword is set, expose ALL searchable units (expense rows +
        // receipt line items) for semantic filtering in ChatService (AI-powered,
        // language-agnostic). ChatService replaces matchedExpenses + totals with the
        // semantically filtered subset.
        ...(hasKeyword && matchedUnits
          ? {
              matchedExpenses: matchedUnits,
              matchedByKeyword: String(data.descriptionKeyword),
            }
          : {}),
        categoryTotals,
        totalsByCurrency,
        count: actualCount,
        startDate,
        endDate,
        ...(fxConverted ? { baseCurrency, fxConverted: true, fxApproximate: true } : {}),
      },
    };
  }

  private async executeGetBudgetStatus(
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
        const c = this.convertAmount(val, from || baseCurrency, baseCurrency, rates);
        if (c != null) { fxConverted = true; return { value: c, currency: baseCurrency }; }
      }
      return { value: val, currency: from };
    };

    const progressList = await Promise.all(
      targetBudgets.map(async (b: any) => {
        const cur = b.currencyCode;
        try {
          const progress = await this.budgetsService.getProgress(accountId, b.id);
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

  private async executeGetCategoryBreakdown(
    data: Record<string, unknown>,
    accountId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    // Compute the breakdown from the raw expenses (converting each into the display
    // currency) rather than analyticsService.getSummary, which sums across currencies
    // into one currency-blind number that cannot be correctly converted afterwards.
    const result = await this.expensesService.findAll(accountId, {
      startDate: String(data.startDate),
      endDate: String(data.endDate),
      limit: 1000,
    });
    const expenses = Array.isArray(result.data) ? result.data : [];

    const rates = await this.getRatesSafe(baseCurrency);
    let fxConverted = false;

    const catMap = new Map<string, { categoryId?: string; categoryName: string; amount: number; count: number }>();
    const totalsByCurrency: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      const raw = Number(e.amount);
      const from = e.currencyCode || baseCurrency || 'USD';
      let value = raw;
      if (baseCurrency && rates) {
        const c = this.convertAmount(raw, from, baseCurrency, rates);
        if (c != null) { value = c; fxConverted = true; }
      }
      totalsByCurrency[from] = Math.round(((totalsByCurrency[from] || 0) + raw) * 100) / 100;
      const name = e.category?.name || 'Uncategorized';
      const entry = catMap.get(name) || { categoryId: e.category?.id, categoryName: name, amount: 0, count: 0 };
      entry.amount += value;
      entry.count += 1;
      catMap.set(name, entry);
      total += value;
    }

    const outCurrency = fxConverted ? baseCurrency : undefined;
    const categories = Array.from(catMap.values())
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        amount: Math.round(c.amount * 100) / 100,
        percentage: total > 0 ? Math.round((c.amount / total) * 1000) / 10 : 0,
        count: c.count,
        currencyCode: outCurrency,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      actionType: 'get_category_breakdown',
      success: true,
      data: {
        categories,
        totalExpenses: Math.round(total * 100) / 100,
        // Native per-currency totals, for transparency when amounts are mixed/unconverted.
        expensesByCurrency: totalsByCurrency,
        period: { startDate: data.startDate, endDate: data.endDate },
        ...(fxConverted ? { baseCurrency, fxConverted: true, fxApproximate: true } : {}),
      },
    };
  }

  private async executeGetDebtSummary(accountId: string): Promise<ChatActionResult> {
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

  private async executeGetInflationShield(
    accountId: string,
    userId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const shield = await this.inflationShieldService.getShield(accountId, userId, baseCurrency || 'USD');
    return { actionType: 'get_inflation_shield', success: true, data: shield as unknown as Record<string, unknown> };
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
    userId: string,
  ): Promise<ChatActionResult> {
    const goalId = String(data.goalId || '');
    const newAmount = Number(data.newAmount);

    if (!goalId || newAmount < 0) {
      return { actionType: 'update_goal_balance', success: false, errorMessage: 'Invalid goalId or amount' };
    }

    try {
      const updated = await this.goalPlannerService.updateGoal(
        accountId,
        goalId,
        { currentAmount: newAmount },
        { userId, note: 'AI update' },
      );
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

  /**
   * READ action: deterministic affordability verdict from the cashflow engine.
   * No confirmation required — executes immediately via executeWithCache.
   * The LLM receives the verdict struct and writes the one-liner narration only.
   */
  private async executeCheckAffordability(
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
