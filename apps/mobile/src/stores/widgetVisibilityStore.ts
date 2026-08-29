import { createOrderedVisibilityStore } from './orderedVisibilityStore';

export const WIDGET_KEYS = [
  'familyFeed',
  'safeToSpend',
  'inflationShield',
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

const { useStore, resolveVisibility, resolveOrder } = createOrderedVisibilityStore(WIDGET_KEYS, {
  mmkvId: 'widget-visibility',
  orderStorageKey: 'widget-order',
  // A new widget is inserted at its intended position (by WIDGET_KEYS order)
  // so a new high-priority widget (e.g. familyFeed at index 0) appears at
  // the top for existing users, not appended to the end. This differs from
  // quickActionStore, which appends — see orderedVisibilityStore.ts.
  insertMissingByPosition: true,
});

export { resolveVisibility, resolveOrder };
export const useWidgetVisibilityStore = useStore;
