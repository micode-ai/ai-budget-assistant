import type { AttributionMode } from '@budget/shared-utils';

/**
 * Which of the selected expenses a bulk "Assign to child" may touch.
 *
 * Whole-expense and line attribution are mutually exclusive per expense, and a
 * single expense asks before replacing its per-line attribution. A bulk action
 * cannot ask per row, so it never replaces lines: an expense whose receipt
 * lines are attributed is skipped and counted, and the user is told how many.
 * An expense already attributed as a whole is re-assigned (last action wins).
 *
 * Pure: selection order is kept, a repeated id is planned once.
 */
export function planBulkAssign(
  expenseIds: string[],
  modeOf: (id: string) => AttributionMode,
): { assign: string[]; skipped: number } {
  const seen = new Set<string>();
  const assign: string[] = [];
  let skipped = 0;
  for (const id of expenseIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (modeOf(id) === 'lines') skipped += 1;
    else assign.push(id);
  }
  return { assign, skipped };
}
