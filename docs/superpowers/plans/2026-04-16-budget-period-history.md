# Budget Period History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users navigate to past periods of a budget on the detail screen and see that period's `spent`, `remaining`, `percentUsed`, and category breakdown.

**Architecture:** Generalize `getBudgetProgress` with an optional reference date (backward compatible). On the budget detail screen, add state + chevron navigation + period label + backward/forward caps. Hide projection widgets (`daysRemaining`, `projectedTotal`) for past periods.

**Tech Stack:** React Native / Expo 54, Zustand, `react-i18next`, Ionicons. Existing date helpers from `@budget/shared-utils`. No API/DB schema/shared-types changes.

**Spec:** `docs/superpowers/specs/2026-04-16-budget-period-history-design.md`

**Testing reality:** Project has no unit tests for stores or screens. Verification: `npm run typecheck`, `npm run lint`, manual testing on Expo dev server.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/stores/budgetStore.ts` | modify | Accept optional `referenceDate` in `getBudgetProgress`; use it as `now` baseline |
| `apps/mobile/app/budget/[id].tsx` | modify | Add period-nav state, chevron UI, period label formatter, `isCurrentPeriod` guard for projection rows |

No new files. No i18n keys required — week-range label uses language-neutral dash format.

---

## Task 1: Generalize `getBudgetProgress` with optional reference date

**Files:**
- Modify: `apps/mobile/src/stores/budgetStore.ts`

- [ ] **Step 1: Update interface**

Around line 45 (the `BudgetState.getBudgetProgress` line):

```ts
  getBudgetProgress: (budgetId: string) => BudgetProgress | null;
```

Replace with:

```ts
  getBudgetProgress: (budgetId: string, referenceDate?: Date) => BudgetProgress | null;
