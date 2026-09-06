# Desktop Web Design Language

**Status:** derived from two shipped screens — the transactions list (ABA-499),
approved in the product on 2026-09-05, and Analytics (ABA-501), which followed
it. Everything here is what those screens actually do, not what a design
document wishes they did.

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

## 5a. What the second screen added

Analytics was built from this document and confirmed most of it. What it
established that one screen could not:

- **A section both platforms render takes a `desktop?: boolean` prop that
  defaults to `false`.** The mobile call site passes nothing and therefore
  keeps its layout *by construction*, not by discipline. This is the cheapest
  way to reflow a shared section, and it is what `InflationIndexSection` does.
- **`useContentWidth()` is for single-column screens only.** It derives a width
  from the window and caps it. The moment a chart sits in one track of a grid,
  its width is its container's — measure with `onLayout` and keep the old
  formula as the pre-measurement fallback so it never renders at zero width.
- **`Alert.alert` no-ops on react-native-web.** This has now been found twice,
  in unrelated code. Any confirmation reachable from the web build must use
  `showAlert`, and content moving from a phone-only path onto a desktop path
  should be checked for it.
- **List-specific really is list-specific.** Analytics inherited the chrome,
  the dialogs and the scroll model, and inherited none of the facet rail, day
  grouping or selection. It also blends currencies via FX in its totals, unlike
  the ledger — that rule is filed under List-specific for exactly this reason,
  and Analytics' behaviour there is pre-existing and unchanged.
- **Redundancy is a desktop problem before it is a design problem.** A screen
  that answers one question in three places is invisible on a phone, where you
  never see two answers at once. Resolve it by choosing a leader and moving or
  dropping *presentation* — never by merging computations, which can
  legitimately disagree. Drop duplicates on desktop only: the argument does not
  hold on a phone, and the mobile rendering may not change regardless.

## 5b. Verifying the platform split, and how to read the result

After each desktop screen, confirm the desktop code is genuinely absent from
the app users install. `tsc` and Jest pass either way, so this is the only
check that can catch a leak:

```bash
cd apps/mobile && npx expo export --platform android --output-dir /tmp/native-check --clear
grep -c <YourDesktopComponent> /tmp/native-check/_expo/static/js/android/index-*.hbc   # expect 0
```

**Read a non-zero result carefully before believing it.** The grep matches a
substring of the Hermes string table, so a short component name can collide
with a legitimate mobile one — `BudgetCard` returned 1 purely because the home
screen has a `MonthlyBudgetCard`. Confirm what actually matched before
concluding anything leaked.

Two results that are correct and should not be "fixed": `WebShell` appears
because its native no-op file is real code, and any component whose name is a
substring of a mobile component's will match.

## 5c. What the dashboard added (screen four)

The dashboard is the landing screen and the first one built around a
third-party chart. Most of what it taught is about not trusting numbers.

- **The dashboard carries abundant information.** A standing product
  direction, not a preference of this screen: density is wanted. It does not
  license one dominant element — a hero whose chart took 40% of the viewport
  was rejected. Shrinking an element is not removing information, and freeing
  vertical space is only worth it if something fills it.
- **A `height` prop is not always the drawn height.** `react-native-gifted-charts`
  draws its below-axis region *beyond* `height`, scaled by
  `noOfSectionsBelowXAxis` (1-4, decided by the data), plus a hardcoded `+10`.
  So one prop value renders between 1.25x and 2.0x depending on whose account
  is open. Invert the formula so the prop is a true total, and write acceptance
  criteria against the **measured** wrapper, never the prop.
- **A constant gap means a stale measurement; a proportional gap means a
  formula error.** The same chart was clipped by ~661px in one build and ~662px
  in another whose card width differed. That constancy was the whole diagnosis:
  the library animates the wrapper's width once, from an `Animated.Value` in an
  effect whose deps never include the width, so on web — where a flex child's
  first layout pass reports a narrower width than the settled one — the wrapper
  locks narrow forever while the drawn path keeps tracking the true width.
  Disable the reveal animation on the desktop (`compact`) path.
- **A harness number is not a product number until the two have agreed once.**
  Two harnesses in a row reported "no overflow" on a visibly clipped chart: the
  first re-implemented the layout instead of rendering the component, the second
  rendered it but with seeded data that never reproduced the real render
  sequence. Measure in a real browser on the deployed build, and label harness
  figures as harness figures.
- **Never serve the verification browser from a directory an agent rebuilds.**
  `apps/mobile/dist` is rebuilt by `scripts/build-web.sh`, which bakes the
  production API URL. A whole "the selected account resets on refresh"
  investigation turned out to be a bundle an agent had rebuilt underneath the
  browser. Build to a private output directory and serve that.
- **Fixed slots are a departure and must be counted out loud.** Widget
  visibility and order are user-configurable; the desktop focus column
  overrides that for a named set. It is five widgets today. Each addition is a
  product decision, not an implementation detail.

Two findings this screen surfaced that the next one has to handle:

