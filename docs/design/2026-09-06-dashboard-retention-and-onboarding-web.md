# Dashboard — Retention & First-Run — Desktop Web Design

This extends `docs/design/2026-09-05-dashboard-web.md`; it does not replace it.
That spec settled the *shape* — a fluid focus column, a fixed 300px rail, one
page scroll — and the shape shipped and is correct. Two things it did not
answer are what this spec is for:

1. **A new user has no state on the web at all.** `useFirstRunOnboarding`
   returns early on web (`Platform.OS === 'web'`, line 78), so
   `app/get-started.tsx` has never rendered in a browser. Someone who signs up
   at `app.ai-budget.pl` lands directly on nine cards, each of which reports an
   absence.
2. **The populated screen is a report.** Every card states a number the user
   themselves caused. Nothing on it is a reason to open the tab tomorrow.

It also assumes two decisions already approved but not yet built, and designs as
though they exist: `WalletsSection` becomes a **fifth fixed slot** in the focus
column, and a **second 300px rail appears at ≥1680px**, filled row-major.

---

## What is actually available — read from the code, not assumed

Everything proposed below is checked against what the client can compute today.
This table is the load-bearing part of the spec: it is what separates "ship this
week" from "this needs API work first".

| Thing | Where it comes from | Loaded on the dashboard today? | Cost to surface |
|---|---|---|---|
| Anomaly alerts (incl. `price_overcharge`) | `alertStore.alerts` / `.unreadCount` | **Yes** — `useHomeScreenData` calls `loadAlerts()` on focus plus a 2.5s re-check | **Free.** Only a count is used today (the `WebTopBar` bell); the content is discarded |
| Pending account invitations | `invitationStore.invitations` | **Yes** — loaded in the same focus effect | **Free** |
| Budget projection / burn rate | `budgetStore.getBudgetProgress(id)` → `projectedTotal`, `dailyBurnRate`, `estimatedExhaustionDate`, `daysRemaining` | **Yes** — budgets load at sign-in and on account switch (`authSessionActions`, `AccountSwitcher`) | **Free.** Pure client math, works offline |
| Wallet balances | `walletStore.walletSummary` (computed locally) | Yes | Free |
| Inflation shield stock-up | `useInflationShield()` inside `InflationShieldWidget` | **Yes — already rendered in the rail**, self-loading, and it correctly hides itself when empty | Already surfaced. Not a gap |
| Purchase requests awaiting a vote | `api.getPurchaseRequestPendingCount()` → `purchaseRequestStore.pendingCount` | No | **One GET**, existing endpoint, non-personal accounts only. Client work, no API work |
| Upcoming subscription renewals | `userSubscriptionStore.loadSubscriptions()`; each row carries `daysUntilRenewal` server-computed | No | **One GET**, existing endpoint. Client work, no API work |
| Shopping restock / deals | `shoppingListStore.loadSuggestions()` / `.loadDeals()` | No | Two GETs — **rejected below**, not on cost grounds |
| Financial Wrapped | `api.getWrapped(year)` | No | One GET — **rejected below** |
| Price-check summary | `alertStore.loadPriceCheckSummary()` | No | One GET — **not needed**: `price_overcharge` already arrives as an ordinary alert in the feed above |
| Transaction count, natively | `countTransactions(accountId)` (SQLite) | Yes | Free on native, **always 0 on web** — `db/client.web.ts`'s `executeSql` returns `[]` |
| Transaction count, on the web | `expenseStore.expenses` / `incomeStore.incomes` after a server pull | Yes | **Free, but see the caveat below — this is the whole difficulty of Problem 1** |

### Three findings that change the design

**a. Nothing in the client can currently say "the server pull succeeded."**
`_doPullAndMerge` (`expenseSync.ts:559`) swallows a failed pull with
`console.warn('Server pull skipped:', e)` and sets no error flag — `error` is
only set for a SQLite failure, which never happens on web. `incomeStore` does
the same (`incomeStore.ts:272`). `setLastSyncTime()` writes to SQLite, a no-op
on web. So on the web `expenses.length === 0` means *either* "this account is
genuinely empty" *or* "the request failed and nobody said so", and the two are
indistinguishable from any store field that exists today. Problem 1's detection
turns entirely on closing that one bit.

**b. `useSafeToSpend`'s `hasEnoughData` does not mean what its name says.** It
is `data !== null`, and `data = serverResponse ?? localFallback`. The server
answers an empty account with a real response full of zeros, so
`hasEnoughData === true` and the hero prints **0,00 zł** with total confidence.
The *local* fallback in the same file is more honest — it returns `null` when
`walletSummary.length === 0`, explicitly commented "not enough data for a
meaningful number". The server path never gets that check applied to it.

**c. `renderBody()` and `TYPE_ICON` — the only code that turns an
`AnomalyAlert` into human text — live inside `app/alerts/index.tsx`.** Nothing
under `src/` may import from `app/`, so surfacing alert content on the dashboard
requires moving them first. This is the same move `ExpenseDetailsCard` needed,
and it loses nothing (`app/alerts/index.tsx` re-imports them).

---

# Part 1 — The new-user state

## Goal

A person who has just signed up in a browser sees, in the place they will keep
using, what the app is for and the ways to start — not nine cards reporting
that they have no money, no budget, no debts, no history and no family.

## What the empty screen says today

Read on a real empty account at 1920×855, verbatim: Safe to Spend **0,00 zł**;
Net Profit · 6M **+0,00 zł**; a flat line at zero labelled Apr–Sep; Income
**+0,00 zł** / Expenses **−0,00 zł**; no budget card; Family Feed "No activity
yet"; Financial Health "Not enough data yet" with a **?** in the gauge ring;
"Level 1", "0 days", "Start your st…" truncated, and a **View Achievements**
button; Debts & Loans "No debts yet"; Net Capital empty.

