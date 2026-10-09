import type { GroupActivityItem, GroupExpense } from '@budget/shared-types';

/**
 * Pure table logic for the desktop group-detail activity table (ABA-646). Apart from the
 * component because nothing in this repo renders a component in CI, so this is the only place a
 * mistake in "which day does this row sit under" or "what is my share" can be caught.
 */

export interface ActivityTableRow {
  /** `e-<id>` / `s-<id>` / `v-<id>`: the row identity (and the keyboard cursor's), unique across kinds. */
  id: string;
  item: GroupActivityItem;
  /** My share of an expense; null for a settlement, a membership event or an expense I am not part of. */
  myShare: number | null;
}

export interface ActivityDay {
  /** Local calendar day, `YYYY-MM-DD`. A key, not a display string. */
  dayKey: string;
  rows: ActivityTableRow[];
  /** Live (non-deleted) expenses only. A settlement moves money between members; it is not spend. */
  subtotal: number;
}

export function activityItemId(item: GroupActivityItem): string {
  if (item.kind === 'expense') return `e-${item.expense.id}`;
  if (item.kind === 'settlement') return `s-${item.settlement.id}`;
  return `v-${item.event.id}`;
}

function localDay(iso: string): string {
  // The LOCAL calendar day of an instant, never `toISOString().slice(0, 10)`, which goes through
  // UTC and shifts the day for any non-zero offset (the bug `utils/dateInput.ts` exists to avoid).
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** An expense sits under its own date; a settlement or a membership event under its local day. */
export function activityDayKey(item: GroupActivityItem): string {
  if (item.kind === 'expense') return item.expense.date;
  if (item.kind === 'settlement') return localDay(item.settlement.createdAt);
  return localDay(item.event.createdAt);
}

export function myShareOf(expense: Pick<GroupExpense, 'shares'>, myMemberId: string): number | null {
  return expense.shares.find((s) => s.memberId === myMemberId)?.shareAmount ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Days newest first (an expense is dated by its own `date`, which can be older than when it was
 * entered, so the feed order alone is not day order); rows within a day keep the feed's order.
 * `order` is the flat rendered id order, which is what `↑`/`↓` must walk. Membership events
 * (ABA-650) are rendered but left OUT of `order`: they are system rows, never a keyboard target, so
 * the cursor skips them and `Enter` can never land on one.
 */
export function groupActivityByDay(
  items: GroupActivityItem[],
  myMemberId: string,
): { days: ActivityDay[]; order: string[] } {
  const byDay = new Map<string, ActivityDay>();
  for (const item of items) {
    const dayKey = activityDayKey(item);
    let day = byDay.get(dayKey);
    if (!day) {
      day = { dayKey, rows: [], subtotal: 0 };
      byDay.set(dayKey, day);
    }
    day.rows.push({
      id: activityItemId(item),
      item,
      myShare: item.kind === 'expense' ? myShareOf(item.expense, myMemberId) : null,
    });
    if (item.kind === 'expense' && item.expense.deletedAt === null) day.subtotal += item.expense.amount;
  }
  const days = [...byDay.values()]
    .sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0))
    .map((d) => ({ ...d, subtotal: round2(d.subtotal) }));
  return {
    days,
    order: days.flatMap((d) => d.rows.filter((r) => r.item.kind !== 'event').map((r) => r.id)),
  };
}
