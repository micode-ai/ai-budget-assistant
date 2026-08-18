import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { GoalPlannerService } from './goal-planner.service';
import { PrismaService } from '../../../database/prisma.service';

const mockChatCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockChatCreate } },
    })),
  };
});

describe('GoalPlannerService', () => {
  let service: GoalPlannerService;
  let prisma: {
    savingsGoal: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    goalContribution: { create: jest.Mock; findMany: jest.Mock };
    user: { findUnique: jest.Mock };
    expense: { findMany: jest.Mock };
    income: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockChatCreate.mockReset();
    prisma = {
      savingsGoal: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      goalContribution: { create: jest.fn(), findMany: jest.fn() },
      user: { findUnique: jest.fn() },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      income: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        GoalPlannerService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(GoalPlannerService);
  });

  function baseGoal(overrides: Record<string, unknown> = {}) {
    return {
      id: 'goal-1',
      accountId: 'acc-1',
      userId: 'user-1',
      name: 'New Car',
      targetAmount: 1000,
      currentAmount: 400,
      currencyCode: 'USD',
      deadline: new Date('2026-06-01'),
      status: 'active',
      aiPlan: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  describe('updateGoal', () => {
    it('throws NotFoundException when the goal does not exist', async () => {
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.updateGoal('acc-1', 'missing', { currentAmount: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savingsGoal.update).not.toHaveBeenCalled();
    });

    it('auto-completes when currentAmount reaches targetAmount on an active goal', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000, status: 'active' });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, currentAmount: 1000, status: 'completed' });

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 1000 });

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 1000, status: 'completed' },
      });
    });

    it('auto-completes when currentAmount exceeds targetAmount', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000, status: 'active' });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, currentAmount: 1200, status: 'completed' });

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 1200 });

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 1200, status: 'completed' },
      });
    });

    it('does not auto-complete a goal that is not active', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000, status: 'paused' });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, currentAmount: 1000 });

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 1000 });

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 1000 },
      });
    });

    it('does not auto-complete when currentAmount stays below targetAmount', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000, status: 'active' });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, currentAmount: 500 });

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 500 });

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 500 },
      });
    });

    it('uses the in-flight targetAmount (not the stored one) for the auto-complete check', async () => {
      // Lowering the target AND setting currentAmount in the same update: the check must
      // compare against the new (lowered) target, not the stale stored one.
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000, status: 'active' });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({
        ...goal,
        currentAmount: 500,
        targetAmount: 300,
        status: 'completed',
      });

      await service.updateGoal('acc-1', 'goal-1', { targetAmount: 300, currentAmount: 500 });

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { targetAmount: 300, currentAmount: 500, status: 'completed' },
      });
    });

    it('does not evaluate auto-complete at all when currentAmount is not part of the update', async () => {
      // Only guarded on `dto.currentAmount !== undefined` — lowering the target alone
      // must not retroactively complete the goal.
      const goal = baseGoal({ currentAmount: 1000, targetAmount: 1000, status: 'active' });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, targetAmount: 2000 });

      await service.updateGoal('acc-1', 'goal-1', { targetAmount: 2000 });

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { targetAmount: 2000 },
      });
    });

    it('records a contribution via $transaction when currentAmount strictly increases and contributionMeta is provided', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000, currencyCode: 'EUR' });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      const updatedGoal = { ...goal, currentAmount: 600 };
      prisma.savingsGoal.update.mockReturnValueOnce(Promise.resolve(updatedGoal));
      prisma.goalContribution.create.mockReturnValueOnce(Promise.resolve({ id: 'contrib-1' }));

      const result = await service.updateGoal(
        'acc-1',
        'goal-1',
        { currentAmount: 600 },
        { userId: 'user-9', note: 'AI update' },
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 600 },
      });
      expect(prisma.goalContribution.create).toHaveBeenCalledWith({
        data: {
          goalId: 'goal-1',
          accountId: 'acc-1',
          userId: 'user-9',
          amount: 200,
          currencyCode: 'EUR',
          note: 'AI update',
        },
      });
      expect(result.currentAmount).toBe(600);
    });

    it('defaults the contribution note to null when contributionMeta.note is omitted', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000 });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockReturnValueOnce(Promise.resolve({ ...goal, currentAmount: 500 }));
      prisma.goalContribution.create.mockReturnValueOnce(Promise.resolve({ id: 'contrib-2' }));

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 500 }, { userId: 'user-9' });

      expect(prisma.goalContribution.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ note: null }) }),
      );
    });

    it('does not record a contribution on a decrease, even with contributionMeta', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000 });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, currentAmount: 300 });

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 300 }, { userId: 'user-9' });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.goalContribution.create).not.toHaveBeenCalled();
      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 300 },
      });
    });

    it('does not record a contribution on a no-op update (same amount), even with contributionMeta', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000 });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal });

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 400 }, { userId: 'user-9' });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.goalContribution.create).not.toHaveBeenCalled();
    });

    it('does not record a contribution when currentAmount increases but contributionMeta is absent', async () => {
      const goal = baseGoal({ currentAmount: 400, targetAmount: 1000 });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, currentAmount: 600 });

      await service.updateGoal('acc-1', 'goal-1', { currentAmount: 600 });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.goalContribution.create).not.toHaveBeenCalled();
      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 600 },
      });
    });

    it('builds a partial update payload containing only the provided fields', async () => {
      const goal = baseGoal();
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, name: 'Renamed' });

      await service.updateGoal('acc-1', 'goal-1', { name: 'Renamed' });

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { name: 'Renamed' },
      });
    });

    it('converts a provided deadline string to a Date in the update payload', async () => {
      const goal = baseGoal();
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.savingsGoal.update.mockResolvedValueOnce({ ...goal, deadline: new Date('2027-01-01') });

      await service.updateGoal('acc-1', 'goal-1', { deadline: '2027-01-01' });

      const call = prisma.savingsGoal.update.mock.calls[0][0];
      expect(call.data.deadline).toBeInstanceOf(Date);
      expect(call.data.deadline.toISOString().slice(0, 10)).toBe('2027-01-01');
    });
  });

  describe('getProgress', () => {
    it('throws NotFoundException when the goal does not exist', async () => {
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(null);
      await expect(service.getProgress('acc-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports on-track when currentAmount is ahead of the expected linear pace', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      try {
        const goal = baseGoal({
          currentAmount: 900,
          targetAmount: 1000,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          deadline: new Date('2026-03-01T00:00:00.000Z'),
        });
        prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);

        const result = await service.getProgress('acc-1', 'goal-1');

        expect(result.onTrack).toBe(true);
        expect(result.behindByAmount).toBe(0);
        expect(result.percentComplete).toBe(90);
      } finally {
        jest.useRealTimers();
      }
    });

    it('reports behind-pace with a positive behindByAmount when under the expected linear pace', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      try {
        const goal = baseGoal({
          currentAmount: 100,
          targetAmount: 1000,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          deadline: new Date('2026-03-01T00:00:00.000Z'),
        });
        prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);

        const result = await service.getProgress('acc-1', 'goal-1');

        expect(result.onTrack).toBe(false);
        expect(result.behindByAmount).toBeGreaterThan(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns N/A for the projected completion date when no progress has been made yet', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      try {
        const goal = baseGoal({
          currentAmount: 0,
          targetAmount: 1000,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          deadline: new Date('2026-06-01T00:00:00.000Z'),
        });
        prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);

        const result = await service.getProgress('acc-1', 'goal-1');

        expect(result.projectedCompletionDate).toBe('N/A');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('generatePlan', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-15T00:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('throws NotFoundException when the goal does not exist', async () => {
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(null);
      await expect(service.generatePlan('acc-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockChatCreate).not.toHaveBeenCalled();
    });

    it('computes a zero monthly requirement for a goal that is already met', async () => {
      const goal = baseGoal({
        currentAmount: 1000,
        targetAmount: 1000,
        deadline: new Date('2026-04-15T00:00:00.000Z'),
      });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.user.findUnique.mockResolvedValueOnce({ aiResponseMode: 'balanced', language: 'en' });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ feasibility: 'easy' }) } }],
      });
      prisma.savingsGoal.update.mockResolvedValueOnce(undefined);
      prisma.savingsGoal.findUnique.mockResolvedValueOnce({ ...goal, aiPlan: { feasibility: 'easy' } });

      await service.generatePlan('acc-1', 'goal-1', 'user-1');

      const promptArg = mockChatCreate.mock.calls[0][0];
      expect(promptArg.messages[0].content).toContain('Remaining: 0 USD');
      expect(promptArg.messages[0].content).toContain('Monthly required: 0.00');
    });

    it('clamps months-remaining to 1 and requires the full remaining balance when the deadline has passed', async () => {
      const goal = baseGoal({
        currentAmount: 100,
        targetAmount: 10000,
        deadline: new Date('2026-01-01T00:00:00.000Z'), // already past "now" (2026-01-15)
      });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.user.findUnique.mockResolvedValueOnce({ aiResponseMode: 'balanced', language: 'en' });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ feasibility: 'unrealistic' }) } }],
      });
      prisma.savingsGoal.update.mockResolvedValueOnce(undefined);
      prisma.savingsGoal.findUnique.mockResolvedValueOnce({ ...goal, aiPlan: { feasibility: 'unrealistic' } });

      await service.generatePlan('acc-1', 'goal-1', 'user-1');

      const promptArg = mockChatCreate.mock.calls[0][0];
      expect(promptArg.messages[0].content).toContain('Months remaining: 1');
      expect(promptArg.messages[0].content).toContain('Monthly required: 9900.00');
    });

    it('computes 3-month averages and category breakdown for a normal in-progress goal, and persists the AI plan', async () => {
      const goal = baseGoal({
        currentAmount: 400,
        targetAmount: 1000,
        deadline: new Date('2026-04-15T00:00:00.000Z'), // exactly 3 months out -> monthsRemaining = 3
      });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.user.findUnique
        .mockResolvedValueOnce({ aiResponseMode: 'expert', language: 'en' }) // responseMode/language lookup
        .mockResolvedValueOnce({ aiModel: 'quality' }); // aiModel lookup
      prisma.expense.findMany.mockResolvedValueOnce([
        { amount: 300, category: { name: 'Food' } },
        { amount: 200, category: { name: 'Food' } },
        { amount: 100, category: null },
      ]);
      prisma.income.findMany.mockResolvedValueOnce([{ amount: 1000 }]);

      const aiPlan = {
        monthlyContribution: 200,
        weeklyContribution: 50,
        checkpoints: [],
        categoryLimits: [],
        estimatedCompletionDate: '2026-04-15',
        feasibility: 'moderate',
        summary: 'Save steadily.',
      };
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(aiPlan) } }] });
      prisma.savingsGoal.update.mockResolvedValueOnce(undefined);
      prisma.savingsGoal.findUnique.mockResolvedValueOnce({ ...goal, aiPlan });

      const result = await service.generatePlan('acc-1', 'goal-1', 'user-1');

      // Model resolved from the user's aiModel preference ('quality' -> gpt-4.1)
      expect(mockChatCreate.mock.calls[0][0].model).toBe('gpt-4.1');

      const promptArg = mockChatCreate.mock.calls[0][0].messages[0].content as string;
      // monthsOfData = ceil(106 days / 30) = 4 -> avgMonthlyExpenses = 600/4 = 150, avgMonthlyIncome = 1000/4 = 250
      expect(promptArg).toContain('Average monthly income: 250.00');
      expect(promptArg).toContain('Average monthly expenses: 150.00');
      expect(promptArg).toContain('Current savings rate: 40.0%');
      expect(promptArg).toContain('"name":"Food"');
      expect(promptArg).toContain('"monthlyAvg":125');
      expect(promptArg).toContain('"name":"Uncategorized"');

      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { aiPlan },
      });
      expect(result.plan).toEqual(aiPlan);
    });

    it('falls back to a computed plan when the AI response is not valid JSON', async () => {
      const goal = baseGoal({
        currentAmount: 400,
        targetAmount: 1000,
        deadline: new Date('2026-04-15T00:00:00.000Z'),
      });
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.user.findUnique.mockResolvedValueOnce({ aiResponseMode: 'balanced', language: 'en' });
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'not json at all' } }] });
      prisma.savingsGoal.update.mockResolvedValueOnce(undefined);
      prisma.savingsGoal.findUnique.mockResolvedValueOnce({ ...goal, aiPlan: {} });

      const result = await service.generatePlan('acc-1', 'goal-1');

      // remaining = 600, monthsRemaining = 3 -> monthlyRequired = 200
      expect(result.plan.monthlyContribution).toBe(200);
      expect(result.plan.weeklyContribution).toBe(50);
      expect(result.plan.feasibility).toBe('moderate');
      expect(result.plan.checkpoints).toEqual([]);
    });

    it('rethrows when the OpenAI call itself fails', async () => {
      const goal = baseGoal();
      prisma.savingsGoal.findFirst.mockResolvedValueOnce(goal);
      prisma.user.findUnique.mockResolvedValueOnce({ aiResponseMode: 'balanced', language: 'en' });
      mockChatCreate.mockRejectedValueOnce(new Error('rate limited'));

      await expect(service.generatePlan('acc-1', 'goal-1', 'user-1')).rejects.toThrow('rate limited');
      expect(prisma.savingsGoal.update).not.toHaveBeenCalled();
    });
  });
});
