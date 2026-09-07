# Settings — Desktop Web Design

Scheduled in `docs/design/2026-09-06-dashboard-retention-and-onboarding-web.md`
Addendum 5, which ruled that a full page is right, the layout is wrong, and the
answer is two panes — gated on moving screens out of `app/`. This is that spec.

## Goal

Make every settings screen legible at desktop width by constraining the space it
renders into, rather than by re-authoring seventeen phone screens — and stop the
settings hub from being the app's overflow drawer for nine things that are not
settings.

## What I measured first, because it changes the plan

`app/settings/` holds 17 screens and 6,839 lines. Four greps decide most of this
spec:

| Check | Result | Consequence |
|---|---|---|
| Screens reading `Dimensions` / `useContentWidth` | **0** | Nothing measures the viewport. Every screen is `flex: 1` filling its parent, so **narrowing the parent narrows all of them for free** |
| Screens reading `useLocalSearchParams` | **0** | No settings screen is parameterised. A pane hosts one with no props to thread |
| Screens using `Stack.Screen` | **1** (`products.tsx`, a `headerRight`) | One known wrinkle, not a pattern |
| `Alert.alert` (a no-op on react-native-web) | **0** — all 10 alert-using screens already call `showAlert` | The defect class that bit the last two extractions is **already absent here** |
| `router.back()` after a save | **2** — `change-email.tsx`, `wise-import.tsx` | Confined, and both are handled below |
| Screens with outbound `router.push` | **5 of 18**; 13 are pure leaves | Hosting a leaf in a pane needs no navigation model |

**The reported defect has a one-line cause.** `appearance.tsx` sets
`themeChip: { flex: 1 }` inside `themeRow: { flexDirection: 'row' }`. With an
unbounded parent, three chips take a third of 1540px each. Nothing is wrong with
the screen; it is being handed the wrong width.

**So: the extraction is the work and the redesign is one flag per screen.** That
is the opposite of the plan this would have needed if these screens measured the
window, and it is why this is worth doing now.

## The two-pane shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ WebTopBar: AI Budget · Dashboard Expenses Budgets Analytics AI Chat  [acct]…  │
├───────────────────────┬──────────────────────────────────────────────────────┤
│ LEFT PANE (280, fixed)│  RIGHT PANE (fluid)                                  │
│                       │                                                      │
│  Profile              │   Appearance                                         │
│  Appearance        ◀  │   ┌────────────────────────────────────────┐         │
│  AI                   │   │ Theme    [Light][Dark][System]         │  ← 720  │
│  Widgets              │   │ Accent   ● ● ● ● ● ● ● ● ● ● ● ● ●     │    cap  │
│  Notifications        │   │ Language [English][Polski][Deutsch]…   │         │
│  Chat bots            │   └────────────────────────────────────────┘         │
│  Security             │                                                      │
│  Data                 │                                                      │
│  Categories           │                                                      │
│  Merchants            │                                                      │
│  Products             │                                                      │
│  About                │                                                      │
│  ─────────────────    │                                                      │
│  Wallet            ↗  │                                                      │
│  Shopping list     ↗  │                                                      │
│  Purchase requests ↗  │                                                      │
│  Subscriptions     ↗  │                                                      │
│  Import            ↗  │                                                      │
│  Plan & billing    ↗  │                                                      │
│  Invite friends    ↗  │                                                      │
│  What's new        ↗  │                                                      │
│  Accounts          ↗  │                                                      │
└───────────────────────┴──────────────────────────────────────────────────────┘
                     one page scroll, as everywhere else
