import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { getResponseModeInstruction, AiResponseMode } from './response-mode.helper';
import { resolveAiModel } from './model-resolver';
import { ExpensesService } from '../../expenses/expenses.service';
import { IncomesService } from '../../incomes/incomes.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { CategoriesService } from '../../categories/categories.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import type { ChatActionType, ChatPendingAction, ChatActionResult } from '@budget/shared-types';

interface UserContext {
  totalSpentThisMonth: number;
  monthlyBudget: number;
  topCategories: { name: string; amount: number }[];
  recentExpenses: { description: string; amount: number; category?: string; items?: { description: string; totalPrice: number }[] }[];
  tags: { name: string }[];
  projects: { name: string; spent: number }[];
  topItems: { description: string; totalSpent: number; count: number }[];
  savingsGoals: { name: string; targetAmount: number; currentAmount: number; currencyCode: string; deadline: string; status: string }[];
  categoryNames: string[];
}

interface ChatMessageRecord {
  role: string;
  content: string;
}

interface ExpenseWithCategory {
  amount: unknown;
  description: string | null;
  category?: { name: string } | null;
  categorySplits?: Array<{ amount: unknown; category?: { name: string } | null }>;
  items?: Array<{ description: string; totalPrice: unknown; quantity: unknown }>;
  source?: string;
  accountId?: string;
}

interface BudgetRecord {
  period: string;
  categoryId: string | null;
  amount: unknown;
}

