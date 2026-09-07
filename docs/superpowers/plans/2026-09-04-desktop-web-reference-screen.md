# Desktop Web Reference Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the transactions list into a screen that reads as a desktop application rather than a stretched phone, and establish the design language the remaining screens will follow.

**Architecture:** The route file stays single and renders a platform-split component. `ExpensesView.tsx` (native) renders today's mobile JSX; `ExpensesView.web.tsx` renders that same mobile JSX below 1024px and a new desktop composition at or above it. The desktop composition is a facet rail, a summary strip, a day-grouped table, and a dialog that **hosts the existing `ExpenseDetailsCard`** rather than reimplementing detail or edit behaviour. All state and derived data comes from one shared hook extracted from the current 1009-line screen, so the desktop layer duplicates layout and never behaviour.

**Tech Stack:** Expo 54 / React Native 0.81 with `react-native-web`, Metro platform extensions, Zustand, the app's own theme tokens. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-04-desktop-web-reference-screen-design.md`

## Global Constraints

- **The mobile rendering must not change.** Not "should not" — if the mobile view changes, the task is wrong. `ExpensesMobile.tsx` is today's JSX moved verbatim and is imported by both platform files, so there is exactly one definition of it. The whole mobile suite must stay green at every task boundary. **Do not trust a test count written in this plan** — every predicted count in it has been wrong at least once. Run `npx jest` from `apps/mobile` before your change, record what it reports, and report the delta your change caused. As of Task 1b the observed figure is **872 tests in 102 suites**, but read it yourself rather than asserting it.
- **Do NOT reuse `src/features/analytics/useFilteredTransactions.ts`.** It exists, and consolidating it with this screen's filtering looks like the right refactor. It is not: it is the *analytics* hook (analytics period + display currency), consumed by 13 analytics hooks, and its filter shape is different from this screen's `ExpenseFilters` (category, merchants, search, period). Wiring it in here would change what the mobile screen shows.
- **No route-level platform file.** Checked in the spec: five `.web.tsx` files exist under `src/components/`, and no route file under `app/` has one. The split is component-level and `app/(tabs)/expenses.tsx` stays a single file.
- **Every colour comes from the theme.** The user picks one of 13 accents and `deriveAccent.ts` maps it onto the brand tokens; a hard-coded brand colour is a bug, not a shortcut. Both themes must be legible — the dark palette's ground is `#000000` with `#1A1A1A` surfaces.
- **`filterConsumption()` governs which expense rows count** toward any total. A split receivable is not spend; seven client surfaces already share this rule.
- **A day subtotal is expenses only.** Netting a salary against groceries reports neither.
- **No new dependency**: no table library, no modal library, no drag-and-drop library, and no testing library.
- **Nothing in this repo renders a component in CI** (no `react-test-renderer` / `@testing-library/react-native`). Every decision that can be wrong goes into the pure module in Task 1 and is tested there; layout is verified by eye on the deployed web app and reported as such.
- The dialog is this app's first true modal: `role="dialog"`, `aria-modal`, focus moved in and restored, a focus trap, `Esc`, and scrim-click to close are requirements, not polish.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/expenses/desktopTable.ts` | **Pure.** Day grouping, day subtotals, facet counts, filtered summary, `rangeBetween`. All the testable logic. |
| `src/features/expenses/useExpensesScreenData.ts` | The screen's state and derived data, extracted from the 1009-line route file. |
| `src/components/expenses/ExpensesMobile.tsx` | Today's JSX, moved verbatim. Imported by both platform files. |
| `src/components/expenses/ExpensesView.tsx` | Native: renders `ExpensesMobile`. |
| `src/components/expenses/ExpensesView.web.tsx` | Web: width-gated `ExpensesMobile` \| `ExpensesDesktop`. The only file that decides. |
| `src/components/expenses/desktop/ExpensesDesktop.tsx` | Composition: rail + summary + table + dialog. |
| `src/components/expenses/desktop/SummaryStrip.tsx` | Filtered totals, per currency. |
| `src/components/expenses/desktop/TransactionTable.tsx` | Day groups, subtotals, hover, checkbox column, sort. |
| `src/components/expenses/desktop/FacetRail.tsx` | Facets with counts; collapses below 1440. |
| `src/components/expenses/desktop/ExpenseDialog.tsx` | Shell hosting `ExpenseDetailsCard`. |
| `app/(tabs)/expenses.tsx` | Thin: hook + `<ExpensesView/>`. |
| `src/components/expenses/detail/*` | The four detail components, moved out of `app/` by Task 1b so `src/` can import them at all. |

The dialog's host card must be reachable from `src/`, which is why Task 1b exists: `@/*` maps only to `./src/*`, and nothing under `src/` imports from `app/` anywhere in this repo.

---

### Task 0: Claim the issue number — DONE (controller, 2026-09-04)

