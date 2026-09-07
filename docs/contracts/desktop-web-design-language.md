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

**A pane's child route was uncapped, and is now capped by `PaneChildWidth`.**
`/account/create`, `/account/join`, `/account/[id]` and `/projects/[id]`
stretched to the full viewport — at 1920 the create form's name field and its
submit button spanned the whole width, and the member rows did too — while the
pane they were reached from stopped at 720. The appearance-chips defect one
level down. It was never an argument against the ruling, which refused a dialog
for reasons that have nothing to do with width.

**Two corrections to what this section said when it was first written**, both
found by the implementer reading the code rather than the doc:

- It listed three routes. There are **four** — `/account/join` sits beside
  Create in the same pane footer and was missed.
- It called the fix **"shell-level, not one per screen"**. That was asserted
  without reading and is wrong: `SETTINGS_FORM_MAX_WIDTH` is applied in exactly
  one place, `SettingsShell.tsx`, and a pushed route has no shell above it to
  extend. A blanket cap in `DesktopShell` would need an enumerated opt-out list
  for the routes that legitimately want width — the import preview and its
  column mapper are full-width workspaces by the registry's own comment, and so
  are the map picker and the community price map — which is the same
  enumerated-route-list reasoning ABA-497's telemetry work rejected, on the
  grounds that a new screen must work from the day it ships.

So it is `src/components/PaneChildWidth.tsx`: one shared component, used by
those four screens, wrapping **the content and never the root** (this wave
found roots that were a `SafeAreaView edges={['bottom']}`, a
`KeyboardAwareScreen`, a bare `ScrollView` and a `FlatList`, and wrapping a root
risks its `flex: 1` chain and its keyboard handling). It reuses
`SETTINGS_FORM_MAX_WIDTH` rather than minting a second number, and its
non-desktop branch renders children **unwrapped — no extra node at all**, so
the phone's rendering cannot change by construction. The one numerically
checkable part, `paneChildCapStyle(isDesktop)`, is pure and unit-tested.

**It centres the column, and that does NOT contradict the settings spec's
"720px, left-aligned (never centred)".** Read that rule with its own
rationale — *centred content inside a left-aligned shell reads adrift* — and it
is scoped to a pane, which has a 280px nav to its left that the content reads
as attached to. A pushed child has no nav beside it, so left-aligning would
hug the window's edge with ~1200px of void to the right. Centring here matches
`WebShell.web.tsx`'s own unauthenticated-route column, which is the other place
in this app that renders a bounded page with no nav. Do not "fix" one to match
the other.

Still uncapped, deliberately out of that change's scope and worth doing when
their screens are next touched: `FinancialMonthSheet` and `projects/[id]`'s
inline edit `Modal`. More broadly, **47 files still contain a raw `<Modal>`** —
`SheetDialog` covers ten call sites — and each is a full-width-from-the-bottom
sheet the moment its screen gets a desktop layout. The right time to convert
one is that screen's own desktop pass, not a sweep.

## 5i. What the chat screen added — a measure, and a trigger that came free on the phone

The sixth screen and the last of the five tabs. Same gate shape as the five
before it: one thin route, `ChatView.web.tsx` deciding on width alone,
`ChatMobile.tsx` holding the phone's JSX in exactly one definition. What is new
is below.

### A cap in percent is not a measure

`ChatMessageItem`'s bubbles were `maxWidth: '80%'` — right on a phone, where
80% of a 328px row is a 264px measure, and absurd at 1920, where the same rule
gave **~1510px**: 5.7× the line length the type was set for. The composer was
worse in its own way, with its microphone and send button **1876px apart**.

The fix is not a bigger percentage. On desktop the **column becomes the cap**:
the assistant bubble loses its own `maxWidth` entirely, while the own-message
bubble keeps its percentage of a row that is now bounded. The asymmetry is
deliberate and worth stating in the direction it runs — the assistant's answer
is the document (prose, markdown tables, action cards) and your question is a
margin note, so widening the answer and not the question is the point. Inverting
it would widen one-line questions and narrow the tables.

Verified on the deployed build at 1920: transcript row **728px**, matching the
design's own arithmetic table exactly, and the widest **rendered** line
**649px** against a predicted 664 — right to 2%.

### A measure stated in characters must name its face, and be checked against the rendered one

The design predicted **72–79 characters at every desktop width**, from
Montserrat's average advance. The width is right and that band is not, because
**`markdownStyles.body` in `ChatMessageItem` sets `color`, `fontSize` and
`lineHeight` and no `fontFamily`** — so every assistant answer renders in the
platform's default face while the rest of the app is Montserrat. Measured
`font-family: -apple-system`; the system face is narrower, so the same 649px
carries roughly **86** characters.

So the layout is right and the typographic claim about it was not checkable as
written. Two things follow. **A measure expressed in characters is a claim about
a face**, and it has to be measured on wrapped text as rendered — a `getClientRects()`
count over a text range, not an advance-width estimate. And this is
pre-existing, on both platforms: fixing it is `fontFamily` on `body` **plus**
replacing all five `fontWeight` usages with the concrete Montserrat weight files
(the `semiBold` token exists), because `fontWeight` on a named static family
does nothing or synthesises. That changes every assistant message on the phone,
so it is a decision rather than a drive-by.

