import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';

interface UserContext {
  totalSpentThisMonth: number;
  monthlyBudget: number;
  topCategories: { name: string; amount: number }[];
  recentExpenses: { description: string; amount: number }[];
  tags: { name: string }[];
  projects: { name: string; spent: number }[];
}

interface ChatMessageRecord {
  role: string;
  content: string;
}

interface ExpenseWithCategory {
  amount: unknown;
  description: string | null;
  category?: { name: string } | null;
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
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async chat(userId: string, message: string, conversationId?: string) {
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
    const context = await this.buildUserContext(userId);
    const systemPrompt = this.buildSystemPrompt(context);

    // Get conversation history
    const history = conversation.messages.map((m: ChatMessageRecord) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    // Call OpenAI
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      max_tokens: 1000,
    });

    const assistantMessage = response.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
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

  private async buildUserContext(userId: string): Promise<UserContext> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get expenses this month
    const expenses = await this.prisma.expense.findMany({
      where: {
        userId,
        date: { gte: startOfMonth },
        isDeleted: false,
      },
      include: { category: true },
      orderBy: { date: 'desc' },
      take: 50,
    });

    // Get active budgets
    const budgets = await this.prisma.budget.findMany({
      where: { userId, isActive: true, isDeleted: false },
    });

    const totalSpent = expenses.reduce((sum: number, e: ExpenseWithCategory) => sum + Number(e.amount), 0);
    const monthlyBudget = budgets
      .filter((b: BudgetRecord) => b.period === 'monthly' && !b.categoryId)
      .reduce((sum: number, b: BudgetRecord) => sum + Number(b.amount), 0);

    // Group by category
    const categoryTotals = new Map<string, number>();
    for (const expense of expenses) {
      const categoryName = expense.category?.name || 'Uncategorized';
      categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + Number(expense.amount));
    }

    const topCategories = Array.from(categoryTotals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const recentExpenses = expenses.slice(0, 5).map((e: ExpenseWithCategory) => ({
      description: e.description || 'Expense',
      amount: Number(e.amount),
    }));

    // Get accountId from first expense (all expenses should have same accountId for this user)
    const accountId = expenses[0]?.accountId;
    let tags: { name: string }[] = [];
    let projects: { name: string; spent: number }[] = [];

    if (accountId) {
      // Fetch tags for the account
      const accountTags = await this.prisma.tag.findMany({
        where: { accountId, isDeleted: false },
        orderBy: { usageCount: 'desc' },
        take: 20,
      });
      tags = accountTags.map(t => ({ name: t.name }));

      // Fetch active projects
      const accountProjects = await this.prisma.project.findMany({
        where: { accountId, isDeleted: false, isArchived: false },
        include: {
          projectExpenses: {
            where: { isDeleted: false },
            include: { expense: { select: { amount: true } } },
          },
        },
      });
      projects = accountProjects.map(p => ({
        name: p.name,
        spent: p.projectExpenses.reduce((sum, pe) => sum + Number(pe.expense.amount), 0),
      }));
    }

    return {
      totalSpentThisMonth: totalSpent,
      monthlyBudget,
      topCategories,
      recentExpenses,
      tags,
      projects,
    };
  }

  private buildSystemPrompt(context: UserContext): string {
    return `You are a helpful financial assistant helping a user manage their budget and expenses.

Current user's financial context:
- Total spent this month: ${context.totalSpentThisMonth.toFixed(2)}
- Monthly budget: ${context.monthlyBudget > 0 ? context.monthlyBudget.toFixed(2) : 'Not set'}
- Top spending categories: ${context.topCategories.map((c) => `${c.name}: ${c.amount.toFixed(2)}`).join(', ') || 'No data'}
- Recent expenses: ${context.recentExpenses.map((e) => `${e.description}: ${e.amount.toFixed(2)}`).join(', ') || 'No data'}
- User's tags: ${context.tags.map(t => t.name).join(', ') || 'none'}
- Active projects: ${context.projects.map(p => `${p.name} (${p.spent.toFixed(2)} spent)`).join(', ') || 'none'}

You can help analyze spending by tags (e.g., "How much on #subscriptions?") and by projects (e.g., "Show vacation spending").
When users reference tags with #, look them up. When they mention project names, match to active projects.

Provide helpful, actionable advice about budgeting and spending. Be concise but thorough.
If asked about specific data you don't have, acknowledge the limitation and provide general guidance.
Always be encouraging and supportive about the user's financial journey.`;
  }
}