`ABA-499`, claimed against `gh issue list --state all` (the highest in a title was
ABA-498, issue #503). Every commit message below already carries it. The GitHub
issue itself is created in Task 7, per this repo's convention that the issue
describes finished work.

Claimed up front rather than at the end because ABA-492 was taken twice by two
sessions running at once.

---

### Task 1: The pure table logic

Everything in this screen that can be numerically wrong lives here, because nothing else in the branch is testable in CI.

**Files:**
- Create: `apps/mobile/src/features/expenses/desktopTable.ts`
- Test: `apps/mobile/src/features/expenses/__tests__/desktopTable.test.ts`

**Interfaces produced:**
- `interface DayGroup { day: string; rows: LedgerRow[]; expenseSubtotal: number }` — `day` is the ISO calendar day and is a key, not a display string; formatting it for a locale is the component's job.
- `type LedgerRow = { kind: 'expense'; expense: Expense } | { kind: 'income'; income: Income }`
- `function rowId(row: LedgerRow): string`
- `function groupByDay(rows: LedgerRow[]): DayGroup[]`
- `function facetCounts(rows: LedgerRow[], key: 'categoryId' | 'accountId' | 'merchant'): Map<string, number>`
- `function countsForFacet(rows: LedgerRow[], active: ActiveFacets, group: FacetGroup): Map<string, number>`
- `function summarise(rows: LedgerRow[]): { spentByCurrency: Map<string, number>; earnedByCurrency: Map<string, number>; count: number }`
- `function rangeBetween(anchorId: string, targetId: string, visibleIds: string[]): string[]`
- `type FacetGroup = 'categoryId' | 'accountId' | 'merchant'`
- `interface ActiveFacets { categoryId: string[]; accountId: string[]; merchant: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/src/features/expenses/__tests__/desktopTable.test.ts
import {
  groupByDay, facetCounts, countsForFacet, summarise, rangeBetween, type LedgerRow,
} from '../desktopTable';

const exp = (id: string, date: string, amount: number, extra: Record<string, unknown> = {}): LedgerRow => ({
  kind: 'expense',
  expense: {
    id, date: new Date(date), amount, currencyCode: 'PLN',
    description: 'x', categoryId: 'cat-food', accountId: 'acc-1',
    isDeleted: false, ...extra,
  } as never,
});
const inc = (id: string, date: string, amount: number): LedgerRow => ({
  kind: 'income',
  income: { id, date: new Date(date), amount, currencyCode: 'PLN', accountId: 'acc-1', isDeleted: false } as never,
});

describe('groupByDay', () => {
  it('emits one group per calendar day, newest first, preserving row order inside a day', () => {
    const out = groupByDay([
      exp('a', '2026-09-02T10:00:00Z', 100),
      exp('b', '2026-09-02T18:00:00Z', 50),
      exp('c', '2026-09-01T09:00:00Z', 25),
    ]);

    expect(out.map((g) => g.day)).toEqual(['2026-09-02', '2026-09-01']);
    expect(out[0].rows.map((r) => (r.kind === 'expense' ? r.expense.id : ''))).toEqual(['a', 'b']);
  });

  it('subtotals expenses only — a salary must not net against groceries', () => {
    const out = groupByDay([exp('a', '2026-09-02T10:00:00Z', 100), inc('s', '2026-09-02T11:00:00Z', 12400)]);

    expect(out).toHaveLength(1);
    expect(out[0].rows).toHaveLength(2);
    expect(out[0].expenseSubtotal).toBe(100);
  });

  it('excludes a split receivable from the subtotal but still shows the row', () => {
    // filterConsumption's rule: the money already left as the original receipt,
    // so the receivable is visible as a debt but is not spend.
    const out = groupByDay([
      exp('a', '2026-09-02T10:00:00Z', 100),
      exp('r', '2026-09-02T11:00:00Z', 40, { isDebt: true, isSplitReceivable: true }),
    ]);

    expect(out[0].rows).toHaveLength(2);
    expect(out[0].expenseSubtotal).toBe(100);
  });

  it('is empty for no rows rather than producing an empty group', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('facetCounts', () => {
  it('counts expense rows per key', () => {
    const counts = facetCounts(
      [exp('a', '2026-09-02', 10), exp('b', '2026-09-02', 10), exp('c', '2026-09-02', 10, { categoryId: 'cat-house' })],
      'categoryId',
    );

    expect(counts.get('cat-food')).toBe(2);
    expect(counts.get('cat-house')).toBe(1);
  });

  it('buckets a missing key under an empty string rather than dropping the row', () => {
    const counts = facetCounts([exp('a', '2026-09-02', 10, { categoryId: undefined })], 'categoryId');

    expect(counts.get('')).toBe(1);
  });

  it('ignores income rows, which have no merchant or category facet', () => {
    expect(facetCounts([inc('s', '2026-09-02', 100)], 'categoryId').size).toBe(0);
  });
});

describe('countsForFacet', () => {
  // The number beside a facet must describe the list that facet would produce.
  // Counting against the unfiltered set is the classic faceted-search bug: the
  // user sees "Хозтовары 12", clicks it, and gets 3.
  const rows = [
    exp('a', '2026-09-02', 10, { categoryId: 'cat-food', accountId: 'acc-1' }),
    exp('b', '2026-09-02', 10, { categoryId: 'cat-food', accountId: 'acc-2' }),
    exp('c', '2026-09-02', 10, { categoryId: 'cat-house', accountId: 'acc-1' }),
    exp('d', '2026-09-02', 10, { categoryId: 'cat-house', accountId: 'acc-2' }),
  ];
  const none = { categoryId: [], accountId: [], merchant: [] };

  it('counts against the whole set when nothing is active', () => {
    const out = countsForFacet(rows, none, 'categoryId');

    expect(out.get('cat-food')).toBe(2);
    expect(out.get('cat-house')).toBe(2);
  });

  it('counts category against an active ACCOUNT filter', () => {
    const out = countsForFacet(rows, { ...none, accountId: ['acc-1'] }, 'categoryId');

    expect(out.get('cat-food')).toBe(1);
    expect(out.get('cat-house')).toBe(1);
  });

  it('ignores its OWN group, so a selected facet still shows what selecting a sibling would give', () => {
    // With Продукты selected, the Хозтовары count must not collapse to 0 —
    // otherwise the user can never see what switching to it would produce.
    const out = countsForFacet(rows, { ...none, categoryId: ['cat-food'] }, 'categoryId');

    expect(out.get('cat-food')).toBe(2);
    expect(out.get('cat-house')).toBe(2);
  });

  it('unions within a group and intersects across groups', () => {
    const out = countsForFacet(
      rows,
      { ...none, accountId: ['acc-1', 'acc-2'], merchant: [] },
      'categoryId',
    );

    expect(out.get('cat-food')).toBe(2);
  });
});

describe('summarise', () => {
  it('keeps currencies apart and never blends them', () => {
    const out = summarise([
      exp('a', '2026-09-02', 100),
      exp('b', '2026-09-02', 25, { currencyCode: 'EUR' }),
      inc('s', '2026-09-02', 12400),
    ]);

    expect(out.spentByCurrency.get('PLN')).toBe(100);
    expect(out.spentByCurrency.get('EUR')).toBe(25);
    expect(out.earnedByCurrency.get('PLN')).toBe(12400);
    expect(out.count).toBe(3);
  });

  it('excludes a split receivable from spend, matching the day subtotal', () => {
    const out = summarise([exp('r', '2026-09-02', 40, { isDebt: true, isSplitReceivable: true })]);

    expect(out.spentByCurrency.size).toBe(0);
    expect(out.count).toBe(1);
  });

  it('returns empty maps and a zero count for no rows — never NaN', () => {
    const out = summarise([]);

    expect(out.count).toBe(0);
    expect([...out.spentByCurrency.keys()]).toEqual([]);
  });
});

describe('rangeBetween', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('returns the inclusive range in visible order', () => {
    expect(rangeBetween('b', 'd', ids)).toEqual(['b', 'c', 'd']);
  });

  it('works when the user shift-clicks upward', () => {
    expect(rangeBetween('d', 'b', ids)).toEqual(['b', 'c', 'd']);
  });

  it('is a single id when the anchor and target are the same row', () => {
    expect(rangeBetween('c', 'c', ids)).toEqual(['c']);
  });

  it('returns nothing when either id has scrolled out of the filtered view', () => {
    // A bulk selection over money rows must never guess at a row it cannot see.
    expect(rangeBetween('b', 'zzz', ids)).toEqual([]);
    expect(rangeBetween('zzz', 'b', ids)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

Run: `cd apps/mobile && npx jest src/features/expenses/__tests__/desktopTable`
Expected: fails to run — `Cannot find module '../desktopTable'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/src/features/expenses/desktopTable.ts
import type { Expense, Income } from '@budget/shared-types';

/**
 * Pure table logic for the desktop transactions screen. It lives apart from the
 * components because nothing in this repo renders a component in CI — so this
 * file is the only place a mistake here can be caught before a human sees it.
 */

export type LedgerRow =
  | { kind: 'expense'; expense: Expense }
  | { kind: 'income'; income: Income };

export interface DayGroup {
  /** ISO calendar day, `YYYY-MM-DD`. A stable key, deliberately NOT a display
   *  string — formatting it for a locale belongs to the component, and a
   *  `label` field here would either duplicate that or quietly ship the ISO
   *  string to the screen. */
  day: string;
  rows: LedgerRow[];
  /** Expenses only, and split receivables excluded. See the two notes below. */
  expenseSubtotal: number;
}

export type FacetGroup = 'categoryId' | 'accountId' | 'merchant';
export interface ActiveFacets {
  categoryId: string[];
  accountId: string[];
  merchant: string[];
}

const rowDate = (r: LedgerRow): Date => (r.kind === 'expense' ? r.expense.date : r.income.date);
export const rowId = (r: LedgerRow): string => (r.kind === 'expense' ? r.expense.id : r.income.id);
const rowCurrency = (r: LedgerRow): string =>
  r.kind === 'expense' ? r.expense.currencyCode : r.income.currencyCode;

/**
 * A split receivable is one row per friend written when a bill is split. The
 * money already left as the original receipt, so counting it again would
 * inflate spend — the same rule `src/utils/consumption.ts` applies on seven
 * other surfaces. The row is still SHOWN: it is a real debt the user tracks.
 */
const isSpend = (r: LedgerRow): boolean =>
  // `!r.expense.isSplitReceivable`, never `=== false`: the field is optional and
  // the entity's own doc comment prescribes this form, because comparing to
  // `false` would wrongly drop every row written before the column existed.
  r.kind === 'expense' && !r.expense.isSplitReceivable;

const isoDay = (d: Date): string => {
  // Local calendar day, never toISOString(): that routes through UTC and shifts
  // the day for any non-zero offset, which is the bug `utils/dateInput.ts` and
  // `features/reports/reportDateRange.ts` both exist to avoid.
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function groupByDay(rows: LedgerRow[]): DayGroup[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const key = isoDay(rowDate(r));
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, dayRows]) => ({
      day,
      rows: dayRows,
      expenseSubtotal: dayRows.reduce(
        (sum, r) => (isSpend(r) ? sum + (r as { expense: Expense }).expense.amount : sum),
        0,
      ),
    }));
}

