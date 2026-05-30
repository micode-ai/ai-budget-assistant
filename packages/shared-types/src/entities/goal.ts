import type { Currency, GoalStatus } from './primitives';

export interface GoalCheckpoint {
  date: string;
  targetAmount: number;
  label: string;
}

export interface GoalCategoryLimit {
  categoryName: string;
  currentMonthly: number;
  suggestedMonthly: number;
  savingsPerMonth: number;
}

export interface GoalPlan {
  monthlyContribution: number;
  weeklyContribution: number;
  checkpoints: GoalCheckpoint[];
  categoryLimits: GoalCategoryLimit[];
  estimatedCompletionDate: string;
  feasibility: 'easy' | 'moderate' | 'challenging' | 'unrealistic';
  summary: string;
}

export interface SavingsGoal {
  id: string;
  accountId: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currencyCode: Currency;
  deadline: Date;
  status: GoalStatus;
  aiPlan?: GoalPlan;
  createdAt: Date;
  updatedAt: Date;
}
