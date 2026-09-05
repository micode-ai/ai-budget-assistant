# Analytics Desktop Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Analytics tab a real desktop layout on `app.ai-budget.pl` at `>=1024px`, following the language the transactions reference screen established.

**Architecture:** Same shape as the transactions screen. The route file stays single; one component-level platform split decides mobile vs desktop on width alone; the mobile JSX keeps exactly one definition. The desktop layer duplicates *layout* and never *behaviour* — every computation stays in the shared hooks it already lives in.

**Tech Stack:** Expo Router, React Native Web, `react-native-gifted-charts`, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-05-analytics-web.md`
**Language:** `docs/contracts/desktop-web-design-language.md` — read both. The language doc's section 6 lists what looks like a defect and is not.

## Global Constraints

- **The mobile rendering must not change.** `AnalyticsMobile.tsx` becomes its single definition and both platform files import it. If the phone's Analytics tab looks or behaves differently, this plan was implemented wrongly.
- **The redundant sentence cards are dropped on DESKTOP ONLY.** The product owner approved removing them; the argument for removal — that a wide screen shows two answers to one question at once — does not hold on a phone, and the rule above forbids it anyway.
- **No computation is moved, merged or deleted.** Every resolution in the spec moves or drops *presentation*. `useAnalytics` and its sub-hooks are read-only for this plan.
- **Nothing under `src/` may import from `app/`.**
- **Every colour, spacing and text style from `useTheme()` tokens.** 13 accents are mapped onto brand tokens at runtime; `success`/`danger`/`warning`/`onSemantic` are not accent-derived, and `textInverse` is.
- **No new dependency.**
- **All nine locales** (`en, ru, pl, de, es, fr, ua, be, nl`) for any new key. Reuse an existing key where one genuinely fits.
- **`InteractiveLineChart`'s SVG wrapper must stay auto-height with `overflow: hidden`.** A fixed height hides the below-axis negative region. Documented trap; do not touch it.
- The suite stands at **884 tests across 103 suites**. Record what it actually reports; never predict a number.

---

### Task 1: Split the Analytics screen

**Files:**
- Create: `apps/mobile/src/features/analytics/useAnalyticsScreenData.ts`
- Create: `apps/mobile/src/components/analytics/AnalyticsMobile.tsx`
- Create: `apps/mobile/src/components/analytics/AnalyticsView.tsx`
- Create: `apps/mobile/src/components/analytics/AnalyticsView.web.tsx`
- Modify: `apps/mobile/app/(tabs)/analytics.tsx`

**Interfaces:**
- Produces: `useAnalyticsScreenData()` returning the screen's state and derived data; `AnalyticsMobile` taking whatever that hook returns via its own call (no props).
- Consumes: the existing `useAnalytics`, `usePeriodNavigation` and section components, unchanged.

- [ ] **Step 1: Extract, do not rewrite**

Read `src/features/expenses/useExpensesScreenData.ts` and `src/components/expenses/ExpensesMobile.tsx` first — this is the same operation on a different screen, and the result should look like its sibling.

The route's state and effects move into the hook; its JSX moves into `AnalyticsMobile` unchanged. Every line that leaves `app/(tabs)/analytics.tsx` must reappear. If you find yourself improving something while it moves, don't — note it in your report instead.

- [ ] **Step 2: The platform pair**

`AnalyticsView.tsx` renders `AnalyticsMobile`. `AnalyticsView.web.tsx` renders `AnalyticsMobile` below `DESKTOP_MIN_WIDTH` and (for now) `AnalyticsMobile` above it too — the desktop component arrives in Task 4, and a stub that renders nothing would leave the screen blank on every desktop browser in the meantime.

`app/(tabs)/analytics.tsx` becomes a thin host rendering `<AnalyticsView />`.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
```
A pure move must not change the test count. Then read the diff of `app/(tabs)/analytics.tsx` and confirm every line that left it reappears.

```bash
git add apps/mobile/src/features/analytics apps/mobile/src/components/analytics apps/mobile/app/\(tabs\)/analytics.tsx
git commit -m "ABA-501 Extract the analytics screen's state so a second view can share it"
```

---

### Task 2: Let the bar chart measure its own container

**Files:**
- Modify: `apps/mobile/src/components/interactive-charts/InteractiveBarChart.tsx`

**Why:** `useContentWidth()` returns a window-derived width capped at `CONTENT_MAX_WIDTH`. That is right for a single-column screen and wrong the moment a chart sits in one track of a multi-column grid, where its width is its container's, not the window's. `InteractiveLineChart` already measures its own container elsewhere in this repo — follow that, do not invent a second approach.

- [ ] **Step 1: Measure instead of deriving**

Switch the chart to an `onLayout`-measured width of its own wrapper, falling back to its current behaviour until the first measurement arrives so it never renders at zero width.

