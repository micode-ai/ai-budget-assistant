import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const WIDGET_KEYS = [
  'gamification',
  'monthlyBudget',
  'incomeExpenses',
  'debts',
  'netProfit',
  'netCapital',
  'fatFinder',
  'calendar',
  'goals',
  'wallets',
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

const mmkv = new MMKV({ id: 'widget-visibility' });

const loadVisibility = (): Record<WidgetKey, boolean> => {
  const result = {} as Record<WidgetKey, boolean>;
  for (const key of WIDGET_KEYS) {
    const val = mmkv.getString(key);
    result[key] = val === undefined ? true : val === 'true';
  }
  return result;
};

interface WidgetVisibilityState {
  visibility: Record<WidgetKey, boolean>;
  toggle: (key: WidgetKey) => void;
  setVisible: (key: WidgetKey, visible: boolean) => void;
}

export const useWidgetVisibilityStore = create<WidgetVisibilityState>((set) => ({
  visibility: loadVisibility(),
  toggle: (key) =>
    set((s) => {
      const next = !s.visibility[key];
      mmkv.set(key, String(next));
      return { visibility: { ...s.visibility, [key]: next } };
    }),
  setVisible: (key, visible) =>
    set((s) => {
      mmkv.set(key, String(visible));
      return { visibility: { ...s.visibility, [key]: visible } };
    }),
}));