```

- [ ] **Step 2: Update implementation**

Find the implementation around line 420. Locate:

```ts
    getBudgetProgress: (budgetId: string): BudgetProgress | null => {
      const budget = get().budgets.find((b) => b.id === budgetId);
      if (!budget || budget.isDeleted) return null;

      const expenses = useExpenseStore.getState().expenses.filter((e) => !e.isDeleted);

      // Get period dates
      let periodStart: Date;
      let periodEnd: Date;
      const now = new Date();
```

Replace with:

```ts
    getBudgetProgress: (budgetId: string, referenceDate?: Date): BudgetProgress | null => {
      const budget = get().budgets.find((b) => b.id === budgetId);
      if (!budget || budget.isDeleted) return null;

      const expenses = useExpenseStore.getState().expenses.filter((e) => !e.isDeleted);

      // Get period dates
      let periodStart: Date;
      let periodEnd: Date;
      const now = referenceDate ?? new Date();
```

All downstream uses of `now` (for period computation, projections, exhaustion date) continue to work without modification — they already close over the local `now`.

- [ ] **Step 3: Typecheck**

```bash
cd apps/mobile && npm run typecheck
```

Expected: no errors. Existing callers (`getMonthlyBudgetSummary`, home screen, budgets tab, detail screen) pass no second arg — signature stays compatible.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/stores/budgetStore.ts
git commit -m "feat(mobile): accept optional referenceDate in getBudgetProgress"
```

---

## Task 2: Add period-navigation UI to budget detail screen

**Files:**
- Modify: `apps/mobile/app/budget/[id].tsx`

This is the larger task — several coordinated edits.

- [ ] **Step 1: Add imports**

Near the top of the file, add these imports alongside existing ones:

```tsx
import { getStartOfWeek } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
```

Check if `getIntlLocale` is already imported — if yes, skip that line. `getStartOfWeek` is not currently imported in this screen; add it.

- [ ] **Step 2: Add `referenceDate` state and pass to `getBudgetProgress`**

Find around line 34-35:

```tsx
  const { budgets, updateBudget, deleteBudget, getBudgetProgress } = useBudgetStore();
  const { getExpenseCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const budget = budgets.find((b) => b.id === id);
  const progress = budget ? getBudgetProgress(budget.id) : null;
```

Replace the `progress` line and insert state after `budget`:

```tsx
  const { budgets, updateBudget, deleteBudget, getBudgetProgress } = useBudgetStore();
  const { getExpenseCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const budget = budgets.find((b) => b.id === id);

  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const progress = budget ? getBudgetProgress(budget.id, referenceDate) : null;
```

- [ ] **Step 3: Add `periodsMatch` helper and `isCurrentPeriod`**

Place this immediately after the state declaration (before `startEditing`):

```tsx
  const periodsMatch = (period: string, a: Date, b: Date): boolean => {
    switch (period) {
      case 'daily':
        return a.toDateString() === b.toDateString();
      case 'weekly':
        return getStartOfWeek(a).getTime() === getStartOfWeek(b).getTime();
      case 'monthly':
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
      case 'yearly':
        return a.getFullYear() === b.getFullYear();
      default:
        return true;
    }
  };

  const isCurrentPeriod = budget ? periodsMatch(budget.period, referenceDate, new Date()) : true;
```

- [ ] **Step 4: Add navigation handlers**

After `isCurrentPeriod`:

```tsx
  const stepPeriod = (delta: 1 | -1) => {
    if (!budget) return;
    const d = new Date(referenceDate);
    switch (budget.period) {
      case 'daily':
        d.setDate(d.getDate() + delta);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7 * delta);
        // Re-align to week-start in case the raw step crossed a DST boundary.
        setReferenceDate(getStartOfWeek(d));
        return;
      case 'monthly':
        d.setMonth(d.getMonth() + delta);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + delta);
        break;
      default:
        return; // 'custom' — no navigation
    }
    setReferenceDate(d);
  };

  const canGoBack = (() => {
    if (!budget || budget.period === 'custom') return false;
    const candidate = new Date(referenceDate);
    switch (budget.period) {
      case 'daily':
        candidate.setDate(candidate.getDate() - 1);
        break;
      case 'weekly':
        candidate.setDate(candidate.getDate() - 7);
        break;
      case 'monthly':
        candidate.setMonth(candidate.getMonth() - 1);
        break;
      case 'yearly':
        candidate.setFullYear(candidate.getFullYear() - 1);
        break;
    }
    const budgetStart = new Date(budget.startDate);
    return candidate >= budgetStart || periodsMatch(budget.period, candidate, budgetStart);
  })();
```

Note: `canGoBack` allows stepping back into the period that contains `budget.startDate` (inclusive). The `periodsMatch` check covers cases where the candidate's period bucket is the same as the start bucket even though raw `candidate < budgetStart`.

- [ ] **Step 5: Period-label formatter**

```tsx
  const formatPeriodLabel = (): string => {
    if (!budget) return '';
    const locale = getIntlLocale();
    switch (budget.period) {
      case 'daily':
        return referenceDate.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
      case 'weekly': {
        const start = getStartOfWeek(referenceDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const from = start.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        const to = end.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        return `${from} – ${to}`;
      }
      case 'monthly': {
        const name = referenceDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
      case 'yearly':
        return String(referenceDate.getFullYear());
      default:
        return '';
    }
  };
```

- [ ] **Step 6: Render the navigation row**

Find the VIEW MODE return block (around line 418-420). Immediately after `<View style={styles.headerCard}>...</View>` closes (around line 429) and BEFORE the Progress Card, insert:

```tsx
        {budget.period !== 'custom' && (
          <View style={styles.periodNavRow}>
            <TouchableOpacity
              onPress={() => stepPeriod(-1)}
              disabled={!canGoBack}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={canGoBack ? theme.colors.primary : theme.colors.textDisabled}
              />
            </TouchableOpacity>
            <Text style={styles.periodNavLabel}>{formatPeriodLabel()}</Text>
            <TouchableOpacity
              onPress={() => stepPeriod(1)}
              disabled={isCurrentPeriod}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}
```

- [ ] **Step 7: Add styles**

Inside `createStyles`, near other row styles, add:

```ts
  periodNavRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  periodNavLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 160,
    textAlign: 'center' as const,
  },
```

- [ ] **Step 8: Hide `daysRemaining` row in past periods**

Find around line 525-528:

```tsx
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('budgetDetail.daysRemaining')}</Text>
                <Text style={styles.detailValue}>{progress.daysRemaining}</Text>
              </View>
```

Wrap with `isCurrentPeriod`:

```tsx
              {isCurrentPeriod && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('budgetDetail.daysRemaining')}</Text>
                  <Text style={styles.detailValue}>{progress.daysRemaining}</Text>
                </View>
              )}
```

- [ ] **Step 9: Hide `projectedTotal` row in past periods**

Both `daysRemaining` (already wrapped in Step 8) and `projectedTotal` (around lines 531-538) currently live inside a single `{progress && (<> ... </>)}` fragment. Wrap the `projectedTotal` row individually with `{isCurrentPeriod && (...)}`, keeping it still inside the outer `{progress && ...}` guard. Example shape:

```tsx
{progress && (
  <>
    {isCurrentPeriod && (
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{t('budgetDetail.daysRemaining')}</Text>
        <Text style={styles.detailValue}>{progress.daysRemaining}</Text>
      </View>
    )}
    {isCurrentPeriod && (
      {/* existing projectedTotal row verbatim */}
    )}
    {/* any other rows unchanged */}
  </>
)}
```

- [ ] **Step 10: Typecheck**

```bash
cd apps/mobile && npm run typecheck
```

Expected: no errors.

- [ ] **Step 11: Lint**

```bash
cd apps/mobile && npm run lint 2>&1 | grep -E "budget/\[id\]\.tsx|budgetStore\.ts" || echo "no new warnings"
```

Expected: `no new warnings`.

- [ ] **Step 12: Manual smoke**

From `apps/mobile/` run `npx expo start --web`. Log in, open a monthly budget created at least one month ago:

- Current period shows by default. Forward chevron disabled.
- Tap `‹` → previous month's label appears; `spent` reflects that month's expenses.
- Daily budget: `‹`/`›` steps by day.
- Weekly: steps by 7 days; label shows from–to.
- Yearly: steps by year.
- Custom budget: nav row hidden.
- Past period: `daysRemaining` and `projectedTotal` rows hidden.
- Backward chevron disabled when next back-step would cross `budget.startDate`'s period.

- [ ] **Step 13: Commit**

```bash
git add apps/mobile/app/budget/\[id\].tsx
git commit -m "feat(mobile): add period navigation to budget detail screen"
```

---

## Task 3: Full verification

**Files:** no code changes.

- [ ] **Step 1: Root typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: typecheck clean. Lint shows pre-existing warnings; no new ones for the two touched files.

- [ ] **Step 2: Walk the spec's manual test plan**

`docs/superpowers/specs/2026-04-16-budget-period-history-design.md` § Manual test plan. Verify each bullet on the dev server.

---

## Out-of-scope reminders

- Do not touch other `getBudgetProgress` callers (home `getMonthlyBudgetSummary`, budgets tab). They call without `referenceDate` and get current-period behaviour.
- Do not add snapshot history / Prisma migrations.
- Do not add `estimatedExhaustionDate` to the detail screen — it doesn't render today and isn't in scope.
- Do not add i18n keys for the week range label — the `"Mar 10 – Mar 16"` format is language-neutral enough.
- Do not change analytics screen or any other screen.
- Do not add unit tests for stores or screens.