### Arithmetic can delete a design decision

The 1024–1439 band needed no threshold constant and no collapsed-rail story at
all, because the column reaches its 760px cap at **exactly 1080** — so the whole
band is "the column is 704–760 instead of 760". Compare the transactions screen,
which needed `FACET_RAIL_MIN_WIDTH = 1440` for its own band. Work the numbers
before designing a breakpoint; sometimes there is nothing there to design.

### The first deliberate departure from the one-page-scroll rule

Section 2 prefers one page scroll. This screen has **none**: the transcript
scrolls, the rail scrolls, and the composer is docked. A transcript cannot sit
inside a page scroller when the content is end-anchored and the composer is
fixed. Both existing rails (`FacetRail`, `SettingsNav`) sit *inside* their page
scroller; this one cannot, and that is argued in the design's own Departures
section rather than waved through. RNW's `ScrollView` is `overflowY: auto`, so
the rail's scrollbar exists only on overflow.

### Teardown and refill are two halves, and a sheet gives you the second one free

This is the most portable thing the screen taught.

`chatStore` had no `reset()`, was absent from `logoutAction` **and** absent from
`clearAccountScopedCaches()` — so a conversation list survived both sign-out
(the `inflationShieldStore` class: a cache readable by the next person to sign
in on that browser) and an account switch. The teardown was written first,
because a rail that loads on mount without it shows another account's
conversations and the composer posts into one of them.

**And the teardown alone left the rail stuck.** `reset()` sets
`conversationsStatus` back to `'idle'`, `resolveRailState` maps that to the
rail's *visible* `'loading'`, and the only fetch was keyed on
`[currentConversationId]` — which the reset clears to `null`, so nothing ever
asked again. Found in a browser: switch accounts and the rail empties correctly,
then sits on "Loading…" forever while the API answers `200` and an empty list to
anyone who asks it.

The general rule: **a persistent list needs an explicit refetch trigger that a
sheet-hosted list gets for free.** The phone was never affected, and the reason
is the same reason the desktop was: `handleOpenHistory` calls
`loadConversations()` on *every open*, so the phone refreshes at a moment the
always-visible rail does not have. When a list moves out of a sheet and into
permanent furniture, re-create that trigger deliberately — here, an effect keyed
on `[currentAccountId]` in the always-mounted parent, which is the refill half
of the idiom `accountStore`'s own comment already documents.

Two wrong fixes worth naming, because both compile: changing
`resolveRailState`'s `idle → loading` mapping (the state machine was right; the
bug was a missing fetch), and making `'idle'` render as empty (which turns a
genuine first paint into a false "this account has no conversations" — the exact
confusion the `retry` state exists to prevent).

### A reviewer may read anything and change nothing

Two code reviewers on this wave ran `git stash -u` on the shared working tree to
get themselves a clean checkout of the commit under review. The second landed
inside a live implementer's write window: it wiped a full round of that agent's
edits, which it redid blind, reporting only that its files had "silently
vanished" with an `reset: moving to HEAD` it had not caused. The reflog shows
both stashes.

No damage survived, and only because the implementer **flagged an unexplained
event instead of quietly redoing the work** — that is the whole reason the cause
was findable. The rule now goes in every review dispatch: **read anything,
change nothing** — no stash, no checkout, no branch switch. A reviewer wanting a
clean view of a commit uses `git show` / `git diff` against it, which mutates
nothing.

### A count in a document is wrong by default

Recorded here because it kept recurring and finally reached my own writing. This
wave's plan carried a baseline test count in its Global Constraints; task 1
moved it, and task 2's brief was extracted afterwards carrying the stale figure,
which its reviewer then had to spend a paragraph reconciling. The plan now
states the rule and no number, and tells the implementer to read the count off
the tree. Along with the registry comments saying "twelve" and "ten", the one
saying "the other four" where the group was five, and four counts in CLAUDE.md,
that is seven instances in one branch. **If a list is adjacent, the count is
decoration that rots.**

## 5j. What the conversation-management wave taught — mostly about the instructions, not the code

The seventh screen's wave (rename, delete, pin, and making sharing legible) was
the first on this branch whose defects were mostly in the *dispatch*, not the
code. That is the interesting part, so it leads.

### A plan's file list is the least reliable line in a task

Twice in one wave, in opposite directions. Task 4's `**Files:**` block named
`ChatDesktop.tsx` under *Modify* while **none of its seven steps mention that
file** — a leftover from a draft where the actions were prop-drilled. Task 6's
block **omitted** `useChatScreenData.ts`, which its own step 4 requires (the
"`0` members means unknown, not single" comment belongs at the read site, and
that site is `const hasOtherMembers = accountMembers.length > 1`).

The asymmetry is the lesson: a file list is written *before* the steps and never
re-derived from them, so it drifts in both directions and it drifts silently.
The steps are the requirement; the list is a hint. Task 4's implementer got this
right on its own — it found no functional reason to touch the file, made the
edit documentation-only, and **flagged rather than assumed**, which is exactly
the behaviour that makes a wrong plan cheap.

