# Desktop Web: the Reference Screen — Design

The web app is a real acquisition channel, and it looks like a stretched phone. The
product owner's words: "сразу видно что мобильная версия как будто". This spec
covers **one screen**, deliberately: the transactions list becomes the reference
that establishes the desktop design language, and the remaining screens follow it
only once it is approved in the product. Disagreement then costs one screen
instead of eight.

This is sub-project **F** of the web programme. **D** (product telemetry) shipped
as ABA-497; **E1/E2** (desktop file input, keyboard and focus) are deliberately
sequenced *after* this, because both are polish inside whatever layout exists and
doing them first means doing them twice. **E4** (tokens in `localStorage`) is
carved out entirely — it is a security decision with an API-side consequence, not
UX polish, and bundling it here would either rush it or block this.

## What already exists

- **Desktop shell, ABA-289/290**: `WebShell` → `DesktopShell` renders a full-width
  top bar plus a 240px sidebar and a full-width content area, gated on
  `Platform.OS === 'web' && width >= 1024` (`webLayout.constants.ts`,
  `DESKTOP_MIN_WIDTH = 1024`). Off-desktop, `WebShell` returns its children
  byte-for-byte — that is the existing mobile guarantee and this spec does not
  touch it. What the shell does **not** do is change anything *inside* a screen.
- **Theming, ABA-372**: the user picks an accent, and `deriveAccent.ts` maps that
  one colour onto 10 brand tokens plus a contrast-chosen on-accent foreground.
  There are 13 selectable accents.
- **`app/(tabs)/expenses.tsx` is 1009 lines** with 8 `useState` and 16 hook calls,
  reading `expenseStore`/`incomeStore` directly and filtering inline. There is no
  shared data hook.
- **`ExpenseDetailsCard`** (`app/expense/components/`, 806 lines) is a
  `forwardRef` component exposing `ExpenseDetailsCardHandle.triggerSave()`, so the
  hosting screen owns the Save button. `app/expense/[id].tsx` is already a thin
  coordinator around it.
- **Platform-split precedent is component-level, not route-level.** Five
  `.web.tsx` files exist under `src/components/` (`DatePicker`, `ExpenseMapView`,
  `ShareImageCard`, and two share cards). **No route file under `app/` has a
  `.web.tsx` sibling.** Checked, not assumed.
- **No render-test dependency.** There is no `react-test-renderer` /
  `@testing-library/react-native`, so no component in this repo is rendered in CI.
  Precedent for testing screen logic is to put it in a pure module —
  `features/debts/debtDisplay.ts`, `features/reports/reportDateRange.ts`.

## Locked decisions

1. **A separate desktop layer, not desktop branches inside shared components.**
   The product owner chose this over "one component, two branches", accepting
   duplication in exchange for mobile being unreachable in principle. The cost is
   real and is paid per screen — which is why this spec covers one screen.

2. **The split is at the component level, and the route file stays single.**
   `app/(tabs)/expenses.tsx` remains one file and renders a platform-split
   component. Reason: every platform split in this repo is component-level, and
   route-level platform resolution in expo-router is unverified here. A single
   route file also keeps `_layout.tsx`'s registration untouched.

3. **The chosen layout: facet rail + summary strip + day-grouped table.**
   Filters become a left rail of facets with counts instead of a horizontal pill
   row; a summary strip above the table reports the filtered set; rows are grouped
   by day with a per-day subtotal.

4. **A detail opens in a desktop dialog, not a side panel and not a bottom sheet.**
   A third column was rejected on arithmetic, not taste: sidebar 208 + facet rail
   216 already consume 424px, so a detail column would take its width from the
   table the layout was chosen for. A bottom sheet was rejected because it is one
   of the tells that this is a phone.

5. **The dialog is a shell around the existing `ExpenseDetailsCard`, never a
   second detail implementation.** Its footer's Save calls
   `handle.triggerSave()`, exactly as `expense/[id].tsx` does. This is the
   decision that bounds the cost of decision 1: the desktop layer duplicates
   *layout* and never *behaviour*, so the two cannot drift on what an edit does.

6. **Three width regimes, one of which is "unchanged".**
   `< 1024` renders today's mobile view, byte-for-byte, on web as well as native.
   `1024–1439` renders desktop with the facet rail collapsed to a labelled
   dropdown. `>= 1440` renders desktop with the rail expanded. The middle regime
   exists because the shell's own threshold is already 1024 and the rail does not
   fit there next to a five-column table; it is the one place the layout concedes,
   and it concedes predictably.

7. **The desktop layout must survive all 13 accents and both themes.** Not an
   aesthetic note — a correctness one. Any layout that hard-codes a brand colour
   is broken for a user who picked green, and any surface whose colour lives only
   in a dark-mode block is broken in the un-stamped system state. Colours come
   from the theme, as they already do on mobile.

8. **Desktop shows expenses and income in ONE table; the mobile tab becomes a
   facet.** The mobile screen carries `activeTab: 'expenses' | 'incomes'` and
   swaps its whole list, its category set and its loader on it
   (`expenses.tsx:47,88,94,137,175`). On desktop a horizontal tab pair spends the
   width the layout was chosen to give the table, and a ledger that cannot show
   a salary next to the week's spending is answering a narrower question than the
   screen is for. So the two streams share the table — income rendered in the
   success colour, its sign explicit — and the mobile tab becomes a facet
   ("Расходы / Доходы / Всё"). Two consequences the implementation must honour:
   `filterConsumption()` still governs which expense rows count (a split
   receivable is not spend), and a day's subtotal is expenses only, because a
   subtotal that nets a salary against groceries reports neither.