```

**Left pane: 280px fixed.** Between `SIDEBAR_WIDTH` (240) and the alert panel
(400) — settings labels are longer than nav labels and shorter than alert
bodies. Declared as `SETTINGS_NAV_WIDTH` in `webLayout.constants.ts` beside the
others.

**Right pane: fluid, with a per-screen content cap.** A form does not want 900px
of line length. The shell's registry carries `width: 'form' | 'full'` per entry:
`'form'` caps the content at **720px, left-aligned** (never centred — centred
content inside a left-aligned shell reads adrift); `'full'` uses the pane. Form
covers everything except `categories`, `merchants` and `products`, which are
list screens and want the width.

**One page scroll.** Both panes live in the screen's single `ScrollView`, as the
dashboard's focus column and rail do. The left pane is short enough at ~21 rows
that it does not need its own scroller, and giving it one would be the second
scroller the language forbids.

**No group headers in the left pane.** Grouping would need ~4 new i18n keys and
21 flat rows is already shorter than today's 20-row hub plus its two sub-hubs.
The single divider between panes and links carries all the structure needed.

## The URL, and why every route file keeps existing

People bookmark and reload, and each screen is its own route today. **The
selection is the URL**: `/settings/appearance` renders the shell with Appearance
selected. That is not extra work — it falls out of leaving the routes alone.

Each route file becomes one line, the `ExpensesView` pattern applied per route:

```tsx
// app/settings/appearance.tsx
export default function AppearanceRoute() {
  return <SettingsRoute screen="appearance" />;
}
```

`SettingsRoute` is the single gate. Desktop → `<SettingsShell selected="appearance" />`.
Below 1024 and on native → the extracted screen component inside the route's
existing `SafeAreaView`, i.e. today's exact tree.

**Deliberately not `app/settings/_layout.tsx`.** A layout route would wrap all
settings routes at once and look cheaper, but these routes are registered
centrally in the root `_layout.tsx`, and route-level resolution in expo-router
is explicitly unverified in this repo. Seventeen one-line files are mechanical
and provably safe; a layout file is one clever change that could reorganise
routing for the whole app.

**`/settings` itself** renders the shell with **no selection**, and the right
pane shows the two things that belong to settings as a whole rather than to any
category: the profile header card (avatar, name, email) and the logout button —
both already in `index.tsx` today. Nothing is auto-selected, so the URL never
claims a selection the user did not make, and the landing pane is real content
rather than a placeholder.

## The nine non-settings rows

A shell that hosts "whatever the row points at" would swallow the shopping list
into a settings pane. But they cannot simply be deleted either: **`/wallet`,
`/shopping-list`, `/purchase-requests` and `/subscriptions` have no top-bar tab,
so the settings hub is currently their only entry point.** Removing them would
make four features unreachable — the exact failure the language doc names about
dialogs that omit what the route hosts.

**So the left pane has two kinds of entry, and this is the rule:**

> **If the screen's purpose is to change how the app behaves for you, it is a
> pane. If its purpose is to look at or act on your money, it is a link.**

A **pane** fills the right side and the URL becomes `/settings/x`. A **link**
navigates out of the shell entirely and the URL becomes `/wallet`. Links sit in
their own block below a divider and carry an outbound arrow, so the two kinds
are never confused. Nothing becomes unreachable and nothing gets swallowed.

| Destination | Kind | Why |
|---|---|---|
| profile, appearance, ai, widgets, notifications, bots, security, data, about | **Pane** | Configure the app |
| categories, merchants, products | **Pane** | Configure the app's reference data. Promoted out of the `reference` sub-hub, which dissolves — one level of depth removed, and `settingsNav.categories/.merchants/.products` already exist in all nine locales |
| wallet, shopping-list, purchase-requests, subscriptions | **Link** | Places you work. They are here only because a phone has no room for more tabs |
| subscription (plan & billing), referral, whats-new, admin | **Link** | Account-level, but each is a commerce, share or announcement flow, not a control panel |
| account/list | **Link** initially | Configures scope, so it is a pane by the rule — but it lives outside `app/settings/`, so it becomes one only when it is extracted. See the order |
| **import** | **Link**, permanently | It is a *wizard*, not a screen: five files driven by `useImportStore`, with a preview and a column mapper that are full-width workspaces. A wizard inside a 900px pane is a trap. This also removes the single hardest extraction from scope |
| tags/manage, projects | **Link** initially | Reference data by the rule, but outside `app/settings/`. Panes later, with `account/list` |

**Sub-screens reached from inside a pane do not get a left-pane entry.**
`change-email` is reached only from Profile and is a two-step verification flow
— it opens as a **dialog over the shell**, which is also what resolves its
`router.back()` (the only save-signals-completion case in the settings tree that
lands in a pane: `wise-import`'s is behind the Import link and out of scope).
Anything else reached from within a screen — `ai-usage-details`, `auto-capture`,
`wise-import` — keeps its current entry point unchanged and is out of phase-1
scope.

## What actually needs re-authoring

Almost nothing. Per the greps, constraining the parent is the fix, and the
per-screen work is the `width` flag. Three named exceptions:

1. **`products.tsx`'s `Stack.Screen` `headerRight`** has nowhere to render in a
   pane — the shell owns no per-screen header bar. Its action moves into the
   pane's own content, at the top of the screen body.
2. **`SafeAreaView` and `useSafeAreaInsets`.** Every screen wraps itself in
   `SafeAreaView`, and several add `insets.bottom` padding. **The extracted
   component must own neither.** The route wrapper keeps them for mobile; the
   pane supplies its own padding. This is the single most likely source of a
   regression in this work.
3. **`index.tsx`** is not extracted as a screen at all — it is decomposed. Its
   profile header and logout button become the shell's no-selection pane; its
   row list becomes the shell's registry; and below 1024 it renders exactly as
   today, all 20 rows.

## What the implementer should look for

Both previous extractions found a real defect. The two classes that produced
them, checked against what is actually here:

- **A resource acquired in an effect and released on unmount** (the microphone).
  A screen that assumed "unmount when the user navigates away" now unmounts when
  the *pane switches*, and stays mounted while the shell is open. Check
  `bots.tsx` (link-status polling and a QR), `auto-capture.tsx` (a native
  listener), `data.tsx` (export/share in flight), `products.tsx` (an AI backfill
  request in flight).
- **A save that signals completion by navigating** (the set-balance case). In a
  pane there is no back. Confined to `change-email.tsx`, which this spec makes a
  dialog for exactly that reason — but re-check `profile.tsx` and
  `security.tsx`, whose saves currently end in a `showAlert` and should keep
  doing so.
- **Not a risk here, and worth stating so nobody spends time on it:**
  `Alert.alert` is absent from all 17 screens; every one already uses
  `showAlert`. That class is closed before this starts.
- **One new class this shell introduces:** a pane keeps its component mounted
  across an accent or theme change and across an account switch. A screen that
  loaded its data once in a mount effect and was previously remounted on every
  visit may now show another account's data. Check every settings screen that
  reads account-scoped state — `categories`, `merchants`, `products`, `bots`,
  `notifications` — and key the pane on `currentAccountId` if any does.

## The order

Seventeen extractions is not one task, and the shell is useful the moment it
holds a handful. **Ship the shell with wave 1 (six screens) and land the rest
behind it** — an entry not yet extracted stays a link, so the left pane is
complete and honest from day one, and rows convert from link to pane as they
land.

**Wave 1 — the shell plus six (all leaves, all in `app/settings/`):**

| # | Screen | Lines | Why here |
|---|---|---|---|
| 1 | **appearance** | 255 | The reported defect, a pure-presentation leaf with no data and no actions — the safest possible screen to prove the shell on, and the one that demonstrates the fix visibly |
| 2 | **widgets** | 152 | Second-smallest, a leaf, and it exercises a drag interaction inside a pane |
| 3 | **ai** | 152 | Smallest, a leaf, pure toggles |
| 4 | **about** | 115 | Smallest of all; its one outbound link to `/help` proves a pane can navigate out |
| 5 | **notifications** | 464 | Larger but structurally trivial (toggle rows), and the highest-traffic settings screen after profile |
| 6 | **data** | 493 | The first with real actions (export, restore, share) — the wave's risk probe, done while the wave is still small |

**Wave 2 — the heavier leaves:** `security` (416), `profile` (646, and brings
`change-email` as the first pane dialog), `bots` (564, the mount-lifetime probe).

**Wave 3 — the list screens:** `categories` (411), `merchants` (508),
`products` (561, and the `Stack.Screen` wrinkle). These are the `width: 'full'`
entries and dissolve the `reference` sub-hub when they land.

**Wave 4 — outside `app/settings/`:** `account/list`, `tags/manage`, `projects`
convert from links to panes.

**Never:** `import`. **Out of scope:** `ai-usage-details`, `auto-capture`,
`wise-import`, and every non-settings link.

Wave 1 is ~1,600 lines of extraction and delivers the visible fix. Nothing after
wave 1 changes the shell.

## States

**No selection** (`/settings`) — profile header card and logout in the right
pane, no left-pane row highlighted.

**Selected** — the row is highlighted and the pane holds that screen.

**A link row** never enters a selected state; it navigates.

**Loading** — each screen keeps whatever loading state it has today. The shell
adds none: it is a layout, and it owns no data.

**Error** — unchanged per screen. The shell adds no error UI.

## Interactions

**Hover** on a left-pane row tints the row; `cursor: pointer` is free from
`Pressable`. Every row is a real focusable target — the hover affordance's twin.

**Keyboard.** Tab order is left pane top-to-bottom, then the right pane's own
content. `Enter`/`Space` select. The selected row is marked
`aria-current`-equivalently via `accessibilityState={{ selected: true }}`.

**Dialogs.** `change-email` opens over the shell on RN's `Modal` with a raw
`<div>` scrim — never a `Pressable`, which would become the focus trap's first
target.

**Right-click, selection, facets.** None. Settings has no rows in the ledger
sense.

## Below 1024

**The shell does not exist.** `SettingsRoute` renders the extracted screen
component inside the route's existing `SafeAreaView`, and `/settings` renders
today's hub with **all 20 rows** — the pane/link split is a desktop-only
distinction and must not reach the phone. Mobile is byte-identical, which is
also what makes each extraction verifiable: open the screen on a phone before
and after and nothing moves.

At 1024–1439 the shell is unchanged: 280 + a fluid pane leaves ~700px, and the
720px form cap simply stops binding. Nothing here is width-conditional below the
desktop gate.

## i18n

**Zero new keys.** The left pane reuses the `settingsNav.*` labels the hub
already renders, including `settingsNav.categories`/`.merchants`/`.products`,
all verified present in all nine locales. The no-selection pane reuses the
profile header and `settings.logout`, both already on the hub. No group headers
precisely so that no group-label key is needed.

**If a later wave wants grouping in the left pane, that is a key request and
must be raised explicitly rather than invented.**

## Departures from the design language

**A left column, which §2 forbids: "Navigation lives in the top bar, not a left
column."** Stated plainly rather than slipped past. The rule is about
*application* navigation — the five tabs — and its reason is that two navs drift.
This left pane is not application navigation; it is this screen's own content,
the same category of thing as the transactions screen's facet rail, which the
same document sanctions. The test that separates them: leaving the shell by a
link changes the top bar's active tab to nothing, exactly as `/wallet` does
today, because the top bar remains the only thing that says where you are in the
app. If this reads as a second nav once shipped, the answer is to make the link
block more visibly an exit, not to move the pane list into the top bar.

No other departures.

## Acceptance criteria

1. Open `/settings` at 1920: a 280px list on the left, the profile card and
   logout on the right, no row highlighted.
2. Click Appearance: the URL becomes `/settings/appearance`, the row highlights,
   and the theme chips are ~220px each, not ~510px.
3. Reload that URL: the shell reopens with Appearance still selected.
4. Click Wallet: the app navigates to `/wallet` and the settings shell is gone.
5. Click Categories (wave 3): the pane uses its full width, not the 720px cap.
6. Open Profile → change email: a centred dialog opens over the shell; `Esc`
   closes it; `Tab` from the open dialog never lands on the scrim.
7. Switch accounts while a pane is open: the pane shows the new account's data,
   not the previous account's.
8. Narrow the window to 1000px: today's hub appears with all 20 rows, and the
   shell is gone.
9. Open every extracted screen on a phone: pixel-identical to before, including
   safe-area padding at the bottom.
10. Tab from the top bar into the shell: focus enters the left pane, moves down
    it, then into the pane content; the selected row is announced as selected.

## Open questions

- **Whether 720px is the right form cap**, and whether the pane content should
  be left-aligned or given a leading margin — judged by eye, since nothing here
  renders in CI.
- **Whether the link block reads as an exit or as a second nav.** The divider
  and outbound arrow are the whole mechanism; only the deployed screen says
  whether that is enough.
- **Whether `subscription` (plan & billing) should be a pane.** By the rule it is
  account configuration, but it is also a checkout. Left as a link, revisit.
- **Whether the left pane needs grouping** once it holds ~21 rows — the first
  thing that would need a new i18n key in this entire body of work.
- **Whether keeping panes mounted across selections is right at all**, or whether
  the shell should unmount the previous pane. Unmounting is safer and loses
  scroll position; this spec assumes unmount-on-switch and flags it.

---

# Addendum — the sheets inside panes (2026-09-06)

**Ruling: convert (option 1) — but the unit of work is one shared wrapper, not
four conversions.**

## Why not option 3

§3 of the design language is explicit: *a detail or a form opens in a centred
dialog, not a new screen and not a bottom sheet.* Leaving them is keeping a
standing violation, which is worth doing only if the harm is cosmetic. It is
not.

On a phone a sheet covers a screen you are **leaving**. In a pane it covers the
thing you are **editing** — and RNW anchors it to the bottom of the *window*, so
at 1920×855 a click on a row in the upper-left of a 900px pane produces a
1920px-wide form at the far bottom of the screen, with the list it came from
still visible above it. That is a pointer-travel and focus defect, not an odd
look. It is the same argument that retired the phone hero and the quick-action
strip from this layer.

## Why not option 2

RNW's `Modal` is a fixed full-viewport overlay. Anchoring it to the pane means
either hand-rolling an overlay — giving up `role="dialog"`, `aria-modal`, the
`Esc` handler, the focus trap and focus restoration, every one of which §3 says
in terms not to hand-roll — or portal work that is a new mechanism on this
branch for **less** benefit than a centred dialog. It is also worse at 1200,
where the pane is ~700px: a pane-anchored dialog gets cramped exactly where a
centred one is unaffected.

## The part that changes the plan: this is not four sheets

I checked the population. It is ~10, and **the sheet→dialog swap is already
hand-written twice**: `SafeToSpendSheet` (an `if (desktop)` branch at line 125)
and `FinancialHealthWidget`, both shipped and verified. Converting four more one
at a time makes six copies of one idea, and the sixth will drift from the first
— the same triplication I found in the rail widget headers.

So build **one `SheetDialog`** that owns the `Modal`, the scrim, the sheet
chrome and the centred-dialog chrome. Each sheet swaps only its chrome; every
form body is untouched.

**It decides internally with `useIsDesktopWeb()`, not a `desktop?` prop.** Every
call site would pass the same value, and a prop that must be remembered at ten
call sites is a prop that will be forgotten at one. `useIsDesktopWeb()` is
`false` on native at every width, so the mobile branch is today's sheet by
construction.

**It also closes a documented recurring bug.** Eight sheets have already needed
the same hand-copied `paddingBottom: <base> + insets.bottom` fix, because a
bottom-anchored sheet's last row lands under the system navigation bar. A shared
wrapper owns that inset in one place, so the ninth sheet cannot reintroduce it.
That, not the desktop look, is the strongest reason this is worth a round.

## Scope of the round

**Convert:** the four wave-3 sheets (categories ×1, merchants ×1, products ×2)
plus **the colour picker in `appearance`** — every sheet that opens inside a
pane. `MergeProductsModal`'s multi-select needs no special case: it is already a
presentational component, and a dialog hosts a list plus an input the same way
the account menu does — give it a `maxHeight` with the list scrolling inside,
and make sure the body does not add a second scroller of its own.

**Also retire the two hand-written branches** in `SafeToSpendSheet` and
`FinancialHealthWidget` onto the wrapper in the same round. They are already
correct, so this is deduplication — and it proves the wrapper against two
shipped, hand-verified cases before it is trusted with five new ones.

**Do not sweep the rest.** `BulkTagPickerSheet`, `MerchantPickerSheet` and
`TransactionActionSheet` belong to the transactions screen, are not in a pane,
and nobody has asked about them. `TransactionActionSheet` especially: it opens
on long-press, which on desktop is a right-click context menu — a different
question that a chrome swap would quietly pre-empt. They convert when someone
touches that screen.

## What the implementer should look for

- **Double bottom padding on mobile.** `CategoriesSettings` reads
  `useSettingsPane().bottomInset` specifically to feed its bottom-anchored
  `Modal`. Once the wrapper owns the inset, that read must go, or the phone
  gains a second gap.
- **Two scrollers.** Several of these bodies contain their own `ScrollView`.
  The wrapper owns one; the body must not add another.
- **The keyboard on the mobile branch.** These are text-entry forms, and the
  sheet currently lifts for the keyboard. If the wrapper's mobile branch loses
  that, entering a category name breaks on a phone — which the byte-identical
  rule forbids and no desktop check would catch.

## Cost and constraints

One new component, five conversions, two dedupes — and it lands as one round
after wave 3's plain moves, as you proposed. **Zero new i18n keys:** this is
chrome only, and every string already lives in the form bodies. No new
dependency. Mobile byte-identical by construction, since the mobile branch is
the existing sheet and the gate is false on native. Holds at 1440 and 1200
because a centred dialog is viewport-centred and width-capped, independent of
the pane.

## Acceptance criteria

1. Edit a category at 1920: a centred dialog opens over the shell, not a
   full-width sheet at the bottom of the window. Repeat at 1440 and 1200.
2. Open the colour picker in Appearance: same treatment.
3. Open the products merge dialog with enough products to overflow: the list
   scrolls inside the dialog and the page behind it does not.
4. `Esc` closes each one; `Tab` from an open dialog never lands on the scrim.
5. Open Safe-to-Spend and Financial Health on the dashboard: identical to before
   the dedupe.
6. On a phone, open all five: each is the same bottom sheet as before, with the
   same bottom gap above the navigation bar, and the keyboard still lifts it.

---

# Addendum — correction, and selection action bars in a pane (2026-09-06)

## Correction to the `SheetDialog` ruling

**You are right and I was wrong.** `CategoriesSettings` reads
`useSafeAreaInsets()`, not `useSettingsPane().bottomInset` — and the file's own
comment at lines 54–58 says so explicitly, stating that `useSafeAreaInsets`
"is deliberately NOT swapped for `useSettingsPane().bottomInset`". I read the
mention and inverted its meaning.

The instruction still holds with the right mechanism: **`categories` and
`merchants` each call `useSafeAreaInsets()` and feed `insets.bottom` into their
`Modal`'s padding. Once `SheetDialog` owns that inset, those reads must go**, or
the phone gains a second gap. And the comment itself must be updated in the same
change — it documents a decision the wrapper supersedes, and leaving it would
tell the next reader the opposite of what the code then does.

## Where a selection action bar lives — the answer already shipped

**Ruling: in normal flow, immediately above the content it acts on, appearing
when the selection is non-empty. Not sticky, not docked, no new mechanism.**

This is not a new pattern — `ExpensesDesktop` already does exactly this. Its
bulk bar renders inline right after `SummaryStrip` and **before** the table, as
a bordered, shadowed card with horizontal margins, gated on
`selectedIds.size > 0`. The reference screen made this decision, it is approved,
and it should not be re-decided per screen.

**Why above rather than sticky-bottom**, since sticky was the natural guess:

- A phone docks the bar because the thumb is at the bottom and the screen is
  short. On desktop the pointer is wherever the user just clicked, and the list
  is read top-down — so the bar appears where the eye already is.
- It **removes** the reported defect rather than working around it: a bar above
  the list is never behind the rules card, so nothing has to be scrolled past.
- A sticky-bottom bar inside a pane sticks to the bottom of the *page* scroller,
  which means it hovers over whatever the pane is showing at that moment — the
  rules card — permanently covering content on a screen that is not short.
- `position: sticky` is used exactly once on this branch, for the transactions
  table header, and its own source documents the scroll-container trap it needs
  care around. Spending that care to reach a worse outcome is the wrong trade.

## It generalises — extract it now, at two, not at three

Yes. The chrome is identical across all three (row, count on the left, actions
on the right, bordered card, shadow, conditional on selection); only the actions
differ. Extract **`BulkActionBar`** now: it owns the chrome and the layout, and
each screen passes its own count label and its own action buttons as children.

Extracting at the second instance rather than the third is the whole point —
`products` is the third, and three hand-placed copies is precisely how the rail
widget headers got triplicated. `ExpensesDesktop` adopts it in the same change,
which also proves the component against a shipped, verified case before
`merchants` and `products` depend on it.

**Key-neutral by construction:** the count label is a prop, not a hardcoded key,
so `ExpensesDesktop` keeps `expenses.bulkSelected` and `merchants` keeps
`merchants.selected` — both already count-bearing in all nine locales. **Zero
new i18n keys.**

## Below 1024

Unchanged: the phone keeps its docked bar. The placement fork lives inside the
extracted screen — `useIsDesktopWeb()` decides whether the bar renders docked
(mobile, today's tree) or above the list (desktop). `BulkActionBar` is the
desktop chrome only; do not route the mobile docked bar through it, or the
byte-identical guarantee turns into a diff nobody asked for.

## What to look for

- **`merchants`' docked bar relied on `flex: 1` and a full-height scroller.**
  Both are gone in a pane, so verify on a phone that the mobile branch still
  docks — this is the same class of inertness that caused the regression, and
  the fix must not quietly change the phone too.
- **The bar must not be inside the list's own scroller** if that list ever gets
  one; in flow above it, it should be a sibling of the list, not its header.

## Acceptance criteria

1. In `merchants` at 1920, select two merchants: the bar appears immediately
   above the merchant list, with no scrolling required, and the rules card stays
   below where it is.
2. Deselect everything: the bar disappears and the layout does not jump beyond
   the bar's own height.
3. Repeat at 1440 and 1200.
4. Open the transactions screen and select rows: the bar is unchanged from
   before the extraction.
5. On a phone, `merchants` selection docks the bar at the bottom exactly as it
   does today.

---

# Addendum — wave 4, and what a pane's child does (2026-09-07)

## Five corrections first, because three of them change the sizing

**1. There IS a back button in the app's own chrome — just not in `WebTopBar`.**
`@react-navigation/elements`' `Header.tsx:109` sets
`headerLeft = back ? HeaderBackButton : undefined`, platform-agnostic JS that
runs on web, and `app/_layout.tsx` declares every one of these child routes
`headerShown: true`. So a pushed detail on desktop gets a `surface`-coloured
bar with a left-aligned title and a working back arrow.

This is not incidental: `settingsRegistry.ts`'s `isShellHostedSettingsRoute`
doc comment makes it deliberate — a settings route that is **still a link**
keeps its header precisely because it "renders as a full page on desktop with
no pane list beside it and would otherwise strand the user with no way back."
The return path for a navigate-out was designed in wave 1 and has shipped since.

**2. The settings selection is not lost — it is the URL.** `goBack()` from
`/account/[id]` restores `/account/list`, which (once it is a pane) re-renders
the shell with Accounts selected. Nothing has to remember anything. One
exception, traced below.

**3. `projects/[id]` has two outbound edges, not zero — and its two mutating
actions live in route chrome.** Its `<Stack.Screen>` puts **edit and delete in
`headerRight`** (lines 112-126) and its expense rows push
`/expense/{localId}` (line 176). A dialog has no stack header, so hosting that
file verbatim ships a project detail with no way to edit or delete a project —
the exact section 3 failure that has already shipped twice on this branch ("the
detail dialog shipped twice missing content that lived *around* the card rather
than in it"). Re-homing them into a dialog header is authoring new UI, i.e.
reimplementing, which section 3 forbids.

**4. `account/[id]` has four outbound edges of its own**, all from the three
parts already in `src/components/account/`: `MembersSection` pushes
`/account/invite`; `TripActionsCard` pushes `/trip/{id}/settle-up` and
`/trip/payment-settings`, and its third row calls
**`switchAccount(accountId)` and then navigates to the expenses tab**. So "only
its coordinator JSX would move" is true of the *extraction* and misleading about
the *hosting*: what would go in a dialog is a screen whose content is largely
links out of it, one of which reconfigures the whole app underneath.

**5. `tags/manage` is not a clone of wave 3's `categories`.** Two differences:
it carries its own `<Stack.Screen options={{ title }} />` (line 92 — the second
instance of wave 3's route-chrome wrinkle), and its data load is
`useEffect(() => { loadTags(); }, [])`. So is `projects/index`'s. That is
section 5g's account-switch defect, and **`clearAccountScopedCaches()` does not
cover it** — it clears `priceHistoryStore` and `merchantRulesStore` only, and
neither `tagStore` nor `projectStore` has a `reset()` at all. Two of wave 4's
three screens carry a data-correctness change, not just a move.

Everything else in the brief checked out: `tags/manage` has no `router` use at
all, `projects/index` has exactly one outbound push, and `app/projects/new.tsx`
is reached only from `src/components/ProjectPicker.tsx` — a sibling route, not
this hub's create affordance.

## The ruling

> **A pane's child is a route.** Both shapes — the detail of a list the pane
> shows, and a form that creates something — are reached with `router.push`,
> render as a full page under `WebShell`, and return by the stack header's back
> arrow, which restores the pane because the selection is the URL.

**There is no third entry kind.** The registry's pane/link split stays binary,
one entry to one route, and "what a pane's child does" is answered by the route
model that already exists rather than by a new mechanism. That property — a
later wave flips one word — is what the registry's own header comment asks to
preserve.

The two shapes do **not** differ. I looked for a reason to split them and the
mechanics closed it off; see shape 2.

## Why this is not an ad-hoc exception to section 3

Section 3 says *a detail or a form* opens in a centred dialog. The test that
makes these three screens consistent with it rather than exempt from it:

> **Section 3 governs a screen a dialog can host in full. The question is not
> "detail or form?" but "is this a leaf?"** A leaf becomes a dialog. A screen
> whose own affordances are largely navigation cannot be hosted in full, because
> hosting it means either trapping those navigations under an overlay or
> omitting them — and omitting them is the section 3 violation the rule exists
> to prevent.

`ExpenseDialog` reads as a counter-example and is worth being precise about: it
does host two outbound pushes (`LocationSection` → `/expense/location`, the debt
row → `/income/new`). Those are *escape hatches on a card*. Here the navigation
**is** the screen: `projects/[id]`'s expense list is a list of pushes,
`account/[id]`'s trip card is three pushes and an account switch. Different in
kind, and — stated plainly — whether those two pushes even behave correctly from
inside a dialog on desktop is **unmeasured**. If they turn out not to, that is
evidence for this ruling, not against it, and it is not a foundation to build a
harder case on.

### Shape 1 — a detail of a list the pane shows

Route, for four reasons, in descending order of how mechanical they are:

1. **`projects/[id]`'s only edit and delete affordances are in `headerRight`**
   (correction 3). A dialog cannot host them.
2. **`delete` and `leave` on `account/[id]`, and `delete` on `projects/[id]`,
   all end in `router.back()`.** In a pushed route that is exactly right and
   needs no change. In a dialog it is wrong — it pops the route *underneath* the
   dialog — and must be re-authored to `onClose()` at three call sites.
3. **`account/[id]`'s trip map row calls `switchAccount()` then navigates.** An
   app-wide reconfiguration launched from inside a settings dialog is worse than
   a navigation, not better.
4. **Cost is very unequal and lands on the worse candidate.** `account/[id]`
   would move a coordinator; `projects/[id]` is a full 367-line extraction plus
   its own edit `Modal` plus new dialog-header UI for edit and delete — for a
   screen reached occasionally from a settings pane.

**On the danger zone and the trip archive, which you asked about directly:**
they stay where they are, in a `SafeAreaView` page with a header, because there
is no dialog. Had there been one, `showAlert` on web renders `AlertDialogHost`,
so deleting an account would have been an alert dialog over a detail dialog over
the shell — three overlays for one destruction, and the middle one is the one
that has to vanish on success. `TripArchiveButton`'s force-retry path is a
second `showAlert` inside the first. On the honesty question: a destructive
action is honest in a dialog when the dialog **is** the confirmation. A dialog
whose subject is account settings and whose bottom edge deletes the account is
not that, and `Esc` — which section 3 correctly wires up — makes it a surface
you dismiss without deciding anything.

### Shape 2 — a form that creates something

This is where section 3's pull is strongest, and it is closed by one mechanical
fact.

For the dialog: section 3 names forms explicitly; `CreateDialog.tsx` is a
working precedent; `account/create` (239) and `account/join` (132) are small;
both are already declared `presentation: 'modal'` in `app/_layout.tsx`; and both
signal completion with `router.back()` — the very shape that made `change-email`
a dialog, whose stated reason ("pushing a full-page route from inside the shell
would replace the whole settings layout with a two-field form") applies here
almost word for word.

Against it, decisively: **`app/account/create.tsx:83` routes the `trip` type
card to `/trip/new`, and `app/trip/new.tsx:64` finishes with
`router.dismissAll()` followed by `router.push('/account/{id}')`.**
`dismissAll()` is `POP_TO_TOP` (`expo-router/build/global-state/routing.js:122`)
— it empties the stack to its first screen. An RN `Modal` is not a route, so it
survives that: a dialog-hosted `account/create` would be left **floating over
the tabs**, exactly the "bury the dialog behind the new screen" failure
`CreateDialog.tsx`'s own header comment documents, and then a fresh
`/account/{id}` would push underneath it.

The escapes are all worse than the disease:

- Omit the trip card → trip accounts become uncreatable on desktop. Section 3's
  host-everything rule, violated. (`CreateDialog` gets away with omitting
  voice/receipt only because `IncomeCreateForm` already gates the entire row on
  those props; there is no such gate here — `trip` is one of five type cards.)
- Close the dialog and push `/trip/new` → a hand-off that discards a half-typed
  name, and new mechanism.
- Make `/trip/new` a second dialog → 213 more lines to `src/`, and its success
  path pushes `/account/{id}`, which would then have to be a dialog too. The
  `account/*` family is a connected graph — list → create → trip/new → [id] →
  invite / settle-up / payment-settings / map: five routes, three
  `router.back()`s, one `dismissAll()`, one `switchAccount()`. Converting any
  single node breaks the edges crossing into it.

**And `account/join` does not get to differ.** On its own merits it is the one
true leaf here — 132 lines, one form, one success alert, no outbound push — and
a legitimate dialog candidate. But it and Create are two buttons side by side in
the same pane footer. One opening a centred dialog while its neighbour replaces
the page is a distinction with no meaning to the user, for a reason
(`dismissAll` three routes away) that is invisible from the screen. Consistency
within the pair wins.

## Considered and rejected: give the child the left pane

The option that most directly answers "the settings selection is gone" is
neither of the two you posed: register the child as shell-hosted, so
`/account/[id]` renders the detail in the right pane with Accounts still
highlighted. Rejected, and worth recording because it is the one to revisit if
the deployed navigate-out reads badly:

- `isShellHostedSettingsRoute` drives `headerShown`, and the registry's doc
  comment makes that deliberate: "'Has a pane list beside it' and 'loses its
  stack header' must be the same predicate." So the child would lose its header
  — taking `projects/[id]`'s edit and delete with it (correction 3), and taking
  the back arrow.
- It breaks the registry's one-entry-one-route model. `resolveSettingsPane` maps
  a key to an entry to a route; a selection whose URL is not its entry's route
  has nowhere to live, and the shell would need to render arbitrary children for
  a selection it did not resolve.
- Splitting the two predicates so the child keeps both a pane list and a back
  arrow is coherent but doubles the mechanism, and is what that comment warns
  against.

## What wave 4's three screens become

| Screen | Becomes | `width` | Notes |
|---|---|---|---|
| `app/account/list.tsx` (322) | **pane**, key `accounts`, route `/account/list` | `form` | Its footer Create/Join buttons are block buttons with no `flex: 1`, so at `full` they become two 900px dashed bars — the appearance-chips defect in another costume. Its three pushes stay pushes. No mount effect, no `<Stack.Screen>` of its own; root is `SafeAreaView edges={[]}` + plain `ScrollView` |
| `app/tags/manage.tsx` (289) | **pane**, key `tags`, route `/tags/manage` | `form` | Keeps its `<Stack.Screen>` in the route file. `useEffect([])` → `[currentAccountId]`. Its edit `Modal` is a `SheetDialog` candidate |
| `app/projects/index.tsx` (315) | **pane**, key `projects`, route `/projects` | `form` | Same three items. **`settingsHeaderShown` must be called with `'/projects'`** — see below |

**Why `form` for all three and not `full` like wave 3's list screens.** Each is
a single-column list of *short* rows — `tags` is a colour dot, a name and a
delete icon; `projects` a stripe, a name and a stat row. At 900px the trailing
action sits ~800px from the label it belongs to, which is what the cap exists
for. Wave 3's three took `full` because their rows carry three or four columns
of content. Judged by eye, like the 720 itself.

**Child routes, all unchanged:** `/account/[id]` (430), `/account/create`
(239), `/account/join` (132), `/projects/[id]` (367), and everything they reach
— `/account/invite`, `/trip/new`, `/trip/{id}/settle-up`,
`/trip/payment-settings`, `/expense/[id]`. Not extracted, not moved, not
registered, no dialogs. **Wave 4 touches four files under `app/` and adds three
components under `src/`.**

## What a plan must not do

1. **Do not add any child route to `SETTINGS_ENTRIES`.** Their absence from the
   registry is exactly what keeps `headerShown: true`, and that header's back
   arrow is the return path this ruling depends on.
2. **Do not touch those routes' `headerShown: true` in `app/_layout.tsx`.**
3. **Do not call `settingsHeaderShown('projects/index')`.**
   `isShellHostedSettingsRoute` compares against the registry's `route`
   **exactly**, and `/projects/index` is not `/projects`, so the expo screen
   name returns `false` silently and the pane renders with both the shell **and**
   a stack header. `account/list` and `tags/manage` match under either spelling
   — which is precisely what makes the third one easy to miss. Pass
   `'/projects'`.
4. **Do not put a `<Stack.Screen>` inside an extracted body.** Wave 3's ruling:
   under `src/` it would rename whichever route later hosts the component. Both
   `tags/manage` and `projects/index` have one; it stays a sibling of
   `SettingsRoute` in the route file.
5. **Do not leave `useEffect(..., [])` in the extracted `tags`/`projects`
   bodies.** A pane stays mounted across an account switch. Note this changes
   mobile behaviour in the direction of correctness (a backgrounded route now
   refetches on account change), so **the commit must say so in its first
   paragraph**, as this branch does for every change that alters the phone.
6. **Do not restate `SETTINGS_PANE_KEYS` as "the twelve destinations under
   `app/settings/`".** It becomes fifteen, three of which are not — the type's
   meaning changes from "lives under `app/settings/`" to "configures the app and
   has been extracted", and the doc comment has to say the new thing rather than
   the old thing plus three exceptions. `SettingsLinkKey` loses `accounts`,
   `tags` and `projects` in the same edit.
7. **Do not host `projects/[id]` in a dialog on the grounds that it is a
   detail** — not without first re-homing edit and delete out of `headerRight`,
   and that is reimplementing, not hosting.
8. **Do not move `app/projects/new.tsx`, and do not give it a left-pane row.**
   Only `ProjectPicker` reaches it; it is not this hub's create affordance.
9. **If the `tags`/`projects` edit modals go through `SheetDialog`, keep
   `keyboardAvoiding`.** Both wrap their overlay in `KeyboardAvoidingScreen`
   today and both contain a `TextInput` — the addendum-2 warning, and no desktop
   check would catch its loss. Drop each screen's own `insets.bottom` read in
   the same change, or the phone gains a second gap.
10. **Zero new i18n keys.** `accounts.manage`, `settingsNav.tags` and
    `settingsNav.projects` already label these three rows and are unchanged by
    the flip from `link` to `pane`.

## What the implementer should look for

- **The three pane rows lose their outbound arrow and gain a selected state.**
  That is the visible half of the flip, and it is what tells the user the row
  behaves differently now.
- **The `dismissAll()` path is the one place the return breaks, and it is
  pre-existing.** Trace it once: `/settings` → `/account/list` (pane) →
  `/account/create` → `/trip/new` → `POP_TO_TOP` → `/account/{id}`. Back from
  there goes to the tabs, not to the Accounts pane. Identical on mobile today,
  and arguably fine (you just made a trip and are looking at it), but do not
  discover it in review.
- **Every other chain returns correctly**, because the selection is the URL:
  `/account/{id}` → back → `/account/list` pane with Accounts selected;
  `/account/create` after a successful create → `router.back()` → same;
  `/projects/{id}` → back → `/projects` pane.
- **`account/list` has no mount effect** and reads `accounts` from the
  app-global store the switcher already maintains, so it needs no
  `[currentAccountId]` treatment. Do not add one by analogy with its two
  siblings.
- **A one-frame flash of the previous account's data** is possible in `tags` and
  `projects`: the section 5g fix works by emptying the cache synchronously
  inside `set()` *before* any `[currentAccountId]` effect runs, and these two
  stores have no `reset()` to empty. Either give both a `reset()` and add them
  to `clearAccountScopedCaches()`, or accept the flash — but decide it rather
  than inherit it.
- **`canEdit`.** All three screens gate their write affordances on it today and
  a pane must keep doing so; viewers are a real role here.

## Acceptance criteria

1. At 1920, open `/settings` and click Accounts: the URL becomes
   `/account/list`, the row highlights, its outbound arrow is gone, and the
   account cards plus the Create/Join buttons are capped at 720px, not 900+.
2. Click an account card: the app navigates to `/account/[id]`, which renders as
   a full page with a stack header carrying its title and a back arrow. The
   settings shell is gone.
3. Press that back arrow: `/account/list` returns with **Accounts still
   selected** in the left pane.
4. Repeat 2-3 for Create, for Join, and for a project card → `/projects/[id]`.
5. On `/projects/[id]` at 1920, confirm the header still carries the pencil and
   trash buttons, and that they still work.
6. Delete a project from `/projects/[id]`: the confirmation is an in-app themed
   dialog, and on success the app returns to the `/projects` pane with Projects
   selected and the project gone from the list.
7. Open the Tags pane, switch accounts from the top bar without leaving it: the
   list shows the new account's tags.
8. Repeat 7 for Projects.
9. Narrow to 1000px: all three render exactly as today, with their stack
   headers back.
10. Open all three on a phone: pixel-identical to before, including bottom
    safe-area padding, and the edit sheet still lifts for the keyboard.
11. Native bundle check per section 5b, grepping for the desktop UI
    (`SettingsShell`, `SettingsNav`) rather than the registry or a native no-op
    half.

## What this ruling leaves unproven

- **Whether navigating out of a pane reads as a dead end in the product.** The
  mechanism is sound and shipped — the stack header's back arrow — but only the
  deployed screen says whether it *feels* like a return to settings or like
  having left it. If it reads badly, the option to revisit is "give the child
  the left pane", above, not a dialog.
- **A cold load of a child route on web has no back arrow**, because the stack
  is one screen deep and `back` is undefined. This is pre-existing for every one
  of the app's ~90 routes, wave 4 changes nothing about it, and nobody has
  checked it. It is nonetheless the single case where this ruling's return path
  is simply absent.
- **Whether `ExpenseDialog`'s own two outbound pushes work from inside a
  dialog** on desktop. Unmeasured. Cited above as a weakness in the
  counter-precedent, not as support.
- **`form` vs `full`** for all three, and whether 720 is right at all — the
  spec's existing open question, now with three more screens riding on it.
- **Whether the one-frame stale flash in `tags`/`projects` is visible** at all,
  and therefore whether the two stores need a `reset()`.
- **Nothing here renders in CI.** The registry is testable and should gain
  assertions for the three new pane entries; the header predicate for
  `/projects` is testable and should be pinned by name. Layout, the back arrow's
  appearance, hover, focus order and legibility across 13 accents and both
  themes are verified by a person on the deployed build, by eye.
