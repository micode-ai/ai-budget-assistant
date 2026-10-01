jest.mock('react-native-mmkv', () => {
  const data = new Map<string, string>();
  return {
    MMKV: class {
      getString(k: string) { return data.get(k); }
      set(k: string, v: string) { data.set(k, v); }
      delete(k: string) { data.delete(k); }
    },
  };
});

import { useScenarioStore } from '../scenarioStore';

const snap = { expenseAdj: { c1: -10 }, incomeAdj: {}, extraIncomes: [], horizon: 6 as const };

describe('scenarioStore scoping', () => {
  beforeEach(() => useScenarioStore.getState().reset());

  it('refuses to save without a scope', () => {
    expect(useScenarioStore.getState().saveScenario('x', snap, true)).toBe('no_scope');
    expect(useScenarioStore.getState().canSave(true)).toBe(false);
  });

  it('keeps scenarios per user and per account', () => {
    useScenarioStore.getState().setScope('u1', 'a1');
    expect(useScenarioStore.getState().saveScenario('mine', snap, false)).toBe('ok');
    useScenarioStore.getState().setScope('u2', 'a1');
    expect(useScenarioStore.getState().scenarios).toEqual([]);
    useScenarioStore.getState().setScope('u1', 'a2');
    expect(useScenarioStore.getState().scenarios).toEqual([]);
    useScenarioStore.getState().setScope('u1', 'a1');
    expect(useScenarioStore.getState().scenarios.map(x => x.name)).toEqual(['mine']);
  });

  it('hides scenarios on reset (sign-out) and does not leak to the next user', () => {
    useScenarioStore.getState().setScope('u1', 'a1');
    useScenarioStore.getState().saveScenario('mine', snap, false);
    useScenarioStore.getState().reset();
    expect(useScenarioStore.getState().scenarios).toEqual([]);
    useScenarioStore.getState().setScope('u2', 'a1');
    expect(useScenarioStore.getState().scenarios).toEqual([]);
  });

  it('enforces the free limit within a scope only', () => {
    useScenarioStore.getState().setScope('u1', 'a1');
    for (let i = 0; i < 5; i++) useScenarioStore.getState().saveScenario(`s${i}`, snap, false);
    expect(useScenarioStore.getState().saveScenario('6th', snap, false)).toBe('limit_reached');
    useScenarioStore.getState().setScope('u1', 'a2');
    expect(useScenarioStore.getState().canSave(false)).toBe(true);
  });
  it('hands pre-scoping scenarios to the first scope opened, then drops the unscoped key', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MMKV } = require('react-native-mmkv');
    const store = new MMKV();
    store.set('saved_scenarios', JSON.stringify([{ id: 'old', name: 'legacy', ...snap, createdAt: '2026-01-01T00:00:00Z' }]));
    useScenarioStore.getState().setScope('u9', 'a9');
    expect(useScenarioStore.getState().scenarios.map((x) => x.name)).toEqual(['legacy']);
    expect(store.getString('saved_scenarios')).toBeUndefined();
    useScenarioStore.getState().setScope('u8', 'a9');
    expect(useScenarioStore.getState().scenarios).toEqual([]);
  });
});
