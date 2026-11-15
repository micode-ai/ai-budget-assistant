/**
 * Cash flow and commitments for the Analytics tab — pure, store-free.
 *
 * - Cash flow: earned, spent, kept ("saved" = earned − spent) and the savings
 *   rate, for the selected period and month by month.
 * - Commitments: how much of the spending was FIXED — money that leaves every
 *   period whatever the user decides — against the flexible rest.
 *
 * "Spent" uses exactly the expenses the Total spent card uses (the caller
 * passes the same filtered list), so the two figures can never disagree.
 *
 * Fixed is deliberately conservative — only what the app KNOWS repeats or
 * what the user SAID is fixed:
 *   0. an expense a subscription renewal booked (`userSubscriptionId`, ABA-776 —
 *      counted even if the subscription was since cancelled: it was paid), or
 *   1. an expense in a recurring series (`recurringId`), or
 *   2. an expense matching an ACTIVE tracked subscription: same name as the
 *      subscription (description or merchant, case-insensitive), or same
 *      category, same currency and an amount within 1% of it — for renewals
 *      booked before ABA-776, which carry no link, or
 *   3. an expense in a category the account marked as fixed (ABA-777) — with
 *      splits, only the split parts in such a category.
 * Nothing else is inferred: saying "fixed" about something the app only guessed
 * would be worse than under-counting. A hand-entered rent becomes fixed the
 * moment its category is marked so.
 */
import { financialMonth, shiftFinancialMonth } from '@budget/shared-utils';
import type { DateWindow } from './periodWindows';
import { inWindow } from './periodWindows';
import { transactionDay } from './localDayKey';

export interface CashFlowExpense {
  amount: number;
  currencyCode: string;
  date: Date | string;
  description?: string | null;
  merchant?: string | null;
  categoryId?: string | null;
  recurringId?: string | null;
  /** Set by the server when a subscription renewal booked this row (ABA-776). */
  userSubscriptionId?: string | null;
  /** Category splits of a receipt; when present they decide, as everywhere else. */
  splits?: { categoryId?: string | null; amount: number; isDeleted?: boolean }[];
}

/** The account's fixed-cost categories (ABA-777) and how to name one. */
export interface FixedCategories {
  ids: ReadonlySet<string>;
  nameOf: (categoryId: string) => string;
}

export interface CashFlowIncome {
  amount: number;
  currencyCode: string;
  date: Date | string;
}

export interface CommitmentSubscription {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  categoryId: string | null;
  isActive: boolean;
}

type Convert = (amount: number, currencyCode: string) => number;

export interface CashFlowSummary {
  earned: number;
  spent: number;
  /** earned − spent; negative when the period spent more than it earned. */
  saved: number;
  /** saved / earned as a percentage, or null when nothing was earned. */
  savingsRate: number | null;
}

export function summarizeCashFlow(
  expenses: CashFlowExpense[],
  incomes: CashFlowIncome[],
  convert: Convert,
): CashFlowSummary {
  const earned = incomes.reduce((s, i) => s + convert(i.amount, i.currencyCode), 0);
  const spent = expenses.reduce((s, e) => s + convert(e.amount, e.currencyCode), 0);
  const saved = earned - spent;
  return { earned, spent, saved, savingsRate: earned > 0 ? (saved / earned) * 100 : null };
}

export interface MonthlyCashFlow {
  /** First day of the month. */
  start: Date;
  earned: number;
  spent: number;
}

/** One entry per window, in the order given (callers pass oldest first). */
export function monthlyCashFlow(
  expenses: CashFlowExpense[],
  incomes: CashFlowIncome[],
  windows: DateWindow[],
  convert: Convert,
): MonthlyCashFlow[] {
  return windows.map((w) => ({
    start: w.start,
    earned: incomes
      .filter((i) => inWindow(transactionDay(i.date), w))
      .reduce((s, i) => s + convert(i.amount, i.currencyCode), 0),
    spent: expenses
      .filter((e) => inWindow(transactionDay(e.date), w))
      .reduce((s, e) => s + convert(e.amount, e.currencyCode), 0),
  }));
}

/**
 * The `count` (financial) months ending with the one containing `end`, oldest
 * first. `anchorDay` null = calendar months.
 */
