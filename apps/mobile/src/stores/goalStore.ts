import { create } from 'zustand';
import { api } from '@/services/api';
import type { SavingsGoal, GoalPlan } from '@budget/shared-types';

interface GoalProgressData {
  goal: SavingsGoal;
  percentComplete: number;
  onTrack: boolean;
  projectedCompletionDate: string;
  monthlyNeeded: number;
  behindByAmount: number;
}

interface GoalState {
  goals: SavingsGoal[];
  isLoading: boolean;
  error: string | null;

  loadGoals: () => Promise<void>;
  createGoal: (dto: { name: string; targetAmount: number; currencyCode: string; deadline: string }) => Promise<{ goal: SavingsGoal; plan: GoalPlan }>;
  updateGoal: (id: string, dto: { name?: string; targetAmount?: number; deadline?: string; currentAmount?: number; status?: string }) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  getProgress: (id: string) => Promise<GoalProgressData>;
  regeneratePlan: (id: string) => Promise<{ goal: SavingsGoal; plan: GoalPlan }>;
  reset: () => void;
}

export const useGoalStore = create<GoalState>()((set) => ({
  goals: [],
  isLoading: false,
  error: null,

  loadGoals: async () => {
    set({ isLoading: true, error: null });
    try {
      const goals = await api.getGoals();
      set({ goals, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load goals',
      });
    }
  },

  createGoal: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.createGoal(dto);
      set((state) => ({
        goals: [result.goal, ...state.goals],
        isLoading: false,
      }));
      return result;
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to create goal',
      });
      throw err;
    }
  },

  updateGoal: async (id, dto) => {
    try {
      const updated = await api.updateGoal(id, dto);
      set((state) => ({
        goals: state.goals.map((g) => (g.id === id ? updated : g)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update goal' });
      throw err;
    }
  },

  deleteGoal: async (id) => {
    try {
      await api.deleteGoal(id);
      set((state) => ({
        goals: state.goals.filter((g) => g.id !== id),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete goal' });
      throw err;
    }
  },

  getProgress: async (id) => {
    return api.getGoalProgress(id);
  },

  regeneratePlan: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.regenerateGoalPlan(id);
      set((state) => ({
        goals: state.goals.map((g) => (g.id === id ? result.goal : g)),
        isLoading: false,
      }));
      return result;
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to regenerate plan',
      });
      throw err;
    }
  },

  reset: () => {
    set({ goals: [], isLoading: false, error: null });
  },
}));
