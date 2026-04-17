# Analytics Summary Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two summary cards at the top of `analytics.tsx` ("Total spent", "Avg per day") tappable, routing to the existing `/analytics/drill-down` with the same params the bar chart already uses.

**Architecture:** Mobile-only UX change. Extract a shared `openDrillDown` handler and reuse it from: (a) the bar chart's existing `onBarPress`, (b) both new `TouchableOpacity` wrappers around the summary cards. Add a small chevron affordance inside each card. Add one new i18n key (`analytics.viewExpenses`) across all 8 locales for the accessibility label.

**Tech Stack:** React Native (Expo 54), Expo Router, `react-i18next`, Ionicons. No API/DB/shared-types changes.

**Spec:** `docs/superpowers/specs/2026-04-16-analytics-summary-drill-down-design.md`

**Testing reality:** The mobile project has `jest-expo` configured but no unit tests for screen components. Verification uses `tsc --noEmit` and manual testing on Expo dev server. Do NOT invent a test scaffold for screens.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/i18n/locales/en.ts` | modify | Add `analytics.viewExpenses: 'View expenses'` |
| `apps/mobile/src/i18n/locales/{de,es,fr,pl,ru,ua,be}.ts` | modify (×7) | Translated `analytics.viewExpenses` |
| `apps/mobile/app/(tabs)/analytics.tsx` | modify | Extract `openDrillDown` handler, refactor `onBarPress` to use it, wrap both summary cards in `TouchableOpacity`, add chevron icons, add styles |

---

## Task 1: Add i18n key (English source)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`

- [ ] **Step 1: Add `analytics.viewExpenses`**

Find the `analytics: { ... }` block in `apps/mobile/src/i18n/locales/en.ts`. Insert a new key `viewExpenses: 'View expenses',` near the top of that block (after `week`/`month`/`year` or similar existing entries — anywhere inside the `analytics` block is fine).

- [ ] **Step 2: Verify typecheck**

Run from `apps/mobile/`:

```bash
npm run typecheck
```

Expected: type errors for the 7 sibling locales missing the new key. This is expected — Task 2 fixes them.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/locales/en.ts
git commit -m "feat(mobile): add analytics.viewExpenses key (en)"
```

---

## Task 2: Translate key to 7 other locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`

For each locale, add the `viewExpenses` key inside the `analytics` block at the same structural position you used for `en.ts` in Task 1.

Translations:

| Locale | `analytics.viewExpenses` |
|---|---|
| de | `Ausgaben anzeigen` |
| es | `Ver gastos` |
| fr | `Voir les dépenses` |
| pl | `Zobacz wydatki` |
| ru | `Посмотреть траты` |
| ua | `Переглянути витрати` |
| be | `Паказаць выдаткі` |

- [ ] **Step 1: Apply all 7 translations**

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/locales/de.ts apps/mobile/src/i18n/locales/es.ts apps/mobile/src/i18n/locales/fr.ts apps/mobile/src/i18n/locales/pl.ts apps/mobile/src/i18n/locales/ru.ts apps/mobile/src/i18n/locales/ua.ts apps/mobile/src/i18n/locales/be.ts
git commit -m "feat(mobile): translate analytics.viewExpenses (de/es/fr/pl/ru/ua/be)"
```

---

## Task 3: Make summary cards tappable with chevron affordance

**Files:**
- Modify: `apps/mobile/app/(tabs)/analytics.tsx`

- [ ] **Step 1: Extract the drill-down handler**

After the `goToNextPeriod` useCallback (around line 87-99), add:

```tsx
  const openDrillDown = useCallback(() => {
    router.push({
      pathname: '/analytics/drill-down',
      params: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        currencyCode: currency,
        level: selectedRange === 'year' ? 'year' : 'month',
      },
    });
  }, [dateRange.startDate, dateRange.endDate, currency, selectedRange]);
