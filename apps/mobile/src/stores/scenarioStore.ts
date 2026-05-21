import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { ExtraIncome } from '@/features/scenario/useScenarioProjection';
import { generateUUID } from '@budget/shared-utils';

const FREE_LIMIT = 5;
const STORAGE_KEY = 'saved_scenarios';

const mmkv = new MMKV({ id: 'scenario-storage' });

export interface SavedScenario {
  id: string;
  name: string;
  expenseAdj: Record<string, number>;
  incomeAdj: Record<string, number>;
  extraIncomes: ExtraIncome[];
  horizon: 3 | 6 | 12;
  createdAt: string;
}

export interface ScenarioSnapshot {
  expenseAdj: Record<string, number>;
  incomeAdj: Record<string, number>;
  extraIncomes: ExtraIncome[];
  horizon: 3 | 6 | 12;
}

interface ScenarioStoreState {
  scenarios: SavedScenario[];
  saveScenario: (name: string, snapshot: ScenarioSnapshot, isPro: boolean) => 'ok' | 'limit_reached';
  deleteScenario: (id: string) => void;
  canSave: (isPro: boolean) => boolean;
}

function loadScenarios(): SavedScenario[] {
  const raw = mmkv.getString(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedScenario[];
    return parsed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function persistScenarios(scenarios: SavedScenario[]): void {
  mmkv.set(STORAGE_KEY, JSON.stringify(scenarios));
}

export const useScenarioStore = create<ScenarioStoreState>()((set, get) => ({
  scenarios: loadScenarios(),

  canSave: (isPro: boolean) => {
    if (isPro) return true;
    return get().scenarios.length < FREE_LIMIT;
  },

  saveScenario: (name, snapshot, isPro) => {
    const { scenarios } = get();
    if (!isPro && scenarios.length >= FREE_LIMIT) return 'limit_reached';

    const newScenario: SavedScenario = {
      id: generateUUID(),
      name: name.trim() || 'Scenario',
      ...snapshot,
      createdAt: new Date().toISOString(),
    };

    const updated = [newScenario, ...scenarios];
    persistScenarios(updated);
    set({ scenarios: updated });
    return 'ok';
  },

  deleteScenario: (id) => {
    const updated = get().scenarios.filter(s => s.id !== id);
    persistScenarios(updated);
    set({ scenarios: updated });
  },
}));
