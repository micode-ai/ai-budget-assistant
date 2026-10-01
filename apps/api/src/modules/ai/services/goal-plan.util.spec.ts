import { computeFeasibility, computeGoalPlan, mergeGoalPlan } from './goal-plan.util';

const now = new Date('2026-01-15T00:00:00.000Z');
const deadline = new Date('2026-04-15T00:00:00.000Z');

describe('computeFeasibility', () => {
  it.each([
    [0, 1000, 500, 'easy'],
    [100, 1000, 500, 'easy'], // 20% of 500
    [200, 1000, 500, 'moderate'], // 40%
    [400, 1000, 500, 'challenging'], // 80%
    [480, 1000, 500, 'unrealistic'], // 96%
    [100, 1000, 1000, 'unrealistic'], // no savings
    [100, 1000, 1200, 'unrealistic'], // negative savings
    [1100, 1000, 100, 'unrealistic'], // exceeds income
  ])('monthly %d income %d expenses %d -> %s', (m, inc, exp, expected) => {
    expect(computeFeasibility(m, inc, exp)).toBe(expected);
  });
});

describe('computeGoalPlan', () => {
  const base = {
    targetAmount: 1000,
    currentAmount: 400,
    monthsRemaining: 3,
    avgMonthlyIncome: 1000,
    avgMonthlyExpenses: 500,
    now,
    deadline,
  };

  it('computes contributions, checkpoints ending at target, and deadline completion when affordable', () => {
    const plan = computeGoalPlan(base);
    expect(plan.monthlyContribution).toBe(200);
    expect(plan.weeklyContribution).toBe(46.15);
    expect(plan.checkpoints).toHaveLength(3);
    expect(plan.checkpoints.map((c) => c.targetAmount)).toEqual([600, 800, 1000]);
    expect(plan.checkpoints[2].date).toBe('2026-04-15');
    expect(plan.estimatedCompletionDate).toBe('2026-04-15');
    expect(plan.feasibility).toBe('moderate');
  });

  it('projects a completion after the deadline when savings capacity is below the need', () => {
    const plan = computeGoalPlan({ ...base, avgMonthlyExpenses: 900 }); // savings 100, need 200
    expect(plan.estimatedCompletionDate > '2026-04-15').toBe(true);
    expect(plan.feasibility).toBe('unrealistic');
  });

  it('returns an empty plan for an already met goal', () => {
    const plan = computeGoalPlan({ ...base, currentAmount: 1000 });
    expect(plan.monthlyContribution).toBe(0);
    expect(plan.checkpoints).toEqual([]);
    expect(plan.feasibility).toBe('easy');
    expect(plan.estimatedCompletionDate).toBe('2026-01-15');
  });

  it('caps checkpoints at 5', () => {
    expect(computeGoalPlan({ ...base, monthsRemaining: 24 }).checkpoints).toHaveLength(5);
  });
});

describe('mergeGoalPlan', () => {
  const computed = computeGoalPlan({
    targetAmount: 1000,
    currentAmount: 400,
    monthsRemaining: 3,
    avgMonthlyIncome: 1000,
    avgMonthlyExpenses: 500,
    now,
    deadline,
  });
  const cats = [{ name: 'Food', monthlyAvg: 125 }];

  it('derives currentMonthly and savings from data and clamps suggestions', () => {
    const merged = mergeGoalPlan(
      computed,
      cats,
      {
        categoryLimits: [
          { categoryName: 'food', suggestedMonthly: 200 },
          { categoryName: 'Invented', suggestedMonthly: 10 },
        ],
        checkpointLabels: ['One', 'Two'],
        summary: ' Go. ',
      },
      'fallback',
    );
    expect(merged.categoryLimits).toEqual([
      { categoryName: 'Food', currentMonthly: 125, suggestedMonthly: 125, savingsPerMonth: 0 },
    ]);
    expect(merged.checkpoints.map((c) => c.label)).toEqual(['One', 'Two', '100%']);
    expect(merged.summary).toBe('Go.');
  });

  it('clamps negative suggestions to 0 and falls back on missing narrative', () => {
    const merged = mergeGoalPlan(computed, cats, { categoryLimits: [{ categoryName: 'Food', suggestedMonthly: -5 }] }, 'fallback');
    expect(merged.categoryLimits[0]).toMatchObject({ suggestedMonthly: 0, savingsPerMonth: 125 });
    expect(mergeGoalPlan(computed, cats, null, 'fallback').summary).toBe('fallback');
  });
});