Two of those are worse than blank. **0,00 zł Safe to Spend is a false
statement** (finding b) — it is not "we don't know", it is "you may spend
nothing today". And **"View Achievements"** invites a brand-new user to open a
page of things they have not done.

## How the client decides the user is new

The existing hook's reason for bailing is correct, and this spec **does not
touch `useFirstRunOnboarding`**. That hook's job is to *navigate to a route*,
its evidence is SQLite, and on web SQLite has no evidence. Fighting it, or
weakening its guard, would put an established web user one empty local account
away from being interrupted — the exact defect its two guards exist to prevent.
The web answer belongs where web can answer honestly: inside the dashboard,
from data the dashboard already pulls.

### The one bit that has to be added

Per finding (a), the pull's success is not observable. Close it with the
smallest possible additive change, at the two places that already mark exactly
that moment:

- `expenseStore` gains `lastPullAt: number | null`, set beside the existing
  `_lastExpensesSyncAt = Date.now()` on the success path of `_doPullAndMerge`.
- `incomeStore` gains the same beside its own equivalent (`incomeStore.ts:269`).

Both are state additions. **Nothing on mobile reads them**, so the mobile
rendering cannot change — the additive-prop rule applied to a store field. This
is client work; **no new endpoint, no new request, no new dependency.** The
alternative — having the first-run check issue its own `api.getExpenses()` to
read `pagination.total` — was rejected: that endpoint requests `limit=10000`,
and the dashboard already makes exactly this call on mount.

### The predicate

Pure and unit-testable, in `src/features/onboarding/resolveWebFirstRun.ts`
(mirroring `shouldShowFirstRun.ts`, which it deliberately does not extend —
that one is native's, and its inputs are different):

```ts
export type WebFirstRunOutcome = 'wait' | 'show' | 'suppress';

export function resolveWebFirstRun(i: {
  gateOpen: boolean;
  seen: boolean;                 // firstRunStore — MMKV, i.e. localStorage on web
  canEdit: boolean;
  accountId: string | null;
  expensesPullAt: number | null; // null = no successful pull this session
  incomesPullAt: number | null;
  expenseCount: number;
  incomeCount: number;
}): WebFirstRunOutcome
```

- `!gateOpen || !canEdit || !accountId || seen` → `'suppress'`
- either `*PullAt` is `null` → **`'wait'`**
- both pulls succeeded and `expenseCount + incomeCount > 0` → `'suppress'`
- both pulls succeeded and the total is `0` → `'show'`

**It is three-valued, and that is the point.** `'wait'` must render *neither*
the first-run state *nor* the nine empty cards — it renders the loading state.
A boolean cannot express "we have not heard back yet", and a boolean is exactly
how an offline first paint gets read as "brand new". The deliberate failure
mode: a permanently offline user never sees the first-run state and sees the
ordinary (empty) dashboard instead. That is today's behaviour, and it is the
correct direction to fail — never claim someone is new without evidence.

### The two guards, carried across

Both of the native hook's guards are reproduced, one of them differently:

1. **A non-empty account marks `seen`.** `firstRunStore` is MMKV, and MMKV on
   web is localStorage-backed, so `seen` genuinely persists per browser. A user
   who onboarded on their phone opens the web app with `seen === false`; the
   count suppresses them, and writing `markSeen()` at that moment stops it from
   ever being re-evaluated. Same reasoning as `useFirstRunOnboarding`'s guard 1.
2. **One decision per session**, latched in a `useRef`. The difference from
   native: native latches when the *query is issued*; here there is no query to
   issue — the hook observes store state — so it latches when a decision of
   `'show'` or `'suppress'` is first reached, and never on `'wait'`. This is
   what makes an account switch structurally unable to re-open the question,
   which is the whole reason native's guard 2 exists (an account the user has
   never opened has no rows and counts zero).

`useWebFirstRun()` lives in `src/features/onboarding/`, is consumed only by
`DashboardDesktop`, and returns the outcome. It is **not** one of
`RootNavigator`'s cross-cutting hooks — it navigates nowhere.

## A dashboard in a first-run state, not a separate screen

**Decision: a first-run state of the dashboard.** `app/get-started.tsx` stays
exactly as it is and stays unreachable on web. Four reasons, in order of
weight:

1. **A separate screen is not a takeover on desktop, and the takeover is the
   whole premise.** On a phone, `get-started` fills the screen with nothing
   competing. On the web, `WebShell` renders `WebTopBar` above every
   authenticated route — five nav items, one of them "Dashboard", already
   highlighted. The user can click straight out of onboarding into the nine
   empty cards. The idiom does not survive the chrome it would sit in.
2. **It does not solve the stated problem, only defers it.** Adding one expense
   populates two cards. Family Feed, Financial Health, Debts, Net Capital and
   Wallets still report absence the moment onboarding finishes. The dashboard
   needs a first-run state *regardless* of whether a separate screen exists —
   building both is building the same thing twice, and they will drift.
3. **A browser refresh is a normal act, and a route is a URL.** Rendering a
   state inside `/(tabs)/index` makes a refresh idempotent and keeps the URL on
   the dashboard. A `router.replace('/get-started')` puts a new user's first
   URL somewhere they may bookmark, and re-runs the whole decision on every
   reload — and the native code already carries an entire out-of-band flag
   (`firstRunStore.nextAfter`) precisely because a `replace` here clobbered
   another navigation.
4. **Width is the affordance a phone does not have.** A 1920px window can show
   the invitation *and* the shape the user is about to live in. A centred 480px
   card cannot, and would be a phone screen with more whitespace — the exact
   failure this design language exists to prevent.

