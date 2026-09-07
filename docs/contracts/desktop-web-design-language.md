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

## 5g. What wave 3 added — reference-data panes, and a measurement that lied

**A pane that outlives a switch is a data-correctness problem, not a layout
one.** `products` and `merchants` loaded once in a mount effect and were
previously remounted on every visit; in a pane they are not. `merchants` also
carried a never-reset `isLoaded`, so a remount alone would not have saved it.
The fix belongs at the value, not the callers: `currentAccountId` is written
from eight places, so one `useAccountStore.subscribe((state, prev) => …)`
clears the caches rather than eight call sites each remembering to. **The phone
had this bug too**, and the commit says so in its first paragraph — as this
branch does for every change that alters the mobile rendering.

**Truncation must be unrepresentable as silent.** `SettingsScreenList` takes
`desktopMaxRows` and `showMoreLabel` as **one prop pair**. A cap with no visible
"+N more" row is a list that lies about its own length, and two separate props
would allow exactly that.

**Route chrome stays in the route.** `products` is the one settings screen with
a `<Stack.Screen>`, and it stays a sibling of `SettingsRoute` rather than moving
into the extracted body: under `src/` it would rename whichever route later
hosts that component.

**Check the root — the previous wave's prediction was wrong in both
directions.** Wave 2 predicted all three of these screens would need
`SettingsScreenKeyboardScroll`. `categories` did not (its root is a bare
`ScrollView`; the `KeyboardAvoidingScreen` import wraps a modal), and `products`
did not either, for the opposite reason (its root is a `FlatList`). A prediction
carried forward from the previous wave is a place to look, never a finding.

### The measurement that lied, and the reasoning that caught it

The products pane rendered ~1,120 rows at once. After the cap, typing measured
160ms and 185ms against 1,228 and 12,303 rendered nodes — which reads as a
~160ms **fixed cost per keystroke** that row count barely affects. It was not.
The node counts labelled the state **before** each keystroke; after the first
character both lists were filtered to similar small sets, so the ten-fold
difference in the labels was never a ten-fold difference in what re-rendered.
**The presence of a string is not a state — and neither is a count taken at a
different moment from the thing being timed.** This doc already recorded the
first half; the person who wrote it walked into the second half in the same
session.

What settled it was a one-line falsification rather than an argument: drive the
input to a query matching ~10 products and time a further keystroke.

```
capped list, 1,228 divs   →  160 ms
narrow query,  116 divs   →    6 ms
```

No floor. Cost tracks rendered rows at ~0.13ms per RNW node, and ~100 capped
rows lands on the 160 almost exactly.

The move that got there first was **concluding, from the absence of a heavy
constant in the render path, that the number had to be mismeasured** — rather
than hunting for a constant to match the claim. That hunt would have found
candidates: two mounted sheets look plausible right up until RNW's
`ModalAnimation` turns out to return `null` when hidden, and one of them would
probably have been "fixed" on suspicion.

**`useDeferredValue` — the first use in this codebase.** The `TextInput` stays
on the immediate value; the filter, the rows and the empty state derive from the
deferred one. It is not a debounce: the two debounces here (`invite.tsx`,
`community.tsx`) delay *network requests*, which is right when the goal is not
firing something. Here the cost is local rendering, so deferring is more
accurate than delaying and has no constant to defend. It is also correct under
both diagnoses, which is why it was worth landing before the cause was fully
settled. Measured after: **160/185 → 58–84 ms**, with the rendered node count
unchanged across three consecutive keystrokes — the rows are off the typing
path. Both sides were measured in a background tab (`visibility: "hidden"`),
which inflates the absolute numbers; the comparison holds because both were
measured the same way. It cannot be given a test: "the input does not wait for
the list" is a rendering property.

### Verifying "the phone is untouched" when the window will not shrink