- **A zero from the server is not the same as no data.** `useSafeToSpend`
  treats `data !== null` as "enough data", and the API answers an empty account
  with real zeros — so a new user is told their safe-to-spend is `0,00`, which
  is a false statement rather than a blank. The same error draws five absent
  months as a flat line at zero.
- **On web, a silently failed pull is indistinguishable from an empty
  account.** `_doPullAndMerge` swallows a failure with `console.warn` and sets
  no flag, and SQLite is a mock, so `expenses.length === 0` means either. Any
  empty-state or first-run decision on web needs a three-valued predicate —
  wait / show / suppress — because a boolean reads an offline first paint as a
  brand-new user.

## 5d. What the retention/onboarding pass added

The dashboard's second pass. Its subject was not layout but **honesty about
what the app knows**, and most of what it taught generalises.

- **A zero from the server is not the same as no data — and the fix belongs at
  the desktop call site, not in the hook.** `useSafeToSpend.hasEnoughData` is
  `data !== null`, and the API answers an empty account with real zeros, so the
  contract is genuinely wrong. But `HomeHeroHeader` renders that same hook on
  the phone, so correcting it there changes the mobile rendering. Gate at the
  call site; the contract stays open and needs a store release.
- **On web, a silently failed pull is indistinguishable from an empty
  account**, because SQLite is a mock and `_doPullAndMerge` swallows a failure
  without setting a flag. Any first-run or empty-state decision there needs a
  **three-valued** predicate — wait / show / suppress. A boolean reads an
  offline first paint as a brand-new user, and the asymmetry decides the
  default: showing an established user "add your first expense" is the harm;
  showing a new user today's empty dashboard is merely today's behaviour. Bound
  the wait (~5s) so a permanently failing pull cannot sit in it forever.
- **An account-scoped read must not be issued before the account is known.**
  `AccountContextGuard` falls back to `req.user.defaultAccountId` when the
  header is absent, so a request that outruns account resolution returns
  *another account's money* and the client caches it. Measured, not theorised:
  the app's cached hero figure was byte-identical to the header-less response.
  The guard belongs where `walletStore.loadWallet` already puts it —
  capture-then-recheck around the await — not in `HttpClient`, which would hang
  for a user who legitimately has no account.
- **Any MMKV cache of account-scoped data must be keyed by account and cleared
  on sign-out.** `insightsStore` and `inflationShieldStore` were keyed by
  neither; the latter had no `reset()` at all, so its cache outlived the
  session and was read by whoever signed in next on that browser. Teardown goes
  in `logoutAction`'s existing reset block and is **unconditional** — sign-out
  is also reached from a 401 cascade with the tokens already gone, which is
  exactly the case a token-gated teardown would miss.
- **Two states that look like one flag are usually two.** The chart asks "is
  this range worth drawing?"; the range chips ask "is there anything to range
  over at all?" Sharing one boolean produced a dead end — a user narrowed to a
  sparse range lost the control that would widen it back. Give such predicates
  **differently-named destructured inputs**, so swapping them is a compile
  error rather than a silent one, and measure both from one `now`: two memos
  each capturing their own `new Date()` can straddle a month boundary and break
  the subset relation the whole rule rests on.
- **A rule that lives in a `.tsx` cannot be tested.** A derived ceiling is not
  safe merely because it is derived; if its table sits in the component, no
  test can check the predicate is fed the right window.

### Verification lessons, all of them paid for

- **The presence of a string is not a state.** A regex for `12M` over the body
  text matches the chip's *label*; selection lives in the active-style
  attribute. A whole false defect report was written on that mistake.
- **Two identical strings on one page cannot be told apart by a text probe.**
  Reusing an existing i18n key is right, but it costs diagnosability.
- **Disbelieve a grep before deleting what it says is missing.** A raw search
  for locale strings in the built bundle reported five of nine absent — Metro
  escapes non-ASCII as a backslash-u escape.
- **A mutation harness must restore in a `finally`.** One crashed mid-run and
  left a mutation applied to the source; had it crashed on the last mutation
  instead of the first, the defect would have been committed under a green
  suite, because those were the very tests that catch it.
- **Never run a build while an agent is editing the tree**, and never point the
  verification browser at a directory an agent rebuilds.

## 5e. What the settings shell added (wave 1)

Six of seventeen screens, deliberately — the rest stay links until later
waves, which is what keeps the left pane complete and honest from day one.

- **Measure before planning.** Four greps across all 17 settings screens
  decided the shape of the work: none reads `Dimensions` or
  `useContentWidth`, none reads route params, and none uses `Alert.alert`.
  So the extraction was the work and the redesign was one flag per screen —
  the opposite of what "settings looks wrong on desktop" suggests.
- **A screen that looks wrong is often being handed the wrong width.** The
  reported defect was three theme chips at a third of the viewport each;
  the cause was `flex: 1` inside an unbounded parent. Fix it at the
  container, never in the screen: fixing the screen cures one and leaves
  sixteen to be cured the same way.