What this gives up: the two platforms tell slightly different first-run
stories. That is acceptable — the mobile screen is unchanged and remains the
mobile answer; this spec's scope is web ≥1024px only.

## What the first-run dashboard shows

The two-column shape is kept, so the layout the user learns is the layout they
will use.

### Focus column

**A start panel.** Heading and subheading reuse `onboarding.heading` /
`onboarding.subheading` verbatim (already translated in all nine locales for
`get-started.tsx`). Below them, the entry paths as a **2×2 grid of large
cards**, not a vertical list — the wide window's dividend.

**The primary card is Import, not Scan receipt — a deliberate divergence from
mobile's ordering.** The camera is on the phone; the bank statement is on the
laptop. On desktop, importing a CSV or PDF is both the easiest first action and
the only one that populates *every* card at once, turning nine absences into
nine real numbers in a single step. Ordering, with existing keys:

| Card | Route | Keys |
|---|---|---|
| **Bring your history** (primary, filled) | `/settings/import` | `onboarding.bringHistory`, `onboarding.bringHistoryHint` |
| Scan a receipt | `/expense/receipt` | `onboarding.scanReceipt`, `onboarding.scanReceiptHint` |
| Type it manually | `/expense/new` | `onboarding.typeManually` |
| Use your voice | `/expense/voice` | `onboarding.useVoice` |

Voice is last on desktop for the same environmental reason — dictating at a
desk is the least natural of the four. It is not removed.

**"I'll do this later"** (`onboarding.later`) sits below, sets `seen`, and
reveals the ordinary dashboard immediately.

**No mock data anywhere.** No greyed skeleton cards, no sample chart, no
placeholder numbers. A dashboard that shows invented figures to teach a layout
is teaching the user to distrust the figures.

### Rail — the setup checklist

The rail's fixed quick-action list is **hidden** in the first-run state (a
`+ Expense` button beside a 2×2 grid whose third card is "Type it manually" is
the same action twice). In its place, one card: three real steps, each with a
live tick derived from data already loaded.

| Step | Satisfied when | Destination | Why it is on the list |
|---|---|---|---|
| Add your first transaction | `expenseCount + incomeCount > 0` | any of the four cards | — |
| Set your wallet balance | `walletSummary.length > 0` | `/wallet/set-balance` | This is exactly what makes Safe to Spend, Net Capital and Wallets stop saying nothing. It is also the honest fix for the **0,00 zł** lie |
| Create a budget | an active monthly budget exists (`monthlyBudgetSummary.budgetCount > 0`) | `/budget/new` | Makes the Monthly Budget slot appear and completes a second Financial Health component, moving it off "Not enough data yet" |

Keys reuse `wallet.addBalance` / `wallet.noBalancesHint` and
`budgets.createBudget` / `budgets.createHint`; only the card's own title and the
first row's label are new (see i18n below).

**The checklist outlives the first-run state.** Once first-run ends it moves to
the top of the ordinary rail and stays while any step is outstanding, then
disappears on its own. This covers the real hole in the "separate screen"
option: a user who adds one expense and never sets a wallet balance is exactly
the user whose Safe to Spend reads 0,00 forever, and after onboarding nothing
would otherwise tell them why. It is dismissible, persisted in `firstRunStore`
under a new `checklistDismissed` key. It is *prepended* to the rail, exactly as
`InvestmentCard` already is — it takes no `WidgetKey` and no slot.

## Suppressing the false zero

Independent of first-run, and applying to every desktop user: `FocusColumn`
gates `showSafeToSpendRow` on `walletSummary.length > 0` in addition to its
current conditions. This is not an invented rule — it applies to the server
path the *same* condition `useSafeToSpend`'s local fallback already applies to
itself (`if (!hasWalletData) return null`), which today only the offline path
honours. Gated in `FocusColumn`, so the mobile hero is untouched.

## Exit

No "Done" button. The state ends when `expenseCount + incomeCount > 0`
(automatically, on the next store update) or when "I'll do this later" is
clicked. Both leave `seen === true`, so a refresh does not bring it back.

---

# Part 2 — Holding the populated screen

## The test

A screen people return to answers a question **whose answer changes while they
are not looking**. Every card on the dashboard today answers a question that
changed because the user changed it. That is the whole diagnosis, and it is why
"add more cards" is not the answer.

Three conditions, all required, applied to each candidate:

1. **Unpredictable** — the user could not have known this without opening the app.
2. **Time-bounded** — acting on it later is worth less than acting now.
3. **One-step actionable** — there is something to do that fits in a row.

| Candidate | Unpredictable | Time-bounded | One-step | Verdict |
|---|---|---|---|---|
| Anomaly alerts (duplicate charge, price increase, category spike, `price_overcharge`) | yes | yes — a duplicate charge is worth catching this week | yes — open or dismiss | **Add** |
| Pending invitations | yes | yes — someone is waiting | yes — Accept / Decline | **Add** |
| Purchase requests awaiting your vote | yes | yes — it is blocked on you | yes — open and vote | **Add**, non-personal accounts only |
| Subscription renewals ≤7 days | *predicted a month ago, forgotten now* | yes | yes | **Add**, and only inside 7 days, where "you knew" stops being true |
| Budget projected to exceed | yes — the projection moves daily | yes — only actionable before the period ends | yes | **Add as an extension**, not a card |
| Inflation shield stock-up | yes | yes | yes | **Already on the screen.** `InflationShieldWidget` sits in the rail, self-loading and self-hiding. Not a gap |
| Shopping restock | no — a staple runs out on schedule | no | yes | **Reject** |
| Shopping deals | partly | weakly | yes | **Reject** — it has its own screen and its own push, and it would compete with alerts for the same slot and lose |
| Financial Wrapped | no — annual | no | yes | **Reject** on a landing screen |
| Price-check summary endpoint | — | — | — | **Not needed** — `price_overcharge` already arrives through the alerts feed |