What was accepted, and the distinction worth keeping: the comment stays *on its
own merits* — it records the "one leader" decision at the exact site where a
later implementer would add a second copy of the actions to the title bar, which
is this repo's house style. Making a cosmetic edit **to satisfy a file list**
would have been the wrong reason, and had the comment been filler the answer was
to revert the file and record the list as wrong.

### Precedent beats caution, and the cautious answer can be the wrong one

The Global Constraints warn that a `Modal` as a sibling of the history sheet's
own "stacks two presented modals". Task 5 correctly made the row *menu* a plain
`View` — and then mounted the rename dialog as a sibling `Modal`, hitting the
named hazard for a different component. It flagged it as unproven and
device-only, which the design had also listed as unproven.

The resolution was not an argument, it was a grep: **`app/shopping-list/index.tsx`
already does this precise shape in production** — `ListSwitcherModal` and
`ListNameModal` are siblings, and `openRenameList` opens the second *without
closing the first*, on both platforms, since ABA-352. The hazard was retired
empirically a year ago.

And the cautious alternative — close the sheet, then open the dialog — would
have been **actively worse**: it costs the user their place in the list for a
safety the shipped app shows is unnecessary. When a constraint's parenthetical
warns about a hazard, check whether the app already lives with it before paying
to avoid it. The constraint was written about the menu, where a better option
existed; for a shared component like `SheetDialog` there is none.

### A test can be written so that it cannot fail, and its report can say it does

Task 2's cross-account test asserted the 404-before-403 ordering by keying its
Prisma mock on `where.accountId === 'acc-2'`. Drop `accountId` from the query
entirely — the exact regression the test exists to catch — and `where.accountId`
is `undefined`, which also fails that comparison, so **both** the correct and
the broken implementation take the same branch and the test passes either way.
The report asserted the opposite. Fixed by asserting the real call shape.

The general form: a mock keyed on a *value* rather than on the *shape* of a call
silently passes when the field is absent, and absence is what most regressions
look like. Which is why the standard on this wave became **mutation-test each
test and report the observation, not the intention** — and it paid: the three
rollback tests added later each produced a *different* failure signature
(a surviving call with the stale title; `Number of calls: 0`; a surviving call
with the stale flag), and that difference is itself evidence they are three
tests rather than one copied three times.

### A brief's file list is my version of the same mistake

Task 3 shipped three new store actions — `renameConversation`,
`deleteConversation`, `setConversationPinned` — with **zero** tests, because my
brief's file list named only the pure module's test file. The implementer
followed it exactly. The property left uncovered was optimistic rollback
(restore both the in-memory row and the SQLite mirror when the server rejects),
which both its own report and my review brief had singled out as the thing that
mattered most, and whose sibling test already existed two stores away
(`invitationStore.test.ts`'s "restores the invitation on failure").

So the lesson above about plans applies to briefs: **the file list is a hint, the
property to be proved is the requirement.** Name the property.

### Read the arithmetic before designing a control

Decision 5's platform split is a measurement, not a taste: a two-segment
`[Личный | Общий]` control needs ~170px against ~110px available in the phone's
top bar at 360px, so the phone gets an 18px `swap-horizontal` glyph inside the
pill it already has. And the reverse case — `hitSlop` of 12 on all four sides of
a 20px control is 44pt, both platforms' minimum target, which retires an
"unproven, device-only" concern with one line of arithmetic.

Two of this wave's five requests also turned out to be **already satisfied
somewhere**: the phone's history sheet had rendered a shared-state icon since
before the wave (so "show an icon when shared" was missing only from the desktop
rail), and `canToggleShared` already existed as exactly the gate the new glyph
needed. Read the surface you are asked to fix before designing the fix; part of
it may already be there, and the part that is missing is usually narrower than
the request sounds.

### A sentence written to settle one question gets read as settling the next one

Two instances, one caught before it shipped and one after.

Decision 2 says "the sheet's own `onRequestClose` still handles the Android back
button". Its *job* in context is to explain that because the phone's row menu is
now a plain `View` rather than a `Modal`, the **menu** does not get an
`onRequestClose` of its own — it is a statement about which component owns the
handler. The implementer read it as a statement about what the handler must *do*,
wrote "regardless of the menu's open state … it is not given a second,
menu-aware behaviour here", and shipped a defect: Android back closed the whole
sheet while leaving `menuRow` set, so the next open rendered a stale menu
unprompted. The one dismissal path that bypassed the menu's own swallowing
overlay.

Decision 5(g) is the same shape, caught in time: it **recommends** changing
`chat.private`'s value in nine locales to a scope word, then says in the same
breath that it is separately authorised and not done here. An implementer
reading the spec literally will do the recommended thing. It had to be forbidden
explicitly in the dispatch.

Both are cheap to prevent once you know the shape: when a design sentence
mentions a mechanism in passing while making a different point, it has not ruled
on that mechanism's behaviour — and a design that recommends something it is not
authorising should say "do not do this here" in the same sentence, not the next
one.

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
