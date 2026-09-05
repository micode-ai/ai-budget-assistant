# Desktop Web Design Language

**Status:** derived from one shipped screen — the transactions list (ABA-499),
approved in the product on 2026-09-05. Everything here is what that screen
actually does, not what a design document wishes it did.

**Sample size caveat, stated once and meant:** one screen is a thin sample.
Rules below are split into **Universal** (the chrome and interaction model, which
every screen inherits) and **List-specific** (which exist because a ledger has
rows, and must not be carried to a screen that has none). Where a rule is a
prediction rather than a proven result, it says so.

**Scope:** the web build only, at `>= 1024px`. Below that, and on native, the
mobile rendering is unchanged and must stay that way — see the
`feature_mobile_web_must_not_break_each_other` rule.

---

## 1. The gate

- `DESKTOP_MIN_WIDTH = 1024` and `FACET_RAIL_MIN_WIDTH = 1440` live in
  `src/components/webLayout.constants.ts`. Read them; do not re-declare a
  breakpoint.
- **Exactly one file per screen decides mobile vs desktop**, on width alone —
  `ExpensesView.web.tsx` is the pattern. Its native sibling imports only the
  mobile view, so Metro's native graph never reaches desktop code.
- The route file under `app/` stays single. Every platform split in this repo is
  component-level; route-level resolution in expo-router is unverified here, and
  one route file keeps `_layout.tsx`'s registration untouched.
- The mobile JSX has **exactly one definition** (`ExpensesMobile.tsx`), imported
  by both platform files. If the mobile rendering changes, that is a bug.

## 2. Universal — the chrome

- **Navigation lives in the top bar, not a left column.** `WebSidebar` takes an
  `orientation` prop rather than existing twice; two navs drift the first time a
  screen is added to one and not the other. The content area spans the full
  window width.
- **No page title beside the brand.** The active nav item already says where you
  are.
- **One page scroll per screen.** Not a scroller per pane. Filters and content
  move together under the window's own scrollbar.
- **The table header row is pinned** with `position: sticky`, not by giving the
  table its own scroller. A horizontal `ScrollView` is a CSS scroll container on
  *both* axes, so a sticky header inside one anchors to it and never sticks —
  which is why the transactions table renders its columns in a plain `View`.
- **Never hide a scrollbar to make the page look calmer.** That removes the
  affordance, not the cause. If two scrollbars look wrong, there is one scroller
  too many.
- **The browser's own chrome follows the app theme** via `color-scheme` on the
  document element, set by `ThemeContext` from `isDark`. This is the
  standards-based lever; styling `::-webkit-scrollbar` covers one engine and
  still leaves the caret and form controls wrong.
- **Every container paints its own background.** A transparent tree shows React
  Navigation's `rgb(242,242,242)` default through it — light grey under
  dark-theme text. This shipped once and was invisible to types, tests and three
  reviews.

## 3. Universal — dialogs

- **A detail or a form opens in a centred dialog, not a new screen and not a
  bottom sheet.** A sheet is a phone idiom, and this repo has a documented bug
  class where a sheet's last row lands under the system navigation bar.
- **A dialog HOSTS an existing component; it never reimplements one.** Save calls
  the component's `triggerSave()` through a ref, exactly as the route screen
  does. This is the rule that stops the desktop layer drifting from mobile on
  what an edit actually does. If the component lives under `app/`, move it to
  `src/` first — `src/` cannot import from `app/`, and the move also removes a
  phantom expo-router route.
- **Host everything the route hosts.** A dialog that replaces navigation to a
  screen makes anything it omits unreachable. The detail dialog shipped twice
  missing content that lived *around* the card rather than in it — the receipt,
  location and item sections, and then the amount itself.
- **Build on RN's own `Modal`.** It supplies `role="dialog"`, `aria-modal`, the
  `Escape` handler, the focus trap and focus restoration; all of that was
  verified against react-native-web's source. Do not hand-roll them.
- **The scrim is a raw `<div>`, never a `Pressable`.** A `Pressable` always emits
  a `tabIndex`, which makes the invisible scrim the focus trap's first target.
- **Use `showAlert`, never `Alert.alert`.** react-native-web stubs `Alert.alert`
  to a no-op, so a confirmation written that way simply never appears on the one
  platform this runs. On web `showAlert` now renders an in-app themed dialog
  (`AlertDialogHost`), not a browser box.

## 4. Universal — colour and type

- Every colour, spacing value and text style comes from `useTheme()`. The user
  picks one of 13 accents which are mapped onto brand tokens at runtime, so a
  hard-coded brand colour is a bug and a colour defined for only one theme is a
  bug in the other. Dark's ground is `#000000` with `#1A1A1A` surfaces.
- **`textInverse` is accent-derived.** On a semantic fill (danger, success) use
  `onSemantic`, which is always white — otherwise a green accent turns the text
  on a red button green.
- Money and dates carry `fontVariant: ['tabular-nums']` wherever they line up in
  a column.
- Wide content scrolls inside its own container; the page body never scrolls
  sideways.

## 5. List-specific — proven on the ledger, not automatically portable

These exist because a ledger has rows. A screen without rows should not inherit
them by analogy.

- **Filters are a left rail of facets with counts**, not a horizontal pill row.
  Counts are computed against the *other* active facets (`countsForFacet`), or
  the number beside a facet contradicts the list it produces.
- **Union within a group, intersection across groups.** No row kind is exempt
  from a group. Where a kind genuinely lacks a field (income has no merchant) it
  fails that constraint rather than passing it vacuously.
- **Rows are grouped by day with a subtotal**, and the subtotal is expenses only
  — one that nets a salary against groceries reports neither.
- **Totals are per-currency and never blended.** This app performs no FX inside a
  ledger total.
- **Selection is a checkbox column plus shift-click**, revealed on hover and kept
  once anything is selected. A row menu opens on right-click *and* from a
  keyboard-reachable button — a right-click-only affordance is unreachable
  without a mouse.
- Below `FACET_RAIL_MIN_WIDTH` the rail collapses to a labelled dropdown that
  states how many facets are active, so nothing filters silently.

## 6. Things that look like defects and are not — do not "fix" these

- The empty first cell in the transactions table is deliberate indentation under
  the day-group header's date, not a value that failed to render.
- The income dialog is thinner than a receipt-rich expense dialog. That reflects
  a real data asymmetry.
- `IncomeDetailsCard` owns its own amount and `ExpenseDetailsCard` does not.
  Do not "align" them; the expense screen draws its amount outside the card, and
  moving either one changes the mobile rendering.
- `IncomeDetailsCardHandle.triggerSave` returns `void` while the expense one
  returns `Promise<void>`. Neither type may be widened to match the other.
- There is no account facet: the store is account-scoped, so it would offer one
  option.

## 7. What is unproven

- **Which screens deserve this treatment, and in what order.** ABA-497's
  telemetry exists but has no data yet and is not deployed. The next screen was
  chosen by judgement.
- **Whether a table beats cards for this audience.** Judged by the product owner,
  not by users.
- **The 1024–1439 band.** The rail collapse is a prediction; the deployed screen
  will say whether a dropdown suffices.
- **Light theme and the two narrow width regimes** on the reference screen —
  checked by the product owner by eye, not by any automated means. Nothing in
  this repo renders a component in CI, so layout, hover, focus and theme
  legibility are only ever verified that way.