- **A pane keeps its component mounted** across theme, accent and account
  changes, where a route remounted on every visit. But the shell does not
  *introduce* that defect class, it **inherits** it — `WebTopBar` has
  rendered the account switcher on every authenticated desktop route since
  the web shell shipped, so it changes dwell time, not reachability. And
  `useFocusEffect` does not mitigate it: switching accounts does not change
  focus.
- **Establish "is this account-scoped?" three ways** — what the client
  sends, what the handler reads, what the service touches — never from the
  endpoint's name. Notification preferences sound account-scoped and are
  not; they are twelve `User.notify*` columns behind `req.user.id`.
- **A route's chrome may not be in the route file.** Twice now it was in
  `app/_layout.tsx`, once carrying the only place a paid flow showed its
  remaining quota. Check both, every time.
- **`scrollEnabled` is inert inside a pane**, because the pane branch
  renders a plain `View`. Any prop that only means something to a
  `ScrollView` is silently lost there — say so rather than lose it quietly.
- **Derive a predicate from the registry; never hand-write the list.**
  "Has a pane list beside it" and "loses its stack header" must be the same
  predicate, or a later wave promoting a screen leaves it stranded with no
  way back. The same rule retires a hand-written list before it can drift.

### Reading the native bundle check, properly

A blanket "expect 0" is wrong and will train people to ignore it. After
wave 1 the android bundle legitimately contains the **registry** (pure
data, because `app/_layout.tsx` asks it about headers on both platforms)
and the **native no-op halves** of every platform-split file — that is what
they exist for. What must be absent is the desktop *UI*: `SettingsShell`,
`SettingsNav`, `SettingsOverviewPane`, `WebTopBar`. Grep for those, and
read a non-zero result before believing it.

## 5f. What wave 2 added — and where the habit broke

Three heavier screens, taking the shell from six panes to nine. The
extractions were routine; everything worth recording came from the checks
attached to them.

- **Five identical repetitions create a reflex, and the sixth case differs.**
  Wave 1 swapped five screen roots onto `SettingsScreenScroll` without
  incident. `security`'s root was a `KeyboardAwareScreen`, and the same swap
  would have silently dropped `keyboardShouldPersistTaps`, the on-drag
  dismiss, the keyboard insets on both platforms and the hidden scroll
  indicator — from a form whose buttons sit under two secure inputs. The
  answer was a sibling primitive (`SettingsScreenKeyboardScroll`), not a
  report of the loss. `bots` was then the first root that was
  `SafeAreaView edges={['bottom']}`, established by checking all seven
  predecessors **in git** rather than assuming they were uniform.
- **A pane outlives the user's attention.** `SettingsNav` pushes, and a stack
  push does not unmount the screen beneath, so a pane stays mounted while
  another is read. `bots` came back clean only because it has no poll at all;
  one `setInterval` in that file and it is the microphone case exactly. Its
  component now carries "do not add a poll here" in its doc comment.
- **`useFocusEffect` works only because the selection is the URL.** A shell
  that swapped panes inside one route would have killed every on-return
  refresh silently — which is what retroactively justifies keeping all
  seventeen route files instead of one `_layout.tsx`.
- **Selecting the thing you are already on must be a no-op.** `router.push`
  on the current row stacked a second copy of the pane. The guard reuses the
  row's own `selected` flag, so a row cannot look current without being
  inert. The same defect existed one level up: the top-bar gear pushed a
  second shell from inside settings.
- **Match a pathname exactly, not by prefix, when the guard can disable a
  route.** From `/settings/ai` the gear is the only in-app way back to the
  overview — and to the only sign-out button on desktop web — so a
  `startsWith` guard would have gone dead across the settings area and taken
  signing out with it. The tolerance runs one way: a missed spelling leaves a
  duplicate, a wrong match kills the control.
- **A raw `<div>` earns a file split; an unused RN primitive does not.**
  §5a's runtime `desktop?` prop is right for shared components that render
  React Native primitives — merely unused on the wrong platform. A component
  whose scrim is a `<div>` would *throw* if it ever rendered, so its
  extensionless file is a real no-op and the bundler enforces it, rather than
  a chain of reasoning about which provider sets `desktop: true`.

### Probes go stale — re-derive them, do not reuse them

Wave 2's dialog split was proved with a probe unique to the web file
(`settings.changeEmail.title`), measured **1 before and 0 after**, with two
counter-controls confirming the screen itself was still on the phone. That
evidence was sound when taken and is now worthless: a later commit put the
same key in `app/_layout.tsx` legitimately. Grepping a **component name** is
worse still — the native no-op carries the same name by construction. Before
trusting a bundle probe, check that the string is still unique to the thing
you are probing for.

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
- The Project breakdown shows a donut on desktop that it does not have on the
  phone. The generic card draws one whenever there is data, and a grid where
  one card is visibly different for no reason is worse than that small
  inconsistency.

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
