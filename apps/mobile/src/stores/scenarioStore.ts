import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { ExtraIncome } from '@/features/scenario/useScenarioProjection';
import { generateUUID } from '@budget/shared-utils';

const FREE_LIMIT = 5;
// Pre-scoping key: its rows carry no owner. setScope hands them to the first
// scope opened on the device (into an empty scoped key only), then deletes it.
const LEGACY_STORAGE_KEY = 'saved_scenarios';
const STORAGE_PREFIX = 'saved_scenarios:';

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
  /** `userId:accountId` the visible list belongs to; null = signed out / not yet set. */
  scopeKey: string | null;
  /** Point the store at one user + account (call from a screen effect). */
  setScope: (userId: string | null | undefined, accountId: string | null | undefined) => void;
  /** Sign-out: drop the in-memory list. Persisted rows stay under their own scoped key. */
  reset: () => void;
  saveScenario: (name: string, snapshot: ScenarioSnapshot, isPro: boolean) => 'ok' | 'limit_reached' | 'no_scope';
  deleteScenario: (id: string) => void;
  canSave: (isPro: boolean) => boolean;
}

export function scenarioScopeKey(
  userId: string | null | undefined,
  accountId: string | null | undefined,
): string | null {
  if (!userId || !accountId) return null;
  return `${userId}:${accountId}`;
}

function loadScenarios(scopeKey: string): SavedScenario[] {
  const raw = mmkv.getString(STORAGE_PREFIX + scopeKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedScenario[];
    return parsed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function persistScenarios(scopeKey: string, scenarios: SavedScenario[]): void {
  mmkv.set(STORAGE_PREFIX + scopeKey, JSON.stringify(scenarios));
}

export const useScenarioStore = create<ScenarioStoreState>()((set, get) => ({
  scenarios: [],
  scopeKey: null,

  setScope: (userId, accountId) => {
    const key = scenarioScopeKey(userId, accountId);
    if (key === get().scopeKey) return;
    // Scenarios saved before scoping existed carry no owner. Hand them to the
    // first scope opened on this device (almost always the person who saved
    // them) instead of deleting a user's work; then drop the unscoped key.
    const legacy = key ? mmkv.getString(LEGACY_STORAGE_KEY) : undefined;
    if (key && legacy && !mmkv.getString(STORAGE_PREFIX + key)) {
      mmkv.set(STORAGE_PREFIX + key, legacy);
    }
    if (key && legacy) mmkv.delete(LEGACY_STORAGE_KEY);
    set({ scopeKey: key, scenarios: key ? loadScenarios(key) : [] });
  },

  reset: () => set({ scopeKey: null, scenarios: [] }),

  canSave: (isPro: boolean) => {
    if (!get().scopeKey) return false;
    if (isPro) return true;
    return get().scenarios.length < FREE_LIMIT;
  },

  saveScenario: (name, snapshot, isPro) => {
    const { scenarios, scopeKey } = get();
    if (!scopeKey) return 'no_scope';
    if (!isPro && scenarios.length >= FREE_LIMIT) return 'limit_reached';

    const newScenario: SavedScenario = {
      id: generateUUID(),
      name: name.trim() || 'Scenario',
      ...snapshot,
      createdAt: new Date().toISOString(),
    };

    const updated = [newScenario, ...scenarios];
    persistScenarios(scopeKey, updated);
    set({ scenarios: updated });
    return 'ok';
  },

  deleteScenario: (id) => {
    const { scenarios, scopeKey } = get();
    if (!scopeKey) return;
    const updated = scenarios.filter(s => s.id !== id);
    persistScenarios(scopeKey, updated);
    set({ scenarios: updated });
  },
}));
