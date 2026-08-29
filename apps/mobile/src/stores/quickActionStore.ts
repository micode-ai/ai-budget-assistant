import { createOrderedVisibilityStore } from './orderedVisibilityStore';

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
  'shopping_hub',
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
  shopping_hub: true,
};

const { useStore, resolveVisibility, resolveOrder } = createOrderedVisibilityStore(QUICK_ACTION_KEYS, {
  mmkvId: 'quick-actions',
  orderStorageKey: 'quick-action-order',
  visibilityKeyPrefix: 'vis:',
  defaultVisibility: DEFAULT_VISIBILITY,
  // Missing keys are appended, not inserted by position — see
  // orderedVisibilityStore.ts's doc comment for why this differs from
  // widgetVisibilityStore.
  insertMissingByPosition: false,
});

export { resolveVisibility, resolveOrder };
export const useQuickActionStore = useStore;