Chrome silently ignores a resize of a **maximized** window, and this harness
blocks the zoom shortcuts, so a sub-1024 viewport could not be forced in this
session. The structural evidence is stronger than the screenshot would have
been: `SettingsRoute.web.tsx` early-returns
`<SettingsScreenFrame>{children}</SettingsScreenFrame>` below
`DESKTOP_MIN_WIDTH`, which is byte-identical to the whole body of the native
`SettingsRoute.tsx`. One early return, not an inspection.

## 5h. What wave 4 added — a pane's child, and a premise that was wrong

**The ruling: a pane's child is a route, not a dialog.** Both shapes — the detail
of a list the pane shows, and a form that creates something — are reached with
`router.push`, render as a full page under `WebShell`, and return by the stack
header's back arrow. **The selection is the URL**, so `goBack()` restores the
pane with its row still highlighted and nothing has to remember anything. There
is no third entry kind; the registry stays binary.

**The premise that made this look hard was false, and it was mine.** I had two
precedents pointing opposite ways — a link navigates out of the shell, while
`change-email` became a dialog because *in a pane there is no back* — and
weighed them as a genuine conflict. There is a back button:
`@react-navigation/elements`' `Header` sets `headerLeft` from the `back` flag in
platform-agnostic JS, every one of these child routes is declared
`headerShown: true`, and `settingsRegistry.ts`'s own doc comment already made
that deliberate for exactly this reason. Before arguing from a precedent, check
that the thing it asserts is still true.

**Section 3's test is "is this a leaf?", not "detail or form?"** Section 3
governs a screen a dialog can host **in full**. A screen whose own affordances
are largely navigation cannot be, because hosting it means either trapping those
pushes under an overlay or omitting them — and omitting them is the violation
the rule exists to prevent. `projects/[id]` keeps its **only** edit and delete
affordances in `<Stack.Screen>`'s `headerRight`, which a dialog does not have;
re-homing them is authoring new UI, i.e. reimplementing.

**What actually closed the form shape is one mechanical fact**, and it is the
kind worth writing down because nobody re-derives it: `account/create`'s trip
card pushes `/trip/new`, which finishes with `router.dismissAll()` —
`POP_TO_TOP`. **An RN `Modal` is not a route and survives that**, so a
dialog-hosted create form would be left floating over the tabs while a fresh
`/account/{id}` pushes underneath it. The `account/*` family is a connected
graph — list → create → trip/new → [id] → invite / settle-up / payment-settings
/ map, five routes with three `router.back()`s, one `dismissAll()` and one
`switchAccount()` — and converting any single node breaks the edges crossing
into it.

Verified end to end on a build rather than argued: both chains return to their
pane with the row still selected, `/projects/{uuid}` carries its pencil and
trash in the header, and `/account/[id]`'s "Delete account" sits at the bottom
of a real page — which is where a destructive action belongs, rather than at the
bottom edge of a dialog that `Esc` dismisses without deciding anything.

### The predicate that fails silently

`settingsHeaderShown` → `isShellHostedSettingsRoute` prefixes a leading `/` if
absent and then compares against the registry's `route` **exactly**. The expo
screen name for `app/projects/index.tsx` is `projects/index`, which becomes
`/projects/index`, which is **not** `/projects` — so it returns `false` with no
error and the pane renders with the shell **and** a redundant stack header.
`account/list` and `tags/manage` match under either spelling, which is precisely
what makes the third one easy to miss. Pass the registry's own route string.
The implementer confirmed it with a throwaway test it wrote, ran and deleted,
which is the right instinct for a predicate that cannot fail loudly.

### A declared order is only true for the rows already in it