Five in, four out. The four rejections are the point: a landing screen that
surfaces everything surfaces nothing.

## One card, not five

The five additions become **one** block: **"Needs your attention."** Five
separate cards would put five differently-shaped urgencies in five different
places and reintroduce exactly the "which number matters" problem the focus
column was built to solve. One ordered list means there is exactly one place on
the screen that can ever demand something — and it is empty on a calm day,
which is correct behaviour, not a failure.

**Composition and order** (most urgent first):

1. Pending invitations — another person is waiting, and there are usually zero or one
2. Purchase requests awaiting your vote — blocked on you, non-personal accounts only
3. Unread anomaly alerts, newest first (this includes `price_overcharge`)
4. Budgets projected to exceed before the period ends
5. Subscriptions renewing within 7 days

**Capped at 3 rows**, with a `+N more` row opening `/alerts`. The cap is not
arbitrary: at 855px the viewport minus the 56px top bar and 40px of padding
leaves ~760px, the approved hero is 210px, and three rows plus a header is
~200px — 410px total, so **the hero is never pushed below the fold by an
attention item**. Five rows would put it at ~510px: still above the fold, but
with nothing to spare on a 768px laptop.

**Ordering across kinds is by kind, not by timestamp.** An invitation from
three days ago outranks an alert from this morning because a person is waiting
on it. Stated here so nobody later "fixes" it into a single sorted-by-date list.

**It hides entirely when empty.** Most days it will be.

**Placement: first slot of the focus column, above the hero, only when
non-empty.** The focus column is already a template of independently-optional
slots; this is one more with the same rule. When something needs doing it
outranks something that reports; when nothing does, the hero is the first thing
on the screen exactly as approved.

**It is not a widget.** No `WidgetKey`, no visibility toggle, no place in
`widgetOrder`. Argued under Departures — in short, every item in it is
individually dismissible or self-resolving, so it empties itself, and a global
toggle would let a user hide an invitation that is waiting on them.

## The budget projection line

Not a new card — a second line on the existing Monthly Budget slot, from data
already computed. `BudgetProgress` carries `projectedTotal`, `dailyBurnRate`,
`estimatedExhaustionDate` and `daysRemaining`; the card shows only
`percentageUsed` today.

"340 zł of 500 zł · 68%" is a report. "**At this rate you reach 500 zł on the
24th**" is a reason to behave differently today. The line renders only when
`projectedTotal > budget.amount`; otherwise the card is unchanged. When it
renders, that budget also becomes an attention row.

Delivered as an additive `projection?` prop on `MonthlyBudgetCard`, undefined
from mobile's call site — mobile output byte-identical.

## Hero chart

Two questions arrived from implementation while this was being written. Both
are about the 110px compact chart in the hero, and both are settled here rather
than in a separate round.

### The reveal animation, dropped on desktop — confirmed, keep it dropped

The library animates the chart's wrapper width once, from an `Animated.Value`
seeded on the first layout pass. On web that first pass reports a stale,
narrower width than the settled flex container, while the drawn path tracks the
true width every render — so the wrapper froze narrow and clipped roughly the
right-hand third. That is the constant ~661px gap measured across two builds.
Disabling the reveal for the compact chart is the right fix and the desktop
hero chart should appear at full width immediately, with no draw-in.

**Nothing should replace it, and specifically not a fade on the card.** The
hero's first line is Safe to Spend at 32px — the single most important figure
on the screen. A card-level fade would delay *that* in order to decorate a
110px trend indicator that was deliberately demoted to an eyebrow. It would
also re-fire on every 3M/6M/12M chip press, turning the range control into
something that feels laggy. On a landing screen an entrance animation is delay
before information; the chart is not the subject here, and it does not need an
entrance.

**One trap: gate the change on the `compact` prop, never on
`Platform.OS === 'web'`.** Below 1024px the web build renders
`DashboardMobile`, which passes no `compact` — a platform gate would silently
change the narrow-web rendering, and narrow web *is* the mobile rendering,
which may not change.

### A flat run against the axis — do not restyle the line; do not draw the chart

Two separate answers, because these are two separate problems.