@Injectable()
export class ChatService {
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
    private readonly budgetsService: BudgetsService,
    private readonly categoriesService: CategoriesService,
    private readonly analyticsService: AnalyticsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  private async getUserModel(userId: string): Promise<{ model: string; maxTokens: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { aiModel: true },
    });
    return resolveAiModel(user?.aiModel);
  }

  /**
   * Get the encryption tier for an account (0=off, 1=text, 2=full).
   */
  private async getEncryptionTier(accountId?: string): Promise<number> {
    if (!accountId) return 0;
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    return account?.encryptionTier ?? 0;
  }

  async chat(userId: string, message: string, conversationId?: string, accountId?: string, accountName?: string | null) {
    // Tier 2 (full encryption): AI features are unavailable — amounts and text are encrypted
    const encryptionTier = await this.getEncryptionTier(accountId);
    if (encryptionTier >= 2) {
      return {
        message: 'AI chat is unavailable for this account because end-to-end encryption (full mode) is enabled. Financial data is encrypted and cannot be analyzed server-side.',
        conversationId: conversationId || null,
        encryptionRestricted: true,
      };
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await this.prisma.chatConversation.findUnique({
        where: { id: conversationId, userId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      });
    }

    if (!conversation) {
      conversation = await this.prisma.chatConversation.create({
        data: {
          userId,
          title: message.slice(0, 100),
        },
        include: { messages: true },
      });
    }

    // Save user message
    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Build context
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiResponseMode: true, aiModel: true } });
    const responseMode = (user?.aiResponseMode as AiResponseMode) || 'balanced';
    const { model: aiModel } = resolveAiModel(user?.aiModel);
    const context = await this.buildUserContext(userId, accountId);

    // Get conversation history (filter out internal roles like pending_action)
    const history = conversation.messages
      .filter((m: ChatMessageRecord) => ['user', 'assistant', 'system'].includes(m.role))
      .map((m: ChatMessageRecord) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

    const systemPrompt = this.buildSystemPrompt(context, encryptionTier, responseMode, message, history, accountName);

    // Call OpenAI with tool definitions
    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      tools: this.getToolDefinitions(),
      tool_choice: 'auto',
      max_tokens: 1000,
    });

    const choice = response.choices[0];

    // Handle tool calls
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const functionName = toolCall.function.name as ChatActionType;
      let functionArgs: Record<string, unknown>;
      try {
        functionArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        functionArgs = {};
      }

      if (this.isWriteAction(functionName)) {
        return this.handleWriteActionRequest(
          conversation, functionName, functionArgs, systemPrompt, history, message, aiModel, accountId,
        );
      } else {
        return this.handleReadAction(
          conversation, functionName, functionArgs, toolCall, systemPrompt, history, message, accountId, aiModel,
        );
      }
    }

    // No tool call — regular text response
    const assistantMessage = choice?.message?.content || 'I apologize, but I could not generate a response.';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Save assistant message
    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantMessage,
        tokensUsed,
      },
    });

    return {
      message: assistantMessage,
      conversationId: conversation.id,
    };
  }

  async confirmAction(userId: string, conversationId: string, actionId: string, accountId?: string) {
    const pendingMessage = await this.prisma.chatMessage.findFirst({
      where: {
        conversationId,
        role: 'pending_action',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingMessage) {
      throw new NotFoundException('Pending action not found or expired');
    }

    const pendingData = JSON.parse(pendingMessage.content) as ChatPendingAction & { accountId?: string };
    if (pendingData.id !== actionId) {
      throw new NotFoundException('Pending action not found');
    }

    // Use the accountId stored with the pending action (resolved from user message) if available
    const effectiveAccountId = pendingData.accountId || accountId || '';

    // Execute the write action
    const result = await this.executeAction(
      pendingData.actionType,
      pendingData.data as Record<string, unknown>,
      effectiveAccountId,
      userId,
    );

    // Mark pending action as executed
    await this.prisma.chatMessage.update({
      where: { id: pendingMessage.id },
      data: {
        role: 'action_executed',
        content: JSON.stringify({ ...pendingData, status: 'executed', result }),
      },
    });

    // Detect language from conversation for localized response
    const lang = await this.detectConversationLanguage(conversationId);
    const localizedSummary = this.buildActionSummary(
      pendingData.actionType,
      pendingData.data as Record<string, unknown>,
      lang,
    );

    // Save confirmation assistant message
    const confirmText = result.success
      ? this.getConfirmText(lang, localizedSummary)
      : this.getFailText(lang, result.errorMessage);

    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: confirmText,
      },
    });

    return {
      message: confirmText,
      conversationId,
      actionResult: result,
    };
  }

  async rejectAction(userId: string, conversationId: string, actionId: string, reason?: string) {
    const pendingMessage = await this.prisma.chatMessage.findFirst({
      where: {
        conversationId,
        role: 'pending_action',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingMessage) {
      throw new NotFoundException('Pending action not found');
    }

    const pendingData = JSON.parse(pendingMessage.content) as ChatPendingAction;
    if (pendingData.id !== actionId) {
      throw new NotFoundException('Pending action not found');
    }

    // Mark as rejected
    await this.prisma.chatMessage.update({
      where: { id: pendingMessage.id },
      data: {
        role: 'action_rejected',
        content: JSON.stringify({ ...pendingData, status: 'rejected', reason }),
      },
    });

    const lang = await this.detectConversationLanguage(conversationId);
    const rejectText = this.getRejectText(lang);
    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: rejectText,
      },
    });

    return {
      message: rejectText,
      conversationId,
    };
  }

  // ── Tool Definitions ──

  private getToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
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
    ];
  }

  // ── Action Handling ──

  private isWriteAction(actionType: string): boolean {
    return ['create_expense', 'create_income', 'create_budget'].includes(actionType);
  }

  private async handleWriteActionRequest(
    conversation: { id: string },
    actionType: ChatActionType,
    args: Record<string, unknown>,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    userMessage: string,
    aiModel: string,
    accountId?: string,
  ) {
    const displaySummary = this.buildActionSummary(actionType, args);
    const pendingAction: ChatPendingAction = {
      id: randomUUID(),
      actionType,
      data: args as any,
      displaySummary,
    };

    // Save pending action as a special message (include accountId for correct resolution on confirm)
    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'pending_action',
        content: JSON.stringify({ ...pendingAction, accountId }),
      },
    });

    // Generate confirmation message in user's language via OpenAI
    const confirmationSystemPrompt = `${systemPrompt}\n\nThe user wants to perform this action: ${displaySummary}. Generate a SHORT confirmation message (1-2 sentences max) asking them to confirm or cancel. Format: "I'd like to [action]. Please confirm or cancel." Use the SAME language as the conversation.`;

    const confirmResponse = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: confirmationSystemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
      max_tokens: 150,
    });

    const confirmMessage = confirmResponse.choices[0]?.message?.content || `I'd like to ${displaySummary}. Please confirm or cancel this action.`;

    // Save assistant message describing the action
    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: confirmMessage,
      },
    });

    return {
      message: confirmMessage,
      conversationId: conversation.id,
      pendingAction,
    };
  }

  private async handleReadAction(
    conversation: { id: string },
    actionType: ChatActionType,
    args: Record<string, unknown>,
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    userMessage: string,
    accountId?: string,
    aiModel?: string,
  ) {
    const result = await this.executeAction(actionType, args, accountId || '', '');

    // Feed the result back to OpenAI to generate a natural language summary
    const followUpResponse = await this.openai.chat.completions.create({
      model: aiModel || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
        {
          role: 'assistant',
          content: null,
          tool_calls: [toolCall],
        } as any,
        {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.data || {}),
        },
      ],
      max_tokens: 1000,
    });

    const summaryText = followUpResponse.choices[0]?.message?.content || 'Here are your results.';
    const tokensUsed = followUpResponse.usage?.total_tokens || 0;

    // Save assistant message
    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: summaryText,
        tokensUsed,
      },
    });

    return {
      message: summaryText,
      conversationId: conversation.id,
      actionResult: result,
    };
  }

  // ── Action Execution ──

  private async executeAction(
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
        case 'get_expenses':
          return await this.executeGetExpenses(data, accountId);
        case 'get_budget_status':
          return await this.executeGetBudgetStatus(data, accountId);
        case 'get_category_breakdown':
          return await this.executeGetCategoryBreakdown(data, accountId);
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

    const expense = await this.expensesService.create(accountId, userId, dto as any);
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
    // Resolve category name to ID if provided
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

  private async executeGetExpenses(
    data: Record<string, unknown>,
    accountId: string,
  ): Promise<ChatActionResult> {
    const filters: any = {
      startDate: String(data.startDate),
      endDate: String(data.endDate),
      limit: 20,
    };

    // If category name provided, resolve to ID
    if (data.categoryName) {
      const categories = await this.categoriesService.findAll(accountId);
      const match = categories.find(
        (c: { name: string }) => c.name.toLowerCase() === String(data.categoryName).toLowerCase(),
      );
      if (match) filters.categoryId = match.id;
    }

    const result = await this.expensesService.findAll(accountId, filters);
    const expenses = (result as any).data || result;
    const expenseList = (Array.isArray(expenses) ? expenses : []).map((e: any) => ({
      id: e.id,
      amount: Number(e.amount),
      currencyCode: e.currencyCode,
      description: e.description,
      category: e.category?.name,
      date: e.date,
    }));

    const total = expenseList.reduce((sum: number, e: any) => sum + e.amount, 0);

    return {
      actionType: 'get_expenses',
      success: true,
      data: {
        expenses: expenseList,
        total,
        count: expenseList.length,
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

    // Filter by name or category if specified
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
        period: { startDate: data.startDate, endDate: data.endDate },
      },
    };
  }

  // ── Helpers ──

  private detectLanguage(text: string): string {
    const cyrillicRatio = (text.match(/[а-яА-ЯёЁіІїЇєЄґҐўЎ]/g) || []).length / Math.max(text.length, 1);
    if (cyrillicRatio > 0.3) {
      if (/[іІїЇєЄґҐ]/.test(text)) return 'Ukrainian';
      if (/[ўЎ]/.test(text)) return 'Belarusian';
      return 'Russian';
    }
    if (/[äöüßÄÖÜ]/.test(text)) return 'German';
    if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text)) return 'Spanish';
    if (/[àâäæçèéêëîïôœùûüÿÀÂÄÆÇÈÉÊËÎÏÔŒÙÛÜŸ]/.test(text)) return 'French';
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return 'Polish';
    return 'English';
  }

  private async detectConversationLanguage(conversationId: string): Promise<string> {
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId, role: 'user' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    if (recentMessages.length === 0) return 'English';
    const allText = recentMessages.map(m => m.content).join(' ');
    return this.detectLanguage(allText);
  }

  private buildActionSummary(actionType: ChatActionType, args: Record<string, unknown>, lang = 'English'): string {
    const desc = args.description ? `"${args.description}"` : '';
    const cat = args.categoryName ? ` [${args.categoryName}]` : '';
    const amt = `${args.amount} ${args.currencyCode}`;

    switch (lang) {
      case 'Russian':
      case 'Ukrainian':
      case 'Belarusian':
        switch (actionType) {
          case 'create_expense':
            return `расход ${amt}${desc ? ` — ${desc}` : ''}${cat}`;
          case 'create_income':
            return `доход ${amt}${desc ? ` — ${desc}` : ''}`;
          case 'create_budget':
            return `бюджет "${args.name}" на ${amt} (${args.period})`;
          default:
            return `${actionType}`;
        }
      case 'German':
        switch (actionType) {
          case 'create_expense':
            return `Ausgabe ${amt}${desc ? ` — ${desc}` : ''}${cat}`;
          case 'create_income':
            return `Einnahme ${amt}${desc ? ` — ${desc}` : ''}`;
          case 'create_budget':
            return `Budget "${args.name}" für ${amt} (${args.period})`;
          default:
            return `${actionType}`;
        }
      case 'Spanish':
        switch (actionType) {
          case 'create_expense':
            return `gasto ${amt}${desc ? ` — ${desc}` : ''}${cat}`;
          case 'create_income':
            return `ingreso ${amt}${desc ? ` — ${desc}` : ''}`;
          case 'create_budget':
            return `presupuesto "${args.name}" por ${amt} (${args.period})`;
          default:
            return `${actionType}`;
        }
      case 'French':
        switch (actionType) {
          case 'create_expense':
            return `dépense ${amt}${desc ? ` — ${desc}` : ''}${cat}`;
          case 'create_income':
            return `revenu ${amt}${desc ? ` — ${desc}` : ''}`;
          case 'create_budget':
            return `budget "${args.name}" pour ${amt} (${args.period})`;
          default:
            return `${actionType}`;
        }
      case 'Polish':
        switch (actionType) {
          case 'create_expense':
            return `wydatek ${amt}${desc ? ` — ${desc}` : ''}${cat}`;
          case 'create_income':
            return `przychód ${amt}${desc ? ` — ${desc}` : ''}`;
          case 'create_budget':
            return `budżet "${args.name}" na ${amt} (${args.period})`;
          default:
            return `${actionType}`;
        }
      default: // English
        switch (actionType) {
          case 'create_expense':
            return `expense ${amt}${desc ? ` for ${desc}` : ''}${cat}`;
          case 'create_income':
            return `income ${amt}${desc ? ` — ${desc}` : ''}`;
          case 'create_budget':
            return `budget "${args.name}" for ${amt} (${args.period})`;
          default:
            return `${actionType}`;
        }
    }
  }

  private getConfirmText(lang: string, summary: string): string {
    switch (lang) {
      case 'Russian': return `✅ Готово! ${summary} — успешно добавлено.`;
      case 'Ukrainian': return `✅ Готово! ${summary} — успішно додано.`;
      case 'Belarusian': return `✅ Гатова! ${summary} — паспяхова дададзена.`;
      case 'German': return `✅ Erledigt! ${summary} — erfolgreich erstellt.`;
      case 'Spanish': return `✅ ¡Listo! ${summary} — creado con éxito.`;
      case 'French': return `✅ Terminé ! ${summary} — créé avec succès.`;
      case 'Polish': return `✅ Gotowe! ${summary} — utworzono pomyślnie.`;
      default: return `✅ Done! ${summary} — successfully created.`;
    }
  }

  private getFailText(lang: string, errorMessage?: string): string {
    const err = errorMessage || 'unknown error';
    switch (lang) {
      case 'Russian': return `❌ Ошибка: ${err}`;
      case 'Ukrainian': return `❌ Помилка: ${err}`;
      case 'Belarusian': return `❌ Памылка: ${err}`;
      case 'German': return `❌ Fehler: ${err}`;
      case 'Spanish': return `❌ Error: ${err}`;
      case 'French': return `❌ Erreur : ${err}`;
      case 'Polish': return `❌ Błąd: ${err}`;
      default: return `❌ Failed to execute: ${err}`;
    }
  }

  private getRejectText(lang: string): string {
    switch (lang) {
      case 'Russian': return 'Действие отменено. Напишите, если что-то ещё нужно.';
      case 'Ukrainian': return 'Дію скасовано. Напишіть, якщо потрібно щось ще.';
      case 'Belarusian': return 'Дзеянне адменена. Напішыце, калі трэба нешта яшчэ.';
      case 'German': return 'Aktion abgebrochen. Lassen Sie mich wissen, wenn Sie etwas anderes brauchen.';
      case 'Spanish': return 'Acción cancelada. Avísame si necesitas algo más.';
      case 'French': return 'Action annulée. Dites-moi si vous avez besoin d\'autre chose.';
      case 'Polish': return 'Anulowano. Daj znać, jeśli potrzebujesz czegoś jeszcze.';
      default: return 'Action cancelled. Let me know if you need anything else.';
    }
  }

  private async buildUserContext(userId: string, accountId?: string): Promise<UserContext> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const expenseWhere = accountId
      ? { accountId, date: { gte: startOfMonth }, isDeleted: false }
      : { userId, date: { gte: startOfMonth }, isDeleted: false };

    // Get expenses this month with categories, splits and items
    const expenses = await this.prisma.expense.findMany({
      where: expenseWhere,
      include: {
        category: true,
        categorySplits: { where: { isDeleted: false }, include: { category: true } },
        items: { where: { isDeleted: false } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    });

    // Get active budgets
    const budgetWhere = accountId
      ? { accountId, isActive: true, isDeleted: false }
      : { userId, isActive: true, isDeleted: false };
    const budgets = await this.prisma.budget.findMany({ where: budgetWhere });

    const totalSpent = expenses.reduce((sum: number, e: ExpenseWithCategory) => sum + Number(e.amount), 0);
    const monthlyBudget = budgets
      .filter((b: BudgetRecord) => b.period === 'monthly' && !b.categoryId)
      .reduce((sum: number, b: BudgetRecord) => sum + Number(b.amount), 0);

    // Group by category — handle categorySplits like analytics does
    const categoryTotals = new Map<string, number>();
    for (const expense of expenses as any[]) {
      if (expense.categorySplits && expense.categorySplits.length > 0) {
        for (const split of expense.categorySplits) {
          const catName = split.category?.name || 'Uncategorized';
          categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + Number(split.amount));
        }
      } else {
        const categoryName = expense.category?.name || 'Uncategorized';
        categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + Number(expense.amount));
      }
    }

    const topCategories = Array.from(categoryTotals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const recentExpenses = expenses.slice(0, 5).map((e: any) => {
      const category = e.categorySplits?.length > 0
        ? e.categorySplits.map((s: any) => s.category?.name).filter(Boolean).join(', ')
        : e.category?.name;
      const items = e.items?.map((i: any) => ({
        description: i.description,
        totalPrice: Number(i.totalPrice),
      }));
      return {
        description: e.description || 'Expense',
        amount: Number(e.amount),
        category,
        items: items?.length > 0 ? items : undefined,
      };
    });

    // Aggregate expense items for top purchased items
    const itemMap = new Map<string, { totalSpent: number; count: number }>();
    for (const expense of expenses as any[]) {
      if (!expense.items) continue;
      for (const item of expense.items) {
        if (!item.description) continue;
        const key = item.description.toLowerCase().trim();
        const existing = itemMap.get(key) || { totalSpent: 0, count: 0 };
        itemMap.set(key, {
          totalSpent: existing.totalSpent + Number(item.totalPrice),
          count: existing.count + Number(item.quantity || 1),
        });
      }
    }
    const topItems = Array.from(itemMap.entries())
      .map(([description, data]) => ({ description, ...data }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const resolvedAccountId = accountId || expenses[0]?.accountId;
    let tags: { name: string }[] = [];
    let projects: { name: string; spent: number }[] = [];
    let categoryNames: string[] = [];

    if (resolvedAccountId) {
      // Fetch tags for the account
      const accountTags = await this.prisma.tag.findMany({
        where: { accountId: resolvedAccountId, isDeleted: false },
        orderBy: { usageCount: 'desc' },
        take: 20,
      });
      tags = accountTags.map((t: { name: string }) => ({ name: t.name }));

      // Fetch active projects
      const accountProjects = await this.prisma.project.findMany({
        where: { accountId: resolvedAccountId, isDeleted: false, isArchived: false },
        include: {
          projectExpenses: {
            where: { isDeleted: false },
            include: { expense: { select: { amount: true } } },
          },
        },
      });
      projects = accountProjects.map((p: { name: string; projectExpenses: Array<{ expense: { amount: unknown } }> }) => ({
        name: p.name,
        spent: p.projectExpenses.reduce((sum: number, pe: { expense: { amount: unknown } }) => sum + Number(pe.expense.amount), 0),
      }));

      // Fetch all categories for tool call matching
      const allCategories = await this.categoriesService.findAll(resolvedAccountId);
      categoryNames = allCategories.map((c: { name: string }) => c.name);
    }

    // Fetch active savings goals
    const goalsWhere = accountId
      ? { accountId, status: 'active' }
      : { userId, status: 'active' };
    const goals = await this.prisma.savingsGoal.findMany({ where: goalsWhere });
    const savingsGoals = goals.map((g: any) => ({
      name: g.name,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      currencyCode: g.currencyCode,
      deadline: g.deadline.toISOString().split('T')[0],
      status: g.status,
    }));

    return {
      totalSpentThisMonth: totalSpent,
      monthlyBudget,
      topCategories,
      recentExpenses,
      tags,
      projects,
      topItems,
      savingsGoals,
      categoryNames,
    };
  }

  private buildSystemPrompt(context: UserContext, encryptionTier = 0, responseMode: AiResponseMode = 'balanced', userMessage = '', history: Array<{ role: string; content: string }> = [], accountName?: string | null): string {
    const encryptionNotice = encryptionTier >= 1
      ? `\n\nIMPORTANT: This account has end-to-end encryption enabled (text fields). Expense descriptions, notes, tag names, and project names shown below may be encrypted/unavailable. Focus your analysis on numerical data (amounts, category totals) and general spending patterns. Do not attempt to interpret encrypted text values.`
      : '';

    // For Tier 1, descriptions are encrypted — show amounts only for recent expenses
    const recentExpensesText = encryptionTier >= 1
      ? context.recentExpenses.map((e) => `Amount: ${e.amount.toFixed(2)}`).join('\n') || 'No data'
      : context.recentExpenses.map((e) => {
          let line = `${e.description}: ${e.amount.toFixed(2)}`;
          if (e.category) line += ` [${e.category}]`;
          if (e.items && e.items.length > 0) {
            line += ` (items: ${e.items.map(i => `${i.description} ${i.totalPrice.toFixed(2)}`).join(', ')})`;
          }
          return line;
        }).join('\n') || 'No data';

    const tagsText = encryptionTier >= 1 ? '(encrypted)' : (context.tags.map(t => t.name).join(', ') || 'none');
    const projectsText = encryptionTier >= 1
      ? context.projects.map(p => `Project (${p.spent.toFixed(2)} spent)`).join(', ') || 'none'
      : context.projects.map(p => `${p.name} (${p.spent.toFixed(2)} spent)`).join(', ') || 'none';

    const topItemsText = encryptionTier >= 1
      ? '(encrypted)'
      : context.topItems.length > 0
        ? context.topItems.map(i => `${i.description}: ${i.totalSpent.toFixed(2)} (×${i.count})`).join(', ')
        : 'No item-level data';

    const categoriesListText = context.categoryNames.length > 0
      ? context.categoryNames.join(', ')
      : 'No categories available';

    const today = new Date().toISOString().split('T')[0];

    // Detect language from conversation history first (preserve consistency)
    let userLanguage = 'English';
    const recentAssistantMessages = history.filter(m => m.role === 'assistant').slice(-3);
    if (recentAssistantMessages.length > 0) {
      const allAssistantText = recentAssistantMessages.map(m => m.content).join(' ');
      const detectedFromHistory = this.detectLanguage(allAssistantText);
      if (detectedFromHistory !== 'English') {
        userLanguage = detectedFromHistory;
      }
    }

    // Override with current user message language if clearly different
    const currentMessageLanguage = this.detectLanguage(userMessage);
    if (currentMessageLanguage !== 'English' && currentMessageLanguage !== userLanguage) {
      userLanguage = currentMessageLanguage;
    } else if (currentMessageLanguage !== 'English') {
      userLanguage = currentMessageLanguage;
    }

    const languageInstruction = userLanguage !== 'English'
      ? `\n\nCRITICAL: The user is writing in ${userLanguage}. You MUST respond in ${userLanguage}, NOT in English. All your responses, including action confirmations and data summaries, must be in ${userLanguage}.`
      : '';

    return `You are a helpful financial assistant helping a user manage their budget and expenses.
Format your responses using Markdown: use **bold**, lists, headers (##), and tables where appropriate for clarity.${encryptionNotice}${languageInstruction}

Today's date: ${today}${accountName ? `\nCurrently viewing account: "${accountName}"` : ''}
Available categories: ${categoriesListText}
Currency symbol mapping: ₴=UAH, $=USD, €=EUR, zł/zl=PLN, £=GBP, ₽=RUB

Current user's financial context:
- Total spent this month: ${context.totalSpentThisMonth.toFixed(2)}
- Monthly budget: ${context.monthlyBudget > 0 ? context.monthlyBudget.toFixed(2) : 'Not set'}
- Top spending categories: ${context.topCategories.map((c) => `${c.name}: ${c.amount.toFixed(2)}`).join(', ') || 'No data'}
- Recent expenses:
${recentExpensesText}
- Top purchased items (from receipts): ${topItemsText}
- User's tags: ${tagsText}
- Active projects: ${projectsText}

You can help analyze spending by tags (e.g., "How much on #subscriptions?"), by projects (e.g., "Show vacation spending"), and by individual purchased items from receipts (e.g., "How much did I spend on milk?").
When users reference tags with #, look them up. When they mention project names, match to active projects.
When asked about specific items or products, use the "Top purchased items" data which comes from scanned receipts.

- Active savings goals: ${context.savingsGoals.length > 0 ? context.savingsGoals.map(g => `${g.name}: ${g.currentAmount}/${g.targetAmount} ${g.currencyCode} by ${g.deadline}`).join(', ') : 'none'}

${getResponseModeInstruction(responseMode)}

When the user asks to CREATE something (expense, income, budget), use the appropriate tool function.
When the user asks to SHOW or LIST data (expenses, budget status, breakdown), use the appropriate query tool.
If the user doesn't specify a date, use today's date (${today}).
If the user references a category, match it to the available categories list above.

Provide helpful, actionable advice about budgeting and spending. Be concise but thorough.
If asked about specific data you don't have, acknowledge the limitation and provide general guidance.
Always be encouraging and supportive about the user's financial journey.`;
  }
}
