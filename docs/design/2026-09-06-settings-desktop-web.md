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
