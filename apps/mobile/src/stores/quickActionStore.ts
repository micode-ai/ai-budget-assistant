import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

export const QUICK_ACTION_KEYS = [
  'add_expense',
  'scan_receipt',
  'voice_expense',
  'voice_income',
  'scan_invoice',
  'exchange',
  'converter',
  'transfers',
  'subscriptions',
] as const;

export type QuickActionKey = (typeof QUICK_ACTION_KEYS)[number];

// Per-key default visibility. Income-capture actions ship hidden.
export const DEFAULT_VISIBILITY: Record<QuickActionKey, boolean> = {
  add_expense: true,
  scan_receipt: true,
  voice_expense: true,
  voice_income: false,
  scan_invoice: false,
  exchange: true,
  converter: true,
  transfers: true,
  subscriptions: true,
};

const mmkv = new MMKV({ id: 'quick-actions' });

// Pure: resolve visibility from a raw string getter (MMKV or a test fake).
export const resolveVisibility = (
  read: (key: string) => string | undefined,
): Record<QuickActionKey, boolean> => {
  const result = {} as Record<QuickActionKey, boolean>;
  for (const key of QUICK_ACTION_KEYS) {
    const val = read(key);
    result[key] = val === undefined ? DEFAULT_VISIBILITY[key] : val === 'true';
  }
  return result;
};

// Pure: resolve order from the raw stored JSON string (or undefined).
export const resolveOrder = (raw: string | undefined): QuickActionKey[] => {
  if (!raw) return [...QUICK_ACTION_KEYS];
  try {
    const parsed = JSON.parse(raw) as string[];
    // De-dupe so a duplicate key can't render the same action twice.
    const valid = [
      ...new Set(
        parsed.filter((k): k is QuickActionKey => (QUICK_ACTION_KEYS as readonly string[]).includes(k)),
      ),
    ];
    const missing = QUICK_ACTION_KEYS.filter((k) => !valid.includes(k));
    return [...valid, ...missing];
  } catch {
    return [...QUICK_ACTION_KEYS];
  }
};

interface QuickActionState {
  visibility: Record<QuickActionKey, boolean>;
  order: QuickActionKey[];
  toggle: (key: QuickActionKey) => void;
  setVisible: (key: QuickActionKey, visible: boolean) => void;
  reorder: (newOrder: QuickActionKey[]) => void;
  resetOrder: () => void;
}

export const useQuickActionStore = create<QuickActionState>((set) => ({
  visibility: resolveVisibility((k) => mmkv.getString(`vis:${k}`)),
  order: resolveOrder(mmkv.getString('quick-action-order')),

  toggle: (key) =>
    set((s) => {
      const next = !s.visibility[key];
      mmkv.set(`vis:${key}`, String(next));
      return { visibility: { ...s.visibility, [key]: next } };
    }),

  setVisible: (key, visible) =>
    set((s) => {
      mmkv.set(`vis:${key}`, String(visible));
      return { visibility: { ...s.visibility, [key]: visible } };
    }),

  reorder: (newOrder) =>
    set(() => {
      // De-dupe so a duplicate can never be persisted (see resolveOrder).
      const valid = [
        ...new Set(
          newOrder.filter((k): k is QuickActionKey => (QUICK_ACTION_KEYS as readonly string[]).includes(k)),
        ),
      ];
      const missing = QUICK_ACTION_KEYS.filter((k) => !valid.includes(k));
      const finalOrder = [...valid, ...missing];
      mmkv.set('quick-action-order', JSON.stringify(finalOrder));
      return { order: finalOrder };
    }),

  resetOrder: () =>
    set(() => {
      const defaultOrder = [...QUICK_ACTION_KEYS];
      mmkv.set('quick-action-order', JSON.stringify(defaultOrder));
      return { order: defaultOrder };
    }),
}));
