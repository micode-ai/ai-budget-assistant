import { Platform } from 'react-native';
import { resolveAttributionMode, type AttributionMode, type AttribItem } from '@budget/shared-utils';
import type { Expense, ExpenseItem } from '@budget/shared-types';
import { getAttributedItems } from '@/db/expenseItemRepository';

const toAttribItems = (expenseId: string, items: ExpenseItem[]): AttribItem[] =>
  items
    .filter((i) => !i.isDeleted)
    .map((i) => ({ expenseId, totalPrice: i.totalPrice, childId: i.childId ?? null, categoryId: null }));

/** One expense's mode from its links and its (loaded) receipt lines. */
export function attributionModeOf(expense: Expense, items: ExpenseItem[]): AttributionMode {
  return resolveAttributionMode(expense.expenseChildren ?? [], toAttribItems(expense.id, items));
}

/**
 * The attribution mode of many expenses at once, for a bulk action.
 *
 * Native reads the attributed lines from SQLite in one query (the in-memory
 * list carries no line rows). Web has no SQLite: the list pull marks each
 * expense with `hasLineChildren`, so no per-row request is made — a bulk
 * action over hundreds of rows would otherwise trip the API proxy's rate limit.
 */
export async function loadAttributionModes(
  expenses: Expense[],
  accountId: string,
): Promise<Map<string, AttributionMode>> {
  let lineExpenseIds: Set<string>;
  if (Platform.OS === 'web') {
    lineExpenseIds = new Set(expenses.filter((e) => e.hasLineChildren).map((e) => e.id));
  } else {
    const attributed = await getAttributedItems(accountId);
    lineExpenseIds = new Set(attributed.map((i) => i.expenseId));
  }
  const modes = new Map<string, AttributionMode>();
  for (const e of expenses) {
    if (lineExpenseIds.has(e.id)) modes.set(e.id, 'lines');
    else modes.set(e.id, (e.expenseChildren?.length ?? 0) > 0 ? 'whole' : 'none');
  }
  return modes;
}