/**
 * Counts per facet value. Income rows are skipped: they carry neither a merchant
 * nor an expense category, so counting them would make every facet's number
 * disagree with the list it filters.
 */
export function facetCounts(
  rows: LedgerRow[],
  key: 'categoryId' | 'accountId' | 'merchant',
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== 'expense') continue;
    const value = (r.expense as unknown as Record<string, unknown>)[key];
    const bucket = typeof value === 'string' && value.length > 0 ? value : '';
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
}

/**
 * The count to show beside one facet value: how many rows you would get if you
 * picked it, given every OTHER group's active facets. Its own group is excluded
 * on purpose — with Продукты selected, the Хозтовары count must still say what
 * switching to it would give, or the user can never see where else to go.
 * Union within a group, intersection across groups.
 */
export function countsForFacet(
  rows: LedgerRow[],
  active: ActiveFacets,
  group: FacetGroup,
): Map<string, number> {
  const others = (Object.keys(active) as FacetGroup[]).filter((g) => g !== group);
  const narrowed = rows.filter((r) => {
    if (r.kind !== 'expense') return false;
    return others.every((g) => {
      const chosen = active[g];
      if (chosen.length === 0) return true;
      const value = (r.expense as unknown as Record<string, unknown>)[g];
      return typeof value === 'string' && chosen.includes(value);
    });
  });
  return facetCounts(narrowed, group);
}