9. **The 1009-line screen is split before the desktop view is written, not
   after.** A shared `useExpensesScreenData` hook takes the stores, the filters,
   the search, the active tab and the derived lists/totals; mobile then renders
   exactly what it renders today, from the hook. Without this the desktop view
   would duplicate the filtering logic, and decision 5's whole point — duplicate
   layout, never behaviour — would be lost on the first screen.

## What each mobile affordance becomes

| Mobile today | Desktop | Why |
|---|---|---|
| Horizontal pill row (`ExpenseFilterBar`, 521 lines) | Facet rail with counts | The pill row is the single loudest "this is a phone" element on the screen |
| Long-press → `TransactionActionSheet` → "Select multiple" | Checkbox column, appearing on row hover; shift-click extends a range | Long-press has no desktop equivalent; the action sheet's other items become a row context menu |
| FAB | "+ Расход" in the screen's top bar | The shell already owns a top bar |
| Search behind a toggle icon | Always-visible input in the top bar | Horizontal space is not scarce |
| List/Map toggle | Kept as-is | `ExpenseMapView` already has a web variant |
| Tap row → navigate to `expense/[id]` | Dialog over the table | Decision 4 |
| Bottom sheets | Centred dialogs | Sheets are a phone idiom; and the repo already has a documented bug class where a sheet's last row lands under the system nav bar (ABA-483) — a dialog has neither problem |

## File structure

```
app/(tabs)/expenses.tsx                        thin: hook + <ExpensesView/>
src/features/expenses/useExpensesScreenData.ts shared state and derived data (decision 9)
src/features/expenses/desktopTable.ts          PURE: day grouping, day totals,
                                               facet counts, filtered summary
src/components/expenses/ExpensesView.tsx       native: renders ExpensesMobile
src/components/expenses/ExpensesView.web.tsx   web: width-gated mobile | desktop
src/components/expenses/ExpensesMobile.tsx     today's JSX, extracted unchanged
src/components/expenses/desktop/
  ExpensesDesktop.tsx                          rail + summary + table + dialog
  FacetRail.tsx                                facets with counts; collapsible
  TransactionTable.tsx                         day groups, day totals, hover,
                                               checkbox column, tabular-nums
  SummaryStrip.tsx                             filtered totals
  ExpenseDialog.tsx                            shell hosting ExpenseDetailsCard
```

`ExpensesMobile.tsx` is imported by both platform files, so the mobile rendering
has exactly one definition. `ExpensesView.web.tsx` is the only file that decides
between mobile and desktop, and it decides on width alone.

## Testing

The layout itself cannot be tested here — nothing renders a component in CI — so
the spec puts every decision that *can* be wrong into `desktopTable.ts` and tests
that:

- day grouping preserves the store's ordering and emits one group per calendar day
- a day's subtotal excludes income, and excludes split-receivable rows (the
  `isSplitReceivable` rule that seven client surfaces already share — a day total
  that double-counts a bill split would be the same defect class as ABA's
  receipt-split accounting)
- facet counts reflect the *other* active facets, not the unfiltered set, or the
  numbers beside each facet contradict the list they filter
- the summary strip's totals are per-currency and never blended, matching the
  rule the rest of the app already follows
- an empty filtered set produces a summary of zeroes rather than `NaN`
- `rangeBetween(anchorId, targetId, visibleIds)` returns the inclusive range in
  **visible** order, works in both drag directions, is a single id when the
  anchor and target match, and returns nothing when either id is not in view —
  shift-click is the one genuinely new interaction in this screen, and off-by-one
  or direction errors in a bulk selection over money rows are the kind of bug
  that gets noticed after a bulk delete rather than before it

The dialog's Save path is not re-tested: it is `ExpenseDetailsCard`'s existing
behaviour, reached through its existing handle.

Verified by eye on the deployed web app, and stated as such rather than pretended
otherwise: the three width regimes, the accent sweep across all 13 presets, both
themes, and the dialog's focus trap and `Esc`.

## Accessibility, as a hard requirement rather than a note

The dialog is the first true modal in this app. It gets `role="dialog"`,
`aria-modal`, focus moved in on open and restored on close, a focus trap, `Esc`,
and a scrim click that closes. Rows are reachable by keyboard and the table's sort
controls are real buttons. This is in the spec because a dialog that traps focus
badly is worse than the navigation it replaced.

## Out of scope

- The other screens. They follow only after this one is approved in the product.
- **E1** (drag-and-drop and paste for receipts and imports) and **E2** (keyboard
  and focus polish) — sequenced after, deliberately.
- **E3** (a shortcut registry with a help overlay) — its own subsystem.
- **E4** (tokens in `localStorage`) — a security task, not this.
- Real local persistence on web (`db/client.web.ts` is an in-memory mock) — that
  is sub-project **A**, and this screen keeps reading whatever the stores give it.
- Any change to the mobile rendering. If the mobile view changes, this spec has
  been implemented wrongly.

## What we do not know

- **Which screens actually deserve this treatment.** ABA-497's telemetry shipped
  hours before this spec and has no data yet. The transactions list was chosen on
  the product owner's judgement plus the fact that a card list is the most visible
  mobile tell. Once the funnel has a week of data, the follow-up order should be
  read from it rather than from this spec.
- **Whether a table beats cards for this audience.** The mockups were judged by
  the product owner, not by users. The layout is a reference to be approved in
  the product, and that is the point of doing one screen first.
- **Where the 1024–1439 regime actually hurts.** The rail collapse is a
  prediction; the deployed screen will say whether that band needs more than a
  dropdown.