```

Note: `currency` is derived later in the function (line 107) — it uses `selectedCurrency || user?.currencyCode || 'USD'`. Ensure the `useCallback` deps include `currency`. If the linter flags ordering (`currency` declared below `useCallback`), move the `const currency = ...` line up to sit right after `const availableCurrencies = ...` and before this new callback — or inline the fallback chain in the callback body. Easiest: move `availableCurrencies` and `currency` up to the top of the component body, before all callbacks.

- [ ] **Step 2: Refactor the bar-chart `onBarPress` to call the shared handler**

Current (lines 327-337):

```tsx
onBarPress={(item) => {
  router.push({
    pathname: '/analytics/drill-down',
    params: {
      startDate: dateRange.startDate.toISOString(),
      endDate: dateRange.endDate.toISOString(),
      currencyCode: currency,
      level: selectedRange === 'year' ? 'year' : 'month',
    },
  });
}}
```

Replace with:

```tsx
onBarPress={openDrillDown}
```

- [ ] **Step 3: Wrap each summary card in `TouchableOpacity` with a chevron**

Locate the `summaryRow` block (lines 192-229). Replace both `<View style={styles.summaryCard}>` wrappers with:

```tsx
<TouchableOpacity
  style={styles.summaryCard}
  onPress={openDrillDown}
  activeOpacity={0.7}
  accessibilityRole="button"
  accessibilityLabel={t('analytics.viewExpenses')}
>
```

Close each with `</TouchableOpacity>` instead of `</View>`.

Inside each card, wrap the `summaryLabel` Text in a row that also contains the chevron. Replace:

```tsx
<Text style={styles.summaryLabel}>{t('analytics.totalSpent')}</Text>
```

with:

```tsx
<View style={styles.summaryCardHeader}>
  <Text style={styles.summaryLabel}>{t('analytics.totalSpent')}</Text>
  <Ionicons
    name="chevron-forward"
    size={14}
    color={theme.colors.textTertiary}
    style={styles.summaryCardChevron}
    accessible={false}
  />
</View>
```

Do the same for the second card — replace:

```tsx
<Text style={styles.summaryLabel}>{t('analytics.avgPerDay')}</Text>
```

with the identical header View (reuse the same styles) but keep the label translation key as `analytics.avgPerDay`.

- [ ] **Step 4: Add new style entries**

In the `createStyles` function, inside the returned object, add two new entries (place them right after `summaryLabel` around line 725-730):

```ts
  summaryCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[2],
  },
  summaryCardChevron: {
    opacity: 0.6,
  },
```

Because `summaryLabel` originally had `marginBottom: theme.spacing[2]` (used to separate it from the value), removing that margin is cleaner — the new `summaryCardHeader` wrapper now owns the bottom margin. Update `summaryLabel` to remove `marginBottom: theme.spacing[2]` (the header wrapper handles spacing now).

- [ ] **Step 5: Verify typecheck**

Run from `apps/mobile/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Manual smoke test**

From `apps/mobile/` run `npx expo start --web`. On the Analytics tab:

- Each of the two top cards shows a small chevron in the top-right of the header
- Tapping "Total spent" opens `/analytics/drill-down` with the correct period
- Tapping "Avg per day" opens the same drill-down
- The bar chart below still drills correctly (regression)
- Switching range (week/month/year) changes the drill-down period correctly
- Switching currency filter passes the new currency through
- VoiceOver (if available on dev machine) announces "View expenses, button"

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/(tabs)/analytics.tsx
git commit -m "feat(mobile): make analytics summary cards drill into expenses"
```

---

## Task 4: Full integration verification

**Files:**
- No code changes.

- [ ] **Step 1: Typecheck + lint from repo root**

```bash
npm run typecheck
npm run lint
```

Expected: typecheck clean. Lint may show pre-existing warnings in unrelated files; only fix new warnings introduced by this change.

- [ ] **Step 2: Manual test plan (from spec § Manual test plan)**

Run `npx expo start --web` from `apps/mobile/`. Walk through each bullet:

- [ ] Tap "Total spent" → drill-down opens for current period
- [ ] Tap "Avg per day" → identical drill-down opens
- [ ] Change range to week / month / year → cards still tappable; drill-down reflects range
- [ ] Change month via `</>` picker → cards open drill-down for newly selected period
- [ ] Toggle currency filter → drill-down opens with filtered currency
- [ ] Period with zero transactions: tap a card → drill-down opens and shows empty state, no crash
- [ ] Chevron icon visually matches `textTertiary` tone
- [ ] Bar chart drill-down still works (regression)

- [ ] **Step 3: Final commit (only if follow-up fixes were needed)**

If Step 1 or 2 surfaced issues, fix and commit with a descriptive message. Otherwise skip.

---

## Out-of-scope reminders

- Do not touch `apps/mobile/app/analytics/drill-down.tsx`, `useDrillDown`, or `useAnalytics`.
- Do not add drill-down entry points to other widgets (AI insights, tag chart, project chart, bottom insight cards) in this task — those are separate features.
- Do not add unit tests for screens.
- Do not add a secondary "Tap to explore" hint text on the cards; the bar chart already uses one and duplicating visually adds noise.
- Do not change the drill-down params contract.