**This component is rendered by the MOBILE screen too.** On mobile its container is the full content column, so the measured width should equal what `useContentWidth()` gave it. Confirm that rather than assuming it, and say in your report how you confirmed it.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
```

```bash
git add apps/mobile/src/components/interactive-charts/InteractiveBarChart.tsx
git commit -m "ABA-501 Measure the bar chart's own container instead of the window"
```

---

### Task 3: One generic breakdown card

**Files:**
- Create: `apps/mobile/src/components/analytics/desktop/BreakdownCard.tsx`

**Why:** `CategoryBreakdown`, `MerchantBreakdown`, `TagBreakdown`, `ProjectBreakdown` and `IncomeCategoryBreakdown` are near-identical — a donut plus a row list. The desktop needs them in a grid; adding a sixth copy is the wrong answer.

- [ ] **Step 1: Build it desktop-only**

Take the data it renders as props (title, slices, an optional per-row delta chip, an optional colour palette) so it holds no knowledge of which breakdown it is showing. **Do not touch the five mobile components** — they keep rendering the phone layout, and changing them is the one thing this plan forbids.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/analytics/desktop
git commit -m "ABA-501 Add one generic breakdown card for the desktop grid"
```

---

### Task 4: The desktop layout

**Files:**
- Create: `apps/mobile/src/components/analytics/desktop/AnalyticsDesktop.tsx`
- Modify: `apps/mobile/src/components/analytics/AnalyticsView.web.tsx`

**Interfaces consumed:** `useAnalyticsScreenData` (Task 1), `BreakdownCard` (Task 3), the existing section components.

- [ ] **Step 1: Build to the spec's wireframe**

Follow `docs/design/2026-09-05-analytics-web.md`'s "Wireframe, >=1440px" and "What changes at 1024–1439". The control row is fixed; the rest is one page scroll. No facet rail — nothing here is a row.

**Drop, on desktop only:** the "top category" sentence card and the "highest spending day" sentence card, and the Anomalies list as a top-level section. The top-category information becomes a fourth stat tile in the summary strip. The computations stay where they are; only the presentation moves.

- [ ] **Step 2: Wire the gate**

`AnalyticsView.web.tsx` renders `AnalyticsDesktop` at `>=DESKTOP_MIN_WIDTH` and `AnalyticsMobile` below it. That file remains the only place the decision is made.

- [ ] **Step 3: Verify**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```
Grep the built bundle for `AnalyticsDesktop` — a `.web`-reachable file that fails to bundle is invisible to both `tsc` and Jest.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/analytics
git commit -m "ABA-501 Lay out the analytics screen for a desktop window"
```

---

### Task 5: The Inflation Index product detail becomes a dialog

**Files:**
- Create: `apps/mobile/src/components/analytics/ProductDetailSheet.tsx`
- Modify: `apps/mobile/src/components/analytics/InflationIndexSection.tsx`
- Modify: `apps/mobile/src/components/analytics/desktop/AnalyticsDesktop.tsx`

**Why:** its per-product detail is a bottom sheet written as inline JSX, so nothing can host it. Extract it first — the same rule that made the detail cards hostable.

- [ ] **Step 1: Extract, then host**

Move the inline sheet into its own component with no behaviour change, have `InflationIndexSection` render it exactly as before, and have the desktop host it as a centred dialog. A sheet is a phone idiom; on desktop it is a dialog.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/analytics
git commit -m "ABA-501 Extract the product detail so desktop can host it as a dialog"
```

---

### Task 6: Verification, docs, and the issue

- [ ] **Step 1: Look at it**

On the deployed or locally served build at `>=1440` and at `1200`: both themes, several accents, the breakdown grid, the fixed control row, and every state (empty, loading, populated, error). Report the worst accent and why.

- [ ] **Step 2: Confirm the phone is untouched**

Below 1024, the browser must render exactly what it rendered before this plan.

- [ ] **Step 3: Update the language doc**

`docs/contracts/desktop-web-design-language.md` was written from one screen. Add what this second screen established or contradicted — especially anything that turned out to be list-specific after all. Remember it is gitignored: `git add -f`.

- [ ] **Step 4: The issue**

Create `ABA-501` — English, Problem / Implementation / Out of scope. Name the dropped sentence cards explicitly as a product decision, not a layout one.

- [ ] **Step 5: Full verification**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd ../admin && npx tsc --noEmit
cd ../.. && bash scripts/build-web.sh
```

---

## Deployment notes

- This work stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA to `app.ai-budget.pl` with no separate step and no feature flag — a push IS a release, and it is the product owner's call.
- Nothing here requires a mobile release. Metro resolves `AnalyticsView.tsx` -> `AnalyticsMobile.tsx` for native.
- If an extraction is wrong, the symptom appears on **mobile**, which is the heavily used path. Weight the verification accordingly.
