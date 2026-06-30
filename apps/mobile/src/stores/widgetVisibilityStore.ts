import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

export const WIDGET_KEYS = [
  'familyFeed',
  'safeToSpend',
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
    // De-dupe: a duplicate key here renders the same widget twice (two React
    // elements with the same key → doubled card + broken modal state). Set
    // preserves first-occurrence order.
    const valid = [
      ...new Set(
        parsed.filter((k): k is WidgetKey => (WIDGET_KEYS as readonly string[]).includes(k)),
      ),
    ];
    const missing = WIDGET_KEYS.filter((k) => !valid.includes(k));
    if (missing.length === 0) return valid;
    // Insert each missing key at its intended position (by WIDGET_KEYS order)
    // so new high-priority widgets (e.g. familyFeed at index 0) appear at
    // the top for existing users, not appended to the end.
    const result = [...valid];
    for (const key of missing) {
      const targetIdx = WIDGET_KEYS.indexOf(key as WidgetKey);
      const insertAt = result.findIndex(
        (k) => WIDGET_KEYS.indexOf(k as WidgetKey) > targetIdx,
      );
      if (insertAt === -1) result.push(key);
      else result.splice(insertAt, 0, key);
    }
    return result;
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
      // De-dupe so a duplicate can never be persisted (see loadOrder).
      const valid = [
        ...new Set(
          newOrder.filter((k): k is WidgetKey => (WIDGET_KEYS as readonly string[]).includes(k)),
        ),
      ];
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
