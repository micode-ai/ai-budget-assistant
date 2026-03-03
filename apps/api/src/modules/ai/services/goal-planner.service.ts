import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { getResponseModeInstruction, AiResponseMode } from './response-mode.helper';
import { resolveAiModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';

@Injectable()
export class GoalPlannerService {
  private readonly logger = new Logger(GoalPlannerService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async createGoal(accountId: string, userId: string, dto: { name: string; targetAmount: number; currencyCode: string; deadline: string }) {
    const goal = await this.prisma.savingsGoal.create({
      data: {
        accountId,
        userId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        currencyCode: dto.currencyCode,
        deadline: new Date(dto.deadline),
      },
    });

    // Auto-generate plan
    const plan = await this.generatePlan(accountId, goal.id, userId);
    return plan;
  }

  async generatePlan(accountId: string, goalId: string, userId?: string) {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { id: goalId, accountId },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    // Fetch response mode and language
    let responseMode: AiResponseMode = 'balanced';
    let userLanguage = 'en';
    const resolvedUserId = userId || goal.userId;
    if (resolvedUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: resolvedUserId },
        select: { aiResponseMode: true, language: true }
      });
      responseMode = (user?.aiResponseMode as AiResponseMode) || 'balanced';
      userLanguage = user?.language || 'en';
    }

    // Gather 3 months of financial data
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const [expenses, incomes] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: threeMonthsAgo } },
        include: { category: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, date: { gte: threeMonthsAgo } },
      }),
    ]);

    // Calculate averages
    const monthsOfData = Math.max(1, Math.ceil((now.getTime() - threeMonthsAgo.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalIncome = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const avgMonthlyExpenses = totalExpenses / monthsOfData;
    const avgMonthlyIncome = totalIncome / monthsOfData;
    const savingsRate = avgMonthlyIncome > 0 ? ((avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome) * 100 : 0;

    // Category breakdown
    const categoryTotals = new Map<string, number>();
    for (const expense of expenses) {
      const catName = (expense as any).category?.name || 'Uncategorized';
      categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + Number(expense.amount));
    }
    const categories = Array.from(categoryTotals.entries())
      .map(([name, total]) => ({ name: sanitizeForPrompt(name, 50), monthlyAvg: Math.round((total / monthsOfData) * 100) / 100 }))
      .sort((a, b) => b.monthlyAvg - a.monthlyAvg)
      .slice(0, 10);

    // Calculate months remaining
    const deadlineDate = new Date(goal.deadline);
    const monthsRemaining = Math.max(1, Math.ceil((deadlineDate.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const targetAmount = Number(goal.targetAmount);
    const currentAmount = Number(goal.currentAmount);
    const remaining = targetAmount - currentAmount;
    const monthlyRequired = remaining / monthsRemaining;

    const responseModeInstruction = getResponseModeInstruction(responseMode);

    // Language mapping for AI responses
    const languageMap: Record<string, string> = {
      en: 'English',
      ru: 'Russian',
      de: 'German',
      es: 'Spanish',
      fr: 'French',
      pl: 'Polish',
      ua: 'Ukrainian',
      be: 'Belarusian',
    };
    const languageName = languageMap[userLanguage] || 'English';

    const prompt = `You are a financial planner. Given the user's financial data, create a savings plan.

IMPORTANT: Respond in ${languageName}. All text fields (summary, labels) must be in ${languageName}.

${responseModeInstruction}

Goal: Save ${targetAmount} ${goal.currencyCode} by ${deadlineDate.toISOString().split('T')[0]}
Already saved: ${currentAmount} ${goal.currencyCode}
Remaining: ${remaining} ${goal.currencyCode}
Months remaining: ${monthsRemaining}
Monthly required: ${monthlyRequired.toFixed(2)}

User's financial profile (3-month average):
- Average monthly income: ${avgMonthlyIncome.toFixed(2)}
- Average monthly expenses: ${avgMonthlyExpenses.toFixed(2)}
- Current savings rate: ${savingsRate.toFixed(1)}%
- Top spending categories (monthly avg): ${JSON.stringify(categories)}

Create a plan with:
1. Realistic monthly and weekly contribution amounts
2. Specific category spending limits — for each category show current monthly average vs suggested limit, and how much that saves
3. 3-5 milestone checkpoints with dates and target cumulative amounts
4. Feasibility assessment: "easy" (monthly < 30% of avg savings), "moderate" (30-60%), "challenging" (60-90%), "unrealistic" (>90% or exceeds income)
5. Brief actionable summary (2-3 sentences)

Return ONLY valid JSON:
{
  "monthlyContribution": number,
  "weeklyContribution": number,
  "checkpoints": [{"date": "YYYY-MM-DD", "targetAmount": number, "label": "string"}],
  "categoryLimits": [{"categoryName": "string", "currentMonthly": number, "suggestedMonthly": number, "savingsPerMonth": number}],
  "estimatedCompletionDate": "YYYY-MM-DD",
  "feasibility": "easy" | "moderate" | "challenging" | "unrealistic",
  "summary": "string"
}`;

    // Resolve user's preferred AI model
    let aiModel = 'gpt-4o';
    if (userId) {
      const userPref = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true } });
      aiModel = resolveAiModel(userPref?.aiModel).model;
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      let plan: any;

      try {
        plan = JSON.parse(responseText);
      } catch {
        this.logger.warn('Failed to parse goal plan response');
        plan = {
          monthlyContribution: monthlyRequired,
          weeklyContribution: monthlyRequired / 4,
          checkpoints: [],
          categoryLimits: [],
          estimatedCompletionDate: deadlineDate.toISOString().split('T')[0],
          feasibility: 'moderate',
          summary: 'Could not generate detailed plan. Save approximately ' + monthlyRequired.toFixed(2) + ' per month.',
        };
      }

      // Save plan to goal
      await this.prisma.savingsGoal.update({
        where: { id: goalId },
        data: { aiPlan: plan },
      });

      const updatedGoal = await this.prisma.savingsGoal.findUnique({ where: { id: goalId } });

      return {
        goal: this.mapGoal(updatedGoal!),
        plan,
      };
    } catch (error) {
      this.logger.error(`Failed to generate goal plan: ${error}`);
      throw error;
    }
  }

  async listGoals(accountId: string) {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
    return goals.map(this.mapGoal);
  }

  async getGoal(accountId: string, goalId: string) {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { id: goalId, accountId },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.mapGoal(goal);
  }

  async getProgress(accountId: string, goalId: string) {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { id: goalId, accountId },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    const targetAmount = Number(goal.targetAmount);
    const currentAmount = Number(goal.currentAmount);
    const percentComplete = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;

    const now = new Date();
    const deadlineDate = new Date(goal.deadline);
    const createdAt = new Date(goal.createdAt);

    // Calculate if on track
    const totalDuration = deadlineDate.getTime() - createdAt.getTime();
    const elapsed = now.getTime() - createdAt.getTime();
    const expectedProgress = totalDuration > 0 ? (elapsed / totalDuration) * targetAmount : 0;
    const onTrack = currentAmount >= expectedProgress;
    const behindByAmount = Math.max(0, expectedProgress - currentAmount);

    // Calculate monthly needed from now
    const monthsRemaining = Math.max(1, Math.ceil((deadlineDate.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const remaining = targetAmount - currentAmount;
    const monthlyNeeded = remaining / monthsRemaining;

    // Project completion date based on current rate
    const monthsElapsed = Math.max(1, Math.ceil(elapsed / (30 * 24 * 60 * 60 * 1000)));
    const monthlyRate = currentAmount / monthsElapsed;
    const monthsToComplete = monthlyRate > 0 ? remaining / monthlyRate : Infinity;
    const projectedDate = new Date(now.getTime() + monthsToComplete * 30 * 24 * 60 * 60 * 1000);

    return {
      goal: this.mapGoal(goal),
      percentComplete: Math.round(percentComplete * 100) / 100,
      onTrack,
      projectedCompletionDate: isFinite(monthsToComplete) ? projectedDate.toISOString().split('T')[0] : 'N/A',
      monthlyNeeded: Math.round(monthlyNeeded * 100) / 100,
      behindByAmount: Math.round(behindByAmount * 100) / 100,
    };
  }

  async updateGoal(accountId: string, goalId: string, dto: { name?: string; targetAmount?: number; deadline?: string; currentAmount?: number; status?: string }) {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { id: goalId, accountId },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.targetAmount !== undefined) data.targetAmount = dto.targetAmount;
    if (dto.deadline !== undefined) data.deadline = new Date(dto.deadline);
    if (dto.currentAmount !== undefined) data.currentAmount = dto.currentAmount;
    if (dto.status !== undefined) data.status = dto.status;

    // Auto-complete: mark as completed when currentAmount reaches targetAmount
    if (data.currentAmount !== undefined && goal.status === 'active') {
      const target = data.targetAmount !== undefined ? data.targetAmount : Number(goal.targetAmount);
      if (Number(data.currentAmount) >= target) {
        data.status = 'completed';
      }
    }

    const updated = await this.prisma.savingsGoal.update({
      where: { id: goalId },
      data,
    });
    return this.mapGoal(updated);
  }

  async deleteGoal(accountId: string, goalId: string) {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { id: goalId, accountId },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    await this.prisma.savingsGoal.delete({ where: { id: goalId } });
    return { success: true };
  }

  private mapGoal(goal: any) {
    return {
      id: goal.id,
      accountId: goal.accountId,
      userId: goal.userId,
      name: goal.name,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount),
      currencyCode: goal.currencyCode,
      deadline: goal.deadline,
      status: goal.status,
      aiPlan: goal.aiPlan || undefined,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }
}