`SETTINGS_ENTRIES`' doc comment promises it is *"ordered as the left pane draws
it"*, so a row *"rises into the pane block in the right place the day it is
extracted, with no second list to reorder."* That promise held for twelve rows
and was **false for exactly the three that had not been extracted yet**: they
sat at the bottom among the links, where they were put while they were links, so
`tags` and `projects` drew **after "About"** — after the block's natural last
item. Wave 4 landed the real order (`profile, accounts, appearance, ai, widgets,
notifications, bots, security, data, categories, merchants, products, tags,
projects, about`), grouping the five reference-data screens the way
`app/settings/reference.tsx` still groups them **on the phone**, where that
sub-hub is live and dissolves only in the desktop left pane. A single-array
ordering promise is worth keeping — but it has to be paid for when the rows are
declared, not when they are converted.

### All three panes are `width: 'form'`, not `'full'`

Wave 3's three list screens took `'full'` because their rows carry three or four
columns. These three are single-column lists of short rows, and `account/list`'s
footer Create/Join buttons are block buttons with **no `flex: 1`** — at `'full'`
they become two ~900px dashed bars, the appearance-chips defect in another
costume. Confirmed by eye at 1920: capped, both of them.

### The account-switch class, once more, and the fact that settled it

Two of these three screens loaded in a `useEffect(..., [])`, so a pane — which
stays mounted across a switch — showed the previous account's rows.
`account/list` is immune and correctly got no keying: it has no effect at all
and reads `accounts` as a live store subscription, so keying would discard state
to fetch a byte-identical answer.

The decision that took two rounds was whether to also `reset()` `tagStore` and
`projectStore` at the account boundary. The argument against — a reset could
strand an open expense form with an empty `TagPicker` — dissolved on reading:
every host is conditionally rendered and remounts per open, so the cost is
"empty until reopened". **The fact that decided it is web-specific**:
`db/client.web.ts` resolves `getAllTags`/`getAllProjects` to `[]` in a
microtask, so without a reset the real sequence was *previous account's rows →
empty → correct, after a network round trip*. The first phase is another
account's data in the pane that exists to manage this account's data. "A
one-frame flash" was not what was being traded away.

### Two method lessons, both paid for in this wave

**Presence in the DOM is not visibility.** A DOM query said the settings left
pane was still there on `/projects/{uuid}` — and it was, because expo-router's
stack keeps the previous screen mounted while it is visually covered. Same class
as the `[aria-modal]` stale-node error recorded in 5f and the labelled-timing
error in 5g: a screenshot settles what a query cannot.

**The verification build, which broke twice in one session for two stacked
reasons.** The proxy already forwards `/api/*` to the upstream, so the page can
be same-origin and CORS never applies — but (1) `EXPO_PUBLIC_API_URL=/api/v1`
under Git Bash becomes `C:/Program Files/Git/api/v1`, because MSYS rewrites a
leading-slash value as a POSIX path, and (2) `scripts/build-web.sh` does not
pass `--clear`, while Expo inlines `process.env.EXPO_PUBLIC_*` at transform time
and **caches** it, so the first rebuild kept the old value even though the
script printed the new one. Working recipe:

```
cd apps/mobile && rm -rf dist \
  && EXPO_PUBLIC_API_URL=http://localhost:8099/api/v1 npx expo export --platform web --clear \
  && node scripts/inject-pwa-tags.js dist/index.html
```

Two corollaries. A cross-origin failure surfaces as `TypeError: Failed to fetch`
with the **browser extension's** frames on top of the stack and no CORS policy
line in the console, so that stack is not evidence about the extension. And
`read_network_requests` records **zero** requests for this app even when they
demonstrably succeed, because the extension issues them from its own context —
its silence means nothing at all.

### What wave 4 leaves visible, and it is the next thing to fix

**Every child route of a pane is uncapped.** `/account/create`, `/account/[id]`
and `/projects/[id]` all stretch to the full viewport — at 1920 the create
form's name field and its submit button span the whole width, and the member
rows do too — while the pane they were reached from stops at 720. This is the
appearance-chips defect one level down. It is not an argument against the
ruling, which refused a dialog for reasons that have nothing to do with width,
and the fix is a **shell-level** change rather than one per screen: give a
pane's child the same cap.

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
