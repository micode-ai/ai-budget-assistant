import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

export const WIDGET_KEYS = [
  'financialHealth',
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

const loadOrder = (): WidgetKey[] => {
  const stored = mmkv.getString('widget-order');
  if (!stored) return [...WIDGET_KEYS];
  try {
    const parsed = JSON.parse(stored) as string[];
    const valid = parsed.filter((k): k is WidgetKey =>
      (WIDGET_KEYS as readonly string[]).includes(k),
    );
    const missing = WIDGET_KEYS.filter((k) => !valid.includes(k));
    return [...valid, ...missing];
  } catch {
    return [...WIDGET_KEYS];
  }
};

interface WidgetVisibilityState {
  visibility: Record<WidgetKey, boolean>;
  order: WidgetKey[];
  toggle: (key: WidgetKey) => void;
  setVisible: (key: WidgetKey, visible: boolean) => void;
  reorder: (newOrder: WidgetKey[]) => void;
  resetOrder: () => void;
}

export const useWidgetVisibilityStore = create<WidgetVisibilityState>((set) => ({
  visibility: loadVisibility(),
  order: loadOrder(),

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

  reorder: (newOrder) =>
    set(() => {
      const valid = newOrder.filter((k): k is WidgetKey =>
        (WIDGET_KEYS as readonly string[]).includes(k),
      );
      const missing = WIDGET_KEYS.filter((k) => !valid.includes(k));
      const finalOrder = [...valid, ...missing];
      mmkv.set('widget-order', JSON.stringify(finalOrder));
      return { order: finalOrder };
    }),

  resetOrder: () =>
    set(() => {
      const defaultOrder = [...WIDGET_KEYS];
      mmkv.set('widget-order', JSON.stringify(defaultOrder));
      return { order: defaultOrder };
    }),
}));