export function summarise(rows: LedgerRow[]): {
  spentByCurrency: Map<string, number>;
  earnedByCurrency: Map<string, number>;
  count: number;
} {
  // Per currency, never blended: this app has no FX in a ledger total, and a
  // single "spent" figure across currencies would be a number that is true of
  // nothing. The same rule the receipt price check follows.
  const spentByCurrency = new Map<string, number>();
  const earnedByCurrency = new Map<string, number>();
  for (const r of rows) {
    const cur = rowCurrency(r);
    if (r.kind === 'income') {
      earnedByCurrency.set(cur, (earnedByCurrency.get(cur) ?? 0) + r.income.amount);
    } else if (isSpend(r)) {
      spentByCurrency.set(cur, (spentByCurrency.get(cur) ?? 0) + r.expense.amount);
    }
  }
  return { spentByCurrency, earnedByCurrency, count: rows.length };
}

/**
 * Shift-click range. Returns nothing when either end is not in the visible,
 * filtered order — a bulk action over money rows must never include a row the
 * user cannot see.
 */
export function rangeBetween(anchorId: string, targetId: string, visibleIds: string[]): string[] {
  const from = visibleIds.indexOf(anchorId);
  const to = visibleIds.indexOf(targetId);
  if (from === -1 || to === -1) return [];
  return visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx jest src/features/expenses/__tests__/desktopTable`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/expenses
git commit -m "ABA-499 Add the pure table logic for the desktop transactions screen"
```

---

### Task 1b: Move the detail components out of the routes directory

Added by the pre-flight scan, which found that Task 5's premise does not hold as written: `ExpenseDialog` lives in `src/` and needs `ExpenseDetailsCard`, which lives in `app/`. The `@/*` alias maps only to `./src/*`, there is no alias for `app/`, and **no file under `src/` imports from `app/` anywhere in this repo** — so the import Task 5 assumes has no supported form.

It is also worth fixing on its own merits: everything in `app/` is an expo-router route unless excluded, so these four files currently register phantom routes named after components. That is the same PascalCase-path-under-`app/` artifact that turned up while hardening the telemetry screen validator in ABA-497.

This is a **move, not a rewrite**. All four files are imported by exactly one file, so it is contained.

**Files:**
- Move: `app/expense/components/{ExpenseDetailsCard,ExpenseItemsSection,LocationSection,ReceiptSection}.tsx` → `src/components/expenses/detail/`
- Modify: `app/expense/[id].tsx` (four import paths)

- [ ] **Step 1: Confirm the importer set before moving anything**

```bash
cd apps/mobile
for n in ExpenseDetailsCard ExpenseItemsSection LocationSection ReceiptSection; do
  printf '%-22s ' "$n"; grep -rl "$n" app src --include=*.tsx | grep -v "app/expense/components/" | tr '\n' ' '; echo
done
```
Expected: `app/expense/[id].tsx` and nothing else, for all four. **If any other importer appears, stop and report** — the move is only safe because the set is this small.

- [ ] **Step 2: Move the files and fix the imports**

Use `git mv` so the rename is recorded and reviewable as a move. Then update the four import paths in `app/expense/[id].tsx` to `@/components/expenses/detail/...`, and fix any relative imports *inside* the moved files that pointed at `app/` neighbours — they are one directory deeper from `src/` than they were from `app/`.

Change nothing else. No renames, no prop changes, no reformatting: this task must be provably behaviour-neutral, and any edit beyond paths makes that impossible to see in the diff.

- [ ] **Step 3: Prove it was a move**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && git diff -M --stat HEAD
```
Expected: typecheck clean, the suite green with your task's delta accounted for, and the diff showing four renames with a high similarity index. Paste that stat in your report — it is the evidence that no content changed.

- [ ] **Step 4: Commit**

```bash
git add -A apps/mobile
git commit -m "ABA-499 Move the expense detail components out of the routes directory"
```

---

### Task 2: Extract the screen's state, leaving mobile byte-identical

The riskiest task in the plan: `app/(tabs)/expenses.tsx` is 1009 lines with 8 `useState` and 16 hook calls, and the desktop view cannot be written until its state is shared. Do this as a **pure move**, with no behaviour change and no opportunistic cleanup.

**Files:**
- Create: `apps/mobile/src/features/expenses/useExpensesScreenData.ts`
- Create: `apps/mobile/src/components/expenses/ExpensesMobile.tsx`
- Modify: `apps/mobile/app/(tabs)/expenses.tsx` (becomes thin)

**Interfaces:** `useExpensesScreenData()` returns everything the current screen computes — at minimum `activeTab`/`setActiveTab`, `viewMode`/`setViewMode`, `searchQuery`/`setSearchQuery`, `searchVisible`/`setSearchVisible`, `refreshing`/`onRefresh`, the filtered list, `filteredTotal`, `categories`, `merchantList`, `allTags`, `baseCurrency`, `rates`, and the loading flags. Read the file and carry across exactly what it has; do not invent fields and do not drop any.

- [ ] **Step 1: Read the whole route file before changing anything**

```bash
cd apps/mobile && sed -n '1,200p' "app/(tabs)/expenses.tsx"
```

Then the rest in two more reads. You are moving code, so you must have seen all of it. Note in your report anything that looks like a bug — **do not fix it here**; a behaviour change in this task is indistinguishable from a mistake.

- [ ] **Step 2: Move the state and derived data into the hook**

Everything that is not JSX goes into `useExpensesScreenData.ts` unchanged: the same `useState` initialisers, the same store selectors, the same `useMemo`/`useCallback` bodies, the same effect dependencies. Keep `filterConsumption` exactly where it is applied today — it decides which rows count toward `filteredTotal`.

Do **not** wire in `src/features/analytics/useFilteredTransactions.ts`. It looks like the obvious consolidation and it is the wrong hook: it filters on the analytics period and display currency and is consumed by 13 analytics hooks, so adopting it here would change what the mobile screen shows.

- [ ] **Step 3: Move the JSX into `ExpensesMobile.tsx`**

Verbatim. It takes the hook's return value as props — or calls the hook itself, whichever produces a smaller diff; say which you chose and why. `app/(tabs)/expenses.tsx` becomes a thin file that renders `<ExpensesMobile />` and nothing else, mirroring what `(tabs)/index.tsx` became after its own decomposition.

- [ ] **Step 4: Prove mobile did not change**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
```
Expected: the same test and suite counts as the run you recorded before starting — this task adds no tests, so any change in the numbers means something moved that should not have. A changed count means something moved that should not have.

Then diff the rendered output the only way this repo can: confirm the JSX in `ExpensesMobile.tsx` is a move, not a rewrite, with

```bash
git diff -M --stat HEAD
```

A high similarity index on the moved block is the evidence; paste it in your report.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/expenses apps/mobile/src/components/expenses "apps/mobile/app/(tabs)/expenses.tsx"
git commit -m "ABA-499 Extract the transactions screen's state so a second view can share it"
```

---

### Task 3: The platform split and the desktop skeleton

**Files:**
- Create: `apps/mobile/src/components/expenses/ExpensesView.tsx`
- Create: `apps/mobile/src/components/expenses/ExpensesView.web.tsx`
- Create: `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx`
- Create: `apps/mobile/src/components/expenses/desktop/SummaryStrip.tsx`
- Create: `apps/mobile/src/components/expenses/desktop/TransactionTable.tsx`
- Modify: `apps/mobile/app/(tabs)/expenses.tsx` (render `ExpensesView`)

**Interfaces:** `ExpensesView` takes no props and is the only component that decides mobile vs desktop.

- [ ] **Step 1: Write the two platform files**

```tsx
// apps/mobile/src/components/expenses/ExpensesView.tsx
import { ExpensesMobile } from './ExpensesMobile';

/**
 * Native. There is no desktop on a phone, so this is the mobile view and
 * nothing else. The web counterpart is `ExpensesView.web.tsx`; Metro resolves
 * the platform file at bundle time, so no desktop code reaches the native app.
 */
export function ExpensesView() {
  return <ExpensesMobile />;
}
```

```tsx
// apps/mobile/src/components/expenses/ExpensesView.web.tsx
import { useIsDesktopWeb } from '../webLayout.constants';
import { ExpensesMobile } from './ExpensesMobile';
import { ExpensesDesktop } from './desktop/ExpensesDesktop';

/**
 * The one place that decides, and it decides on width alone. Below
 * DESKTOP_MIN_WIDTH (1024) a browser gets the mobile view byte-for-byte — the
 * same rule `WebShell` already follows, so a phone browser is unaffected by
 * everything in `desktop/`.
 */
export function ExpensesView() {
  return useIsDesktopWeb() ? <ExpensesDesktop /> : <ExpensesMobile />;
}
```

Check the import path for `useIsDesktopWeb` against `src/components/webLayout.constants.ts` before writing it; adjust the relative depth as needed.

- [ ] **Step 2: Write the screen's own top bar**

Distinct from the shell's top bar (which carries the account switcher, currency, alerts and settings). This one belongs to the screen and carries, per the spec's affordance table:

- an **always-visible search input** — on mobile search hides behind a toggle icon because width is scarce; on desktop it is not, and a hidden search on a 1500px screen is a phone habit
- the **"+ Расход" button**, replacing the FAB, which has no desktop equivalent
- the existing **List / Map toggle**, kept as-is: `ExpenseMapView` already has a web variant and inherits the screen's filters

Wire all three to the hook from Task 2 — `searchQuery`/`setSearchQuery` and `viewMode`/`setViewMode` already exist there. Do not add new state.

- [ ] **Step 3: Write the summary strip**

Four figures from `summarise()`: spend, income, count, and the largest category. Per currency — when more than one currency is present, show the user's display currency and a `+N` affordance rather than a blended number. Take every colour from `useTheme()`; income uses `theme.colors.success`.

- [ ] **Step 4: Write the table**

Columns: date, description (with merchant as a secondary line), category, account, amount. Requirements:

- day-group header rows from `groupByDay()`, each with its `expenseSubtotal`
- income rows in `theme.colors.success` with an explicit sign; expenses in `theme.colors.textPrimary`
- `fontVariant: ['tabular-nums']` on every money and date cell, so columns line up
- a hover state on rows (`onMouseEnter`-driven state or a `:hover` style via `dataSet`) — this is web-only code, so DOM-level hover is legitimate here, the same licence `DatePicker.web.tsx` takes
- horizontal overflow contained: the table scrolls inside its own container, never the page body
- header cells that sort are real buttons with a visible focus ring

Row click opens the dialog in Task 5; for now it selects the row.

- [ ] **Step 5: Typecheck, test, and export the web bundle**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```

There is **no** `build:web` npm script — checked; the only entry points are `scripts/build-web.sh` (run from the repo root, which is what `web-deploy.yml` runs) and the root `dev:web` for a live server. Expected: typecheck clean, the suite still green, and a successful export. The export matters more here than in a native-only task: a `.web.tsx` file that fails to bundle is invisible to both `tsc` and Jest.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/expenses "apps/mobile/app/(tabs)/expenses.tsx"
git commit -m "ABA-499 Add the desktop transactions table behind a width gate"
```

---

### Task 4: The facet rail

**Files:**
- Create: `apps/mobile/src/components/expenses/desktop/FacetRail.tsx`
- Modify: `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx`

- [ ] **Step 1: Build the rail**

Facet groups: period, expenses/income/all (the mobile tab, now a facet — see the spec's decision 8), category, merchant. **There is deliberately no account facet:** `loadAllExpenses` filters `WHERE ... account_id = ?`, so every row this screen can show belongs to the current account and the facet would offer exactly one option. `FacetGroup` in `desktopTable.ts` keeps its `'accountId'` member — removing it means editing Task 1's module and its tests for no gain — it is simply never rendered. Counts come from `facetCounts()`, computed against the **other** active facets, so each number matches the list that facet would produce. Multi-select within a group, union inside a group and intersection across groups — the semantics the existing merchant filter already uses.

- [ ] **Step 2: Handle the 1024–1439 band**

Below 1440 the rail collapses to a labelled dropdown in the screen's top bar. Add `FACET_RAIL_MIN_WIDTH = 1440` to `src/components/webLayout.constants.ts` beside the existing constants, and drive the collapse from `useWindowDimensions()`. This is the one place the layout concedes; make the collapsed control state how many facets are active, so nothing is silently filtering.

- [ ] **Step 3: Typecheck, test, export**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```
Expected: typecheck clean, the suite green with your task's delta accounted for, successful export. The `countsForFacet` tests from Task 1 must still pass — this task wires that function up but must not change it.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/expenses/desktop apps/mobile/src/components/webLayout.constants.ts
git commit -m "ABA-499 Replace the mobile pill row with a desktop facet rail"
```

---

### Task 5: The dialog

**Files:**
- Create: `apps/mobile/src/components/expenses/desktop/ExpenseDialog.tsx`
- Move: `apps/mobile/app/income/components/IncomeDetailsCard.tsx` -> `apps/mobile/src/components/income/detail/IncomeDetailsCard.tsx`
- Modify: `apps/mobile/app/income/[id].tsx` (its import path only)
- Modify: `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx`

**Interfaces consumed:** `ExpenseDetailsCard`, at `src/components/expenses/detail/ExpenseDetailsCard.tsx` **after Task 1b moves it there** — `forwardRef<ExpenseDetailsCardHandle, { expense, isEditing, onSaved, isTripAccount?, tripMembers? }>` where the handle is `{ triggerSave: () => Promise<void> }`. Import it as `@/components/expenses/detail/ExpenseDetailsCard`; do not reach into `app/`, which has no path alias and which nothing under `src/` imports from.

**The table shows income rows too (decision 8), so the dialog must open either kind.** Income has its own `IncomeDetailsCard` — `forwardRef<IncomeDetailsCardHandle, { income, isEditing, onSaved }>` — today at `app/income/components/IncomeDetailsCard.tsx`, which `src/` cannot import from. Step 1 moves it, mirroring Task 1b exactly: it is the only file in that directory and `app/income/[id].tsx` is its only importer (3 lines), so the move also removes a phantom expo-router route, the same secondary win Task 1b had. Two asymmetries to respect rather than paper over: the income handle is `triggerSave: () => void`, **not** `Promise<void>`, so the dialog cannot await a completion signal from that card — do not widen either card's type to match the other; and the income card takes no trip props. Branch on `row.kind` and host the matching card. Hosting two existing cards is still hosting; reimplementing either is the same task failure as reimplementing the expense one.

- [ ] **Step 1: Move the income detail card out of the routes directory**

```bash
cd apps/mobile
mkdir -p src/components/income/detail
git mv app/income/components/IncomeDetailsCard.tsx src/components/income/detail/IncomeDetailsCard.tsx
```

Then repoint the import in `app/income/[id].tsx` to `@/components/income/detail/IncomeDetailsCard`. Verify with `git show --stat` that git recorded a pure rename with no content change; if it did not, you edited the file and should undo that.

- [ ] **Step 2: Build the shell**

The dialog **hosts** `ExpenseDetailsCard`; it must not reimplement any detail or edit behaviour. Its footer's Save calls `handle.triggerSave()` through a ref, exactly as `app/expense/[id].tsx` already does — read that file first and copy the pattern rather than inventing one. This is the decision that keeps the desktop layer from drifting from mobile on what an edit does, so a second implementation of the edit form is a task failure, not a shortcut.

Requirements, all of them hard:

- `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` pointing at its title
- focus moves into the dialog on open and is **restored to the row that opened it** on close
- a focus trap: Tab from the last control returns to the first
- `Esc` closes; a scrim click closes; closing while editing asks before discarding
- centred, sized to content, `maxWidth` around 680 with a `maxHeight` and its own internal scroll — **not** a bottom sheet, and not full-screen
- the scrim uses `theme.colors.overlay`

This is the app's first true modal, and a dialog that traps focus badly is worse than the navigation it replaced.

- [ ] **Step 3: Typecheck, test, export**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```
Expected: typecheck clean, the suite green with your task's delta accounted for, successful export. Note what these commands **cannot** tell you: nothing here exercises the focus trap, `Esc`, or focus restoration, because no component renders in CI. Those are checked by hand in Task 7, Step 3 — say plainly in your report that they are unverified at this point rather than implying the green run covers them.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components apps/mobile/app/income
git commit -m "ABA-499 Open a transaction in a desktop dialog around the existing detail cards"
```

---

### Task 6: Selection on desktop

**Files:**
- Modify: `apps/mobile/src/hooks/useExpenseMultiSelect.ts` (one additive method — see below)
- Modify: `apps/mobile/src/components/expenses/desktop/TransactionTable.tsx`
- Modify: `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx`

**Interfaces consumed:** `useExpenseMultiSelect(expenses, bulkUpdateExpenses)` returning `{ isMultiSelect, selectedIds, showBulkCategoryPicker, setShowBulkCategoryPicker, showBulkTagPicker, setShowBulkTagPicker, isBulkProcessing, enterMultiSelect, exitMultiSelect, toggleSelection, selectAll, handleBulkSetCategory, handleBulkAddTags, handleBulkDelete }`; and `rangeBetween` from Task 1.

**Only expense rows are selectable, and three mismatches follow from that. All three are load-bearing; none is cosmetic.**

1. **Income rows get no checkbox** — render an empty cell in that column for them. The hook is `useExpenseMultiSelect(expenses: Expense[], ...)` and everything behind it ends at `PATCH /expenses/bulk`; there is no income bulk endpoint, and adding one is server work this UI task must not smuggle in. An income row that offers a checkbox leading to a no-op is worse than one that offers none.

2. **The header checkbox must NOT call `selectAll`.** `selectAll` is `setSelectedIds(new Set(expenses.map(e => e.id)))` — it reads the hook's own store-derived list, which after Task 4 is a **superset** of what the facet rail leaves visible. Calling it would select rows the user cannot see and then hand them to a bulk delete. Add an additive `selectIds(ids: string[])` to the hook and call that with the visible selectable ids; leave `selectAll` exactly as it is, because mobile still uses it and mobile's list is not facet-filtered. Additive only — do not change `selectAll`'s behaviour or the hook's existing signature.

3. **The id list you hand `rangeBetween` is the visible SELECTABLE ids in render order** — expense rows only, after facets, in the order the table draws them. If income ids are in that list, a range spanning an income row silently pulls it into the selection and on to the expense bulk endpoint.

- [ ] **Step 1: Wire the checkbox column**

A checkbox column that appears on row hover and stays once anything is selected, driving the **existing** hook — long-press has no desktop equivalent, but the bulk actions behind it are already written and must not be reimplemented. A header checkbox selects the visible selectable rows through the new `selectIds` (see the interfaces note above — not `selectAll`), and reflects a partial selection distinctly from a complete one, so it never claims to have selected rows it did not. The bulk action bar reuses the existing pickers.

- [ ] **Step 2: Wire shift-click**

Hold an anchor id in a ref: a plain click sets the anchor and toggles; a shift-click passes the anchor, the clicked id and the **visible, filtered** id order to `rangeBetween` and selects the result. Build that id list with `rowId()` from Task 1, in the order the table currently renders — not the unfiltered store order, or a shift-click after filtering selects rows the user cannot see, which is exactly the case `rangeBetween`'s "returns nothing when either id is out of view" test pins.

- [ ] **Step 3: Give a row its context menu**

The mobile long-press opens `TransactionActionSheet` (Edit / Duplicate / Delete / Select multiple). On desktop the sheet becomes a small menu anchored to the row, opened by a right-click and by a keyboard-reachable "⋯" button in the row — a right-click-only affordance is unreachable by keyboard. "Select multiple" is dropped from it: the checkbox column from Step 1 already is that. Reuse the existing handlers rather than reimplementing Duplicate or Delete.

- [ ] **Step 4: Typecheck, test, export**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```
Expected: typecheck clean, the suite green with your task's delta accounted for, successful export. `rangeBetween` is consumed but not modified by this task, so its Task 1 tests must pass unchanged. `useExpenseMultiSelect` gains one method and loses none, so its existing consumers and tests must also pass unchanged — if any mobile test changes, you altered behaviour rather than adding to it.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/expenses/desktop apps/mobile/src/hooks/useExpenseMultiSelect.ts
git commit -m "ABA-499 Select rows with checkboxes and shift-click on desktop"
```

---

### Task 7: Verification, docs, and the issue

The layout cannot be tested in CI, so this task is where it actually gets checked — by eye, deliberately, against a list.

- [ ] **Step 1: Sweep the accents and both themes**

Run the app on web (`npm run dev:web` from the repo root) at ≥1440. For **each** of the 13 accents (the default plus the 12 in `src/theme/presetAccents.ts`), in **both** light and dark, confirm: the facet rail's active state is legible, the day-group header is distinguishable from a row, an income row is distinguishable from an expense, the dialog's scrim does not swallow its own surface, and every button's label is readable on its own background. Report which accent was worst and why — amber and green are the usual failures, because a light accent needs a dark on-accent foreground.

- [ ] **Step 2: Sweep the three width regimes**

At 900 (mobile view on web), 1200 (desktop, rail collapsed) and 1500 (desktop, rail expanded): confirm nothing overlaps, the table scrolls inside its own container rather than the page, and the collapsed rail states how many facets are active. Report the narrowest width at which the desktop layout is genuinely usable — the spec predicts a dropdown suffices below 1440 and that prediction should be confirmed or corrected.

- [ ] **Step 3: Check the deep links still switch the tab**

Added after Task 2's review. `useLocalSearchParams()` now runs inside `ExpensesMobile`, a non-route module, and it is the first such call anywhere in `apps/mobile/src` — every other call site sits under `app/`. It should be mechanically identical, because expo-router reads route params from React Navigation's route context, which is provided around the screen element and therefore around `ExpensesMobile` as a direct descendant. But nothing executed it, there is no in-repo precedent, and **if it were wrong the failure is silent**: the `?tab=income` and `?view=map` links would simply stop switching the tab, with no error anywhere.

Five call sites reach this screen that way — `TripSection`, `DebtsBottomNav`, `IncomeExpensesCard`, `WebSidebar` and `services/notifications.ts`. Exercise two of them: the trip account's "Trip map" row (expects the map view) and an income deep link (expects the incomes tab). Report what you saw for each; "it should work" is not a result.

- [ ] **Step 4: Check the dialog by keyboard alone**

Open a row with Enter, Tab through every control and back around, `Esc` to close, and confirm focus lands back on the row that opened it. Then try closing mid-edit and confirm it asks.

- [ ] **Step 5: Update CLAUDE.md**

One bullet in the mobile section recording: the component-level split with `ExpensesView.web.tsx` as the only decider and why route-level was not used; that `ExpensesMobile.tsx` has exactly one definition imported by both platform files, so a mobile change is a bug; that the dialog hosts `ExpenseDetailsCard` through its `triggerSave` handle and must never grow a second edit implementation; that desktop merges the expenses/income tab into one table with the tab as a facet, while `filterConsumption` still governs spend and a day subtotal stays expenses-only; the three width regimes and the 1440 rail threshold; and the trap that `features/analytics/useFilteredTransactions.ts` is **not** this screen's filtering hook.

- [ ] **Step 6: Create the issue**

Use the number from Task 0. Title with no colon; English body with Problem / Implementation / Out of scope, naming E1/E2/E3/E4 and the remaining screens as follow-ups.

- [ ] **Step 7: Full verification**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd ../admin && npx tsc --noEmit
cd ../.. && bash scripts/build-web.sh
```
Expected: everything passes; the mobile count matches what the suite reported at the end of the previous task plus your own delta.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "ABA-499 Document the desktop transactions screen"
```

---

## Deployment notes

- `web-deploy.yml` runs on every push to `development` and rebuilds the SPA, so this ships to `app.ai-budget.pl` on merge with no separate step.
- Nothing here requires a mobile release, and nothing here should change the AAB beyond the code that Metro resolves for native — which is `ExpensesView.tsx` and `ExpensesMobile.tsx` only.
- There is no feature flag. If the desktop view is wrong in production, the revert is this branch; keep the commits separable rather than squashing before it has been seen on the deployed site.