export function monthWindowsEndingAt(end: Date, count: number, anchorDay: number | null = null): DateWindow[] {
  const startOf = (delta: number) => financialMonth(shiftFinancialMonth(end, delta, anchorDay), anchorDay).start;
  return Array.from({ length: count }, (_, idx) => {
    const back = count - 1 - idx;
    return { start: startOf(-back), end: startOf(-back + 1) };
  });
}

export interface CommitmentItem {
  key: string;
  label: string;
  kind: 'recurring' | 'subscription' | 'category';
  amount: number;
}

export interface CommitmentsSummary {
  fixed: number;
  flexible: number;
  /** fixed / (fixed + flexible) as a percentage; 0 when nothing was spent. */
  fixedShare: number;
  /** Largest fixed costs first. */
  items: CommitmentItem[];
}

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/** The subscription an expense pays for, or null. Exported for tests. */
export function matchSubscription(
  expense: CashFlowExpense,
  subscriptions: CommitmentSubscription[],
): CommitmentSubscription | null {
  const names = [norm(expense.description), norm(expense.merchant)].filter(Boolean);
  for (const sub of subscriptions) {
    if (!sub.isActive) continue;
    if (names.includes(norm(sub.name))) return sub;
  }
  for (const sub of subscriptions) {
    if (!sub.isActive || !sub.categoryId || sub.categoryId !== expense.categoryId) continue;
    if (sub.currencyCode !== expense.currencyCode || sub.amount <= 0) continue;
    if (Math.abs(expense.amount - sub.amount) <= sub.amount * 0.01) return sub;
  }
  return null;
}

export function classifyCommitments(
  expenses: CashFlowExpense[],
  subscriptions: CommitmentSubscription[],
  convert: Convert,
  fixedCategories?: FixedCategories,
): CommitmentsSummary {
  let fixed = 0;
  let flexible = 0;
  const items = new Map<string, CommitmentItem>();
  const addItem = (item: Omit<CommitmentItem, 'amount'>, amount: number) => {
    const existing = items.get(item.key);
    items.set(item.key, { ...item, label: existing?.label || item.label, amount: (existing?.amount ?? 0) + amount });
  };

  for (const e of expenses) {
    const amount = convert(e.amount, e.currencyCode);
    let item: Omit<CommitmentItem, 'amount'> | null = null;
    if (e.userSubscriptionId) {
      // Booked by a renewal and linked to it: no guessing needed (ABA-776).
      const sub = subscriptions.find((s) => s.id === e.userSubscriptionId);
      item = {
        key: `s:${e.userSubscriptionId}`,
        label: sub?.name || e.description?.trim() || '',
        kind: 'subscription',
      };
    } else if (e.recurringId) {
      item = { key: `r:${e.recurringId}`, label: e.description?.trim() || e.merchant?.trim() || '', kind: 'recurring' };
    } else {
      const sub = matchSubscription(e, subscriptions);
      if (sub) item = { key: `s:${sub.id}`, label: sub.name, kind: 'subscription' };
    }
    if (item) {
      fixed += amount;
      addItem(item, amount);
      continue;
    }

    // 3. A category the account marked as fixed (ABA-777). With splits, only
    //    the split parts in such a category are fixed — the same rule every
    //    other category total follows.
    if (fixedCategories && fixedCategories.ids.size > 0) {
      const liveSplits = (e.splits ?? []).filter((s) => !s.isDeleted);
      const parts = liveSplits.length > 0 ? liveSplits : [{ categoryId: e.categoryId, amount: e.amount }];
      let fixedPart = 0;
      for (const part of parts) {
        if (!part.categoryId || !fixedCategories.ids.has(part.categoryId)) continue;
        const partAmount = convert(part.amount, e.currencyCode);
        fixedPart += partAmount;
        addItem(
          { key: `c:${part.categoryId}`, label: fixedCategories.nameOf(part.categoryId), kind: 'category' },
          partAmount,
        );
      }
      fixed += fixedPart;
      flexible += amount - fixedPart;
      continue;
    }
    flexible += amount;
  }

  const total = fixed + flexible;
  return {
    fixed,
    flexible,
    fixedShare: total > 0 ? (fixed / total) * 100 : 0,
    items: [...items.values()].sort((a, b) => b.amount - a.amount),
  };
}
