import type { Currency, GoalStatus, SavingsGoal, GoalPlan } from '../entities';

export interface CreateGoalDto {
  name: string;
  targetAmount: number;
  currencyCode: Currency;
  deadline: string;
}

export interface UpdateGoalDto {
  name?: string;
  targetAmount?: number;
  deadline?: string;
  currentAmount?: number;
  status?: GoalStatus;
}

export interface GoalPlanResponse {
  goal: SavingsGoal;
  plan: GoalPlan;
}

export interface GoalProgressResponse {
  goal: SavingsGoal;
  percentComplete: number;
  onTrack: boolean;
  projectedCompletionDate: string;
  monthlyNeeded: number;
  behindByAmount: number;
}