**Below two populated months, the chart should not be drawn at all.** A trend
chart exists to compare periods. With one month of data there is nothing to
compare, and the five flat months are not flat — they are *absent*. Drawing
them makes a confident false claim ("your net profit has been level since
April"), which is the same error as the **0,00 zł** Safe to Spend in finding
(b): stating a zero where the app means "no data". This spec already refuses
that for Safe to Spend; refusing it here is consistency, not a second rule.
It also serves the first-run brief directly — a sparse account is most accounts
in the week after onboarding, and a chart that reads as broken is worse on that
screen than no chart.

The rule: the hero renders the chart and the range chips only when **at least
two calendar months in the selected range contain at least one transaction**.
Below that it keeps the Safe to Spend row and the net-profit headline — both
true with one month of data — and replaces the chart with one line of copy.
`NetProfitWidget` already walks these monthly buckets to build its series, so
the count is free from the same loop.

**Count months with at least one transaction, not months with a non-zero net.**
A month with 500 in and 500 out is a real, populated month whose net is
genuinely zero; counting by net would hide the chart from a break-even user,
which is precisely the person a net-profit trend is for. Worth stating because
the two counts are one line apart and the wrong one looks correct.

**Above the threshold, a genuinely zero month still sits on the axis — fix that
by letting the axis recede, not by restyling the line.** The chart currently
draws `xAxisThickness={1}` with `xAxisColor={theme.colors.border}`, while its
horizontal grid uses the lighter `rulesColor={theme.colors.borderLight}`. So
the zero rule is drawn *heavier* than the grid it belongs to, and an accent line
resting on it has nothing to separate itself from. For `compact` only, draw the
x-axis at `theme.colors.borderLight` so it reads as grid weight and the line
reads as foreground over it. One prop value, no new component, and it fixes the
general case rather than special-casing flatness — a thicker or offset line
would misrepresent the value, which is exactly zero and should be drawn there.

Mobile is untouched by all three changes: the threshold, the axis colour and the
animation are all gated on `compact`, which mobile's call site does not pass.

## Where the eye goes, in order

1. **Needs your attention**, when it exists — the only accent-filled, bordered
   block on the screen. It exists precisely on the days something needs doing.
2. **The hero** — Safe to Spend at 32px, then Net Profit and its 110px trend.
3. **Income & Expenses → Monthly Budget (now with the projection) → Wallets.**
   Unchanged narrative: the result, its two halves, the plan, the balance.
4. **The rail** — quick actions, the checklist while it is live, then the
   user's own cards in their own order.
5. **The second rail (≥1680px)** is the row-major *continuation* of 4, never a
   second focus. Stated explicitly so nothing important is ever placed there:
   at 1440px it does not exist, so anything living only at 1680px is invisible
   to most users.

## What a click does

**The rule: a click that changes state resolves in place; a click that changes
subject may navigate, but only to a screen that already has a desktop
treatment.** Navigating away *is* the user leaving; navigating to a stretched
mobile screen is the user leaving and being punished for it.

| Click | Today | Becomes | In place? |
|---|---|---|---|
| Attention row → alert referencing an expense | bell → `/alerts` → tap → `/expense/[id]` | **`ExpenseDialog`** with `{ kind: 'expense', expense }` | **Yes.** The component exists (`src/components/expenses/desktop/ExpenseDialog.tsx`), takes a `LedgerRow`, and already hosts everything `app/expense/[id].tsx` hosts |
| Attention row → `recurring_suggestion` | `/subscriptions/new`, prefilled | Inline **Track it** → `userSubscriptionStore.createSubscription({...})` from the alert's own params, then dismiss the alert | **Yes** |
| Attention row → invitation | `/alerts?tab=invitations` | **`InvitationCard`** inline — it already lives in `src/components/alerts/` and already takes `onAccept` / `onDecline` | **Yes** |
| Dismiss (×) on an alert row | — | `alertStore.dismiss(id)`, optimistic | **Yes** |
| Attention row → `possible_merge` | `/expense/merge` | Unchanged — navigates | No. A two-expense merge is a real screen with real choices. Named as an accepted leave |
| Attention row → purchase request | — | `/purchase-requests/[id]` | No — voting needs the full context |
| Attention row → renewal | — | `/subscriptions` | No |
| Attention row → budget projection | — | the **Budgets tab**, which has a desktop treatment | No, but it stays inside the desktop app |
| Safe to Spend | dialog | Unchanged | Already yes |
| Financial Health | dialog (`desktop` prop) | Unchanged | Already yes |
| Rail card (Debts, Goals, Calendar, Wallets, Fat Finder, Family Feed…) | navigates to a stretched mobile screen | **Unchanged by this spec** | No — named as the known cost. Those screens have no desktop treatment, and inventing one for each here is out of scope |

Note on the existing expense-resolution quirk: an alert's `expenseId` is the
**server PK**, and a locally-created row is keyed by its clientId until a pull
backfills `serverId`. The dialog path must reuse the existing four-way
resolution and its pull-and-retry (`id` / `serverId` / `clientId` / `localId`,
then one forced `loadExpenses({ force: true })`, then
`alerts.alreadyResolved*`) — moved out of `app/alerts/index.tsx` alongside
`renderBody`, not rewritten. Rewriting it is how "the expense won't open from
the alert" comes back.

## Phasing — ship the free half first

**Phase A, zero new requests.** The first-run state, the checklist, the
`lastPullAt` bit, the 0,00 zł suppression, "Needs your attention" carrying
invitations + alerts + budget projections, the budget projection line, and the
in-place dialog and inline actions. Everything in Phase A reads data the
dashboard already loads.

**Phase B, two GETs to existing endpoints.** Purchase-request pending count
(non-personal accounts only) and subscriptions (for renewals ≤7 days). Both
load from `DashboardDesktop`, both fail silent (`console.warn`, keep going —
the `inflationShieldStore` precedent), and an attention list that never gets
them is simply shorter.

**No API work in either phase.** No new endpoint, no new column, no migration,
no new dependency.

---

## Layout

### ≥1680px — first-run state

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ WebTopBar: AI Budget · Dashboard Expenses Budgets Analytics AI Chat     [acct][zł][🔔][⚙]     │
├──────────────────────────────────────────────────────────┬─────────────────┬─────────────────┤
│  FOCUS COLUMN (fluid)                                    │  RAIL (300)     │  RAIL 2 (300)   │
│                                                          │ ┌─────────────┐ │                 │
│   Where would you like to start?                         │ │ Set up      │ │  (empty in the  │
│   Add one thing and the app starts working for you.      │ │ ○ Add your  │ │   first-run     │
│                                                          │ │   first     │ │   state — no    │
│  ┌──────────────────────────┐ ┌────────────────────────┐ │ │   transaction│ │   widgets yet) │
│  │ ⬇  Bring your history    │ │ 🧾 Scan a receipt      │ │ │ ○ Set your  │ │                 │
│  │    From your bank or     │ │    Line items and      │ │ │   wallet    │ │                 │
│  │    another budgeting app │ │    categories, read    │ │ │   balance   │ │                 │
│  │                     ▸    │ │    for you        ▸    │ │ │ ○ Create a  │ │                 │
│  └──────────────────────────┘ └────────────────────────┘ │ │   budget    │ │                 │
│  ┌──────────────────────────┐ ┌────────────────────────┐ │ └─────────────┘ │                 │
│  │ ✎  Type it manually  ▸   │ │ 🎤 Use your voice  ▸   │ │                 │                 │
│  └──────────────────────────┘ └────────────────────────┘ │                 │                 │
│                                                          │                 │                 │
│                    I'll do this later                    │                 │                 │
└──────────────────────────────────────────────────────────┴─────────────────┴─────────────────┘
                       one page scroll · no mock data anywhere
```

### ≥1680px — populated, with something needing attention

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ WebTopBar                                                              [acct][zł][🔔3][⚙]    │
├──────────────────────────────────────────────────────────┬─────────────────┬─────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │ ┌─────────────┐ │ ┌─────────────┐ │
│ ┃ Needs your attention                                 ┃ │ │ [+ Expense] │ │ │ 📅 September│ │
│ ┃ 👤 Anna invited you to "Family"   [Accept][Decline]  ┃ │ │ Inc Scan Voi│ │ │  ...grid... │ │
│ ┃ ⧉  Biedronka charged 89 zł twice in two days      ×  ┃ │ └─────────────┘ │ └─────────────┘ │
│ ┃ ▦  Groceries reaches its 500 zł limit on the 24th    ┃ │ ┌─────────────┐ │ ┌─────────────┐ │
│ ┃ +2 more                                            ▸ ┃ │ │ ⭐ Health 82│ │ │ 🎯 Goals    │ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │ └─────────────┘ │ └─────────────┘ │
│ ┌──────────────────────────────────────────────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │
│ │ Safe to spend today   84 zł                        › │ │ │ Lvl 4 🔥 6d │ │ │ 🛡 Shield   │ │
│ │ Net profit this month      +1 240 zł  [3M][6M][12M]  │ │ └─────────────┘ │ └─────────────┘ │
│ │   ╭╮     ╭───╮                                       │ │ ┌─────────────┐ │      ...        │
│ │  ╭╯╰─────╯   ╰──╮_________________                   │ │ │ 👤 owes 400 │ │                 │
│ └──────────────────────────────────────────────────────┘ │ └─────────────┘ │                 │
│ ┌──────────────────────────────────────────────────────┐ │      ...        │                 │
│ │ Income +3 200 zł        │        Expenses −1 960 zł  │ │                 │                 │
│ └──────────────────────────────────────────────────────┘ │                 │                 │
│ ┌──────────────────────────────────────────────────────┐ │                 │                 │
│ │ Monthly Budget · 10 Aug – 9 Sep      340 of 500 zł   │ │                 │                 │
│ │ ▓▓▓▓▓▓▓░░ groceries ▓▓ household ▓ other        68%  │ │                 │                 │
│ │ ⚠ At this rate you reach 500 zł on the 24th          │ │                 │                 │
│ └──────────────────────────────────────────────────────┘ │                 │                 │
│ ┌──────────────────────────────────────────────────────┐ │                 │                 │
│ │ Wallets   [zł 2 140] [€ 310] [$ 45]                  │ │                 │                 │
│ └──────────────────────────────────────────────────────┘ │                 │                 │
└──────────────────────────────────────────────────────────┴─────────────────┴─────────────────┘
```

### 1440–1679

Identical, minus the second rail. `SECOND_RAIL_MIN_WIDTH = 1680`, declared in
`src/components/webLayout.constants.ts` beside `DESKTOP_MIN_WIDTH` and
`FACET_RAIL_MIN_WIDTH`.

### 1024–1439

**Nothing structural changes.** The attention panel's rows wrap their action
buttons under the text below ~700px of focus-column width, and the first-run
2×2 grid becomes 1×4 below the same threshold — both measured with `onLayout`
on the container, **not** from `useContentWidth()`, which is for single-column
screens and would report the window rather than the column.

---

## States

**Loading (`'wait'`).** One centred spinner in the focus column, the rail empty.
This is the state that must not be skipped: rendering nine empty cards while
the pull is in flight is what makes an offline first paint look like a new
account. It ends when both `lastPullAt` values are set — or never, if the
network never answers, in which case the ordinary dashboard renders, unchanged
from today.

**First-run (`'show'`).** As drawn. No hero, no widgets, no mock data, no
"View Achievements".

**Populated, calm.** The attention panel is absent; the screen is exactly the
approved layout plus the budget projection line where it applies. This is the
common case and it must not look like something failed to load.

**Populated, with attention.** As drawn, capped at three rows.

**Checklist partially done.** First-run has ended; the checklist card sits at
the top of the rail showing only the outstanding steps, until all three are
done or it is dismissed.

**Error.** No dedicated error UI, matching every widget's own precedent — with
the one exception that a *failed pull* is now distinguishable internally, and is
used to hold the loading state rather than to render an error.

---

## Interactions

**Hover.** Attention rows get a subtle surface tint on hover — they are the one
new element on this screen with no border of its own competing (the panel
carries the border; the rows do not), so the reasoning that ruled hover tints
out for bordered widget cards does not apply here. The inline Accept / Decline /
Track it / × controls are real buttons and get `cursor: pointer` for free.

**Every hover affordance has a focusable twin.** The × dismiss is a real
`Pressable` in the tab order, not a hover-revealed control — three rows is not
enough clutter to justify hiding it, and hiding it would make dismissal
mouse-only.

**Keyboard.** Tab order follows reading order: attention panel (row, then its
inline buttons, per row) → focus column slots → rail quick actions → checklist
→ rail cards → second rail. `Enter` / `Space` activate. Opening `ExpenseDialog`
from a row restores focus to that row on close, which falls out of RN's `Modal`
without any bookkeeping here.

**Right-click.** None added.

**Selection.** None — no rows in the ledger sense, no bulk actions.

**Dialogs.** Three, all built on RN's `Modal` with a raw `<div>` scrim (never a
`Pressable` — it would become the focus trap's first target):
`SafeToSpendSheet` and `FinancialHealthWidget`'s panel, both already converted,
plus `ExpenseDialog`, reused as-is from the transactions screen.

**Confirmations use `showAlert`, never `Alert.alert`** — react-native-web stubs
the latter to a no-op, and this has already been found twice in unrelated code.

---

## Component moves and new files

**Moved (required — `src/` cannot import from `app/`):**

- `renderBody()` and `TYPE_ICON` out of `app/alerts/index.tsx` →
  `src/features/alerts/alertPresentation.ts`, unchanged. `app/alerts/index.tsx`
  imports them back; its rendering is identical.
- The four-way expense resolution and its pull-and-retry
  (`isExpenseResolvableLocally`, `openAlertTargets`) →
  `src/features/alerts/resolveAlertExpense.ts`. Not rewritten. Both screens use
  the one copy.

**New, desktop-only:**

- `src/components/home/desktop/AttentionPanel.tsx` — the panel and its rows.
- `src/components/home/desktop/FirstRunPanel.tsx` — heading, 2×2 grid, skip link.
- `src/components/home/SetupChecklist.tsx` — used by both the first-run rail and
  the ordinary rail, so it is not under `desktop/`.

**New, pure, unit-tested** (nothing renders in CI, so every decision that can be
numerically or logically wrong lives here):

- `src/features/onboarding/resolveWebFirstRun.ts` — the three-valued predicate.
- `src/features/onboarding/resolveSetupSteps.ts` — which checklist steps are done.
- `src/features/dashboard/attentionItems.ts` — `buildAttentionItems(inputs)`:
  composition, the by-kind ordering, the cap, and the `+N more` count.
- `src/features/dashboard/budgetProjection.ts` — whether a budget is projected to
  exceed, and on what date.

**Extended, additive props only** (mobile call sites pass nothing):

- `MonthlyBudgetCard` — `projection?`.
- `NetProfitWidget` / `InteractiveLineChart` — the three `compact`-gated
  changes from **Hero chart**: reveal animation off, x-axis drawn at
  `borderLight`, and the two-populated-months threshold that hides the chart
  and the range chips. All three read the existing `compact` prop; none adds
  a platform check.
- `expenseStore` / `incomeStore` — `lastPullAt: number | null`.
- `firstRunStore` — `checklistDismissed`, with a pure `resolve*` reader beside
  the existing `resolveSeen`.

**Not touched:** `useFirstRunOnboarding.ts`, `app/get-started.tsx`,
`shouldShowFirstRun.ts`, `HomeQuickActionStrip.tsx`, `DashboardMobile.tsx`, and
every rail widget's internals.

## i18n

Reused verbatim, no new translation: `onboarding.heading`, `.subheading`,
`.scanReceipt`, `.scanReceiptHint`, `.useVoice`, `.typeManually`,
`.bringHistory`, `.bringHistoryHint`, `.later`; every `alerts.*` title/body key
(via the moved `renderBody`); `alerts.invitation*`; `wallet.addBalance`,
`wallet.noBalancesHint`; `budgets.createBudget`, `budgets.createHint`;
`subscriptionManager.renewalToday`, `.renewalTomorrow`, `.renewalInDays`;
`purchaseRequests.title`, `.pending`.

New, needed in all nine locales (`en`, `pl`, `de`, `es`, `fr`, `ru`, `ua`,
`be`, `nl`) — deliberately few:

| Key | English |
|---|---|
| `dashboard.needsAttention` | Needs your attention |
| `dashboard.attentionMore` | +{{count}} more |
| `dashboard.setupTitle` | Set up |
| `dashboard.setupAddTransaction` | Add your first transaction |
| `dashboard.budgetProjection` | At this rate you reach {{limit}} on {{date}} |
| `dashboard.renewsSoon` | {{name}} renews in {{count}} days |
| `dashboard.votePending` | {{count}} purchase request awaiting your vote |
| `dashboard.trackIt` | Track it |

`dashboard.votePending` and `dashboard.renewsSoon` are count-bearing and need
`_one` / `_few` / `_many` variants in the Slavic locales, following `map.*`'s
existing precedent in this codebase.

---

## Departures from the design language

**A sixth fixed slot in the focus column, above the hero, that is not a widget.**
The design language does not forbid this, but the dashboard spec's own rule is
that widget position is user-driven except in the focus column, and its own
Departures section already names the four-key override. "Needs your attention"
goes further: it has no `WidgetKey` at all, so it cannot be hidden or reordered.
Justification: it is not a view of the user's data, it is a queue of things the
app needs the user to answer, and every item in it is individually dismissible
(`alertStore.dismiss`) or self-resolving (an invitation is answered, a renewal
passes, a budget period ends). It empties itself, so a global toggle would buy
exactly one thing — the ability to permanently hide an invitation that another
person is waiting on. Revisit if it reads as heavy-handed once shipped.

**The first-run entry order differs from mobile's.** Mobile leads with Scan a
receipt; desktop leads with Bring your history. Named rather than left to be
noticed: the camera is on the phone and the statement file is on the laptop.
The mobile ordering in `get-started.tsx` is unchanged.

**A hover tint on attention rows**, where the dashboard spec ruled hover tints
out for widget cards. The reason it ruled them out — a second tint on a card
that already has a 2px border reads as doubled chrome — does not apply to rows
inside a bordered panel.

**Two GETs added to the dashboard's mount (Phase B)**, where the shipped
dashboard spec added none. Both are conditional, both fail silent, and both
already exist as endpoints. Named because "the dashboard makes no new requests"
was previously true and stops being true.

No other departures. Still no facet rail, no day grouping, no selection —
nothing on this screen is a row in the ledger sense.

---

## Acceptance criteria

Nothing in this repo renders a component in CI — there is no
`react-test-renderer`. Every criterion below is written to be checked by a
person on the deployed build; the four pure modules named above carry the unit
tests for what can be tested without rendering.

**First-run**

1. Sign up in a browser at ≥1440px. The dashboard shows the start panel with a
   2×2 grid, not nine empty cards, and the URL stays on the dashboard.
2. Reload that page. The same state appears, with no flash of empty cards
   in between.
3. With DevTools set to offline, reload. A spinner appears and stays: **no**
   first-run panel and **no** empty cards. Go back online, reload — the correct
   state appears.
4. Sign in as an established user in a browser that has never seen this app.
   The ordinary dashboard appears immediately, with no first-run flash. Reload —
   still no flash.
5. Import a statement from the primary card. On return, the first-run state is
   gone and the real dashboard is there.
6. Click "I'll do this later". The real dashboard appears; reload does not bring
   first-run back.
7. On an account with transactions but no wallet balance set, the hero shows no
   Safe to Spend row at all — not `0,00`.
8. Open the same account on a phone. `get-started` behaviour and the mobile
   dashboard are pixel-identical to before this change.

**Retention**

9. On a calm account, the attention panel is absent and the hero is the first
   thing on the screen.
10. With an invitation, an unread alert and an over-projecting budget present,
    the panel shows exactly three rows in that order, plus `+N more` if there
    are others.
11. At 1440×855 with the panel showing, the hero's Safe to Spend figure is fully
    visible without scrolling.
12. Accept an invitation from the panel. The row disappears, the account list
    updates, and the page does not navigate.
13. Click an alert about a duplicate charge. The expense opens **in a dialog**;
    `Esc` closes it and focus returns to the row that opened it.
14. Click × on an alert row. It disappears immediately and is still gone after a
    reload.
15. Click "Track it" on a `recurring_suggestion` row. A subscription is created,
    the row disappears, and the page does not navigate.
16. On a budget projected to exceed, the Monthly Budget card shows the projection
    line and the same budget appears as an attention row. On a budget not
    projected to exceed, neither appears.
17. Resize from 1700px to 1600px. The second rail's cards move into the first
    rail; nothing disappears, and the attention panel and focus column are
    unaffected.
18. Switch to light theme and repeat 9–11. Then switch the accent to each of the
    four most extreme of the 13 and confirm the attention panel's text is
    legible on its fill, in both themes.

**Hero chart**

19. On a desktop account with several months of history, the hero chart is at
    full width on the first paint — no draw-in, and no clipped right-hand third.
    Press 3M, 6M, 12M in turn: each redraw is immediate, and nothing on the card
    fades.
20. Open the same account in a browser window narrowed to 900px. The chart
    animates in exactly as it does on a phone — proof the change was gated on
    `compact` and not on platform.
21. On an account with exactly one month containing transactions, the hero shows
    Safe to Spend and the net-profit figure but **no chart and no range chips**.
    Add a transaction dated in a second month; the chart and the chips appear.
22. On an account where one month has equal income and expenses, that month
    counts toward the threshold — the chart is drawn, with a point sitting on
    zero rather than the month being treated as absent.
23. With the chart drawn and one month at exactly zero, the line is
    distinguishable from the axis rule beneath it, in both themes and at the
    lightest of the 13 accents.

---

## Open questions

- **Whether the checklist should survive first-run at all, or nags.** It is
  designed to disappear on its own and to be dismissible, but "a persistent
  to-do list on a finance dashboard" is a judgement only real use settles.
- **Whether three attention rows is the right cap.** The arithmetic protects the
  hero at 855px; whether three feels sufficient or truncated on a busy shared
  account is not answerable from source.
- **Whether ordering attention items by kind rather than by time reads as
  correct.** A three-day-old invitation above this morning's duplicate charge is
  deliberate, and may still feel wrong in practice.
- **Whether Import should really lead on desktop.** The reasoning is sound (the
  file is on this machine) but untested, and it puts the highest-friction path
  first for a user with no statement to hand.
- **What a new user on a shared account sees.** They may be new to the app while
  the account is full of someone else's data — the count suppresses first-run,
  correctly, but they then get no orientation at all. Not solved here.
- **Whether the `'wait'` state should time out** into the ordinary dashboard
  after some seconds, rather than holding a spinner indefinitely on a
  permanently offline session. Holding is the honest default; a timeout may be
  the kinder one.
- **Whether two populated months is the right threshold for drawing the hero
  chart**, and whether a thin-history account should also get a narrower
  *default* range (3M rather than 6M) — the previous spec proposed exactly that
  as the fix for the reported "leftmost tenth" symptom, and the two interact.
  Left unresolved rather than guessed at.
- **The per-widget loading flash beyond `isHydrating`** — still open from the
  previous spec. The `lastPullAt` bit added here closes it for expenses and
  incomes only, not for the seven other stores.
- **Light theme and the 1024–1439 band**, per the standing caveat: nothing in
  this repo renders a component in CI, so these are checked by eye on the
  deployed build or not at all.
