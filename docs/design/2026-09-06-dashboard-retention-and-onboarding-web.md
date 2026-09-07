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

---

# Addendum — the empty 500px below first-run (2026-09-06)

Measured at 1920×855: content occupies the top ~290px. Ruling below.

## The emptiness is geometric, not a content shortage

At 1920 with the second rail the screen is **three columns** — focus 1240px
(1920 − 40 padding − 300 − 300 − 40 gaps), plus two 300px rails holding one
small checklist card between them. So the empty region is not only the 500px
below; it is also ~600px of rail to the right. Both come from the same cause.

**My original reasoning was wrong on one point and I am reversing it here.** I
argued the first-run state should keep the focus/rail split "so the layout the
user learns is the layout they will use". An empty rail teaches nothing — it
teaches that there is a column here which is broken, which is precisely the
"failed to finish loading" reading reported. The rail is a container for
user-configurable widgets; a user with no data has no widgets. Pretending
otherwise is what produced two empty regions instead of one.

**Ruling: the first-run state does not use the focus/rail split.** It is a
single composition across the full content width. `DashboardDesktop` renders
either the first-run composition **or** the focus+rail layout — never the
first-run panel inside the rail geometry.

## What fills the space — none of the four candidates

Nothing is added. The space is filled by fixing the geometry and letting the
subject occupy it. All four offered candidates are rejected:

- **A preview of the populated dashboard.** Without numbers it is grey boxes,
  which is the reported symptom rather than its cure. With numbers it is the
  next item.
- **A worked example with obviously-fake figures, plainly labelled.** This is
  the `0,00 zł` error with a label on it — the exact error the surrounding work
  exists to remove. Labels are missed, and screenshots outlive their captions.
  In an app whose subject is not stating a number it does not have, inventing
  money on the first screen is the one thing that cannot be done.
- **"What the app can do for you once there is data."** Every honest version is
  a list of feature names — that is the settings hub, not onboarding. It also
  competes with the four entry cards for the single decision this screen exists
  to produce, and a second place for the eye to go is how a user does neither.
- **Nothing at all, re-centred.** Closest to right, and the reason the ruling is
  "no new content" — but re-centring alone leaves the two empty rails, so it
  treats the symptom.

## The composition

Single column, full content width, top to bottom. Every string already exists in
all nine locales; **zero new keys.**

1. `onboarding.heading` / `onboarding.subheading`
2. **Primary, full width** — Bring your history (`onboarding.bringHistory`,
   `onboarding.bringHistoryHint`) → `/settings/import`
3. **A row of three** — Scan a receipt / Type it manually / Use your voice
   (`onboarding.scanReceipt` + `.scanReceiptHint`, `.typeManually`, `.useVoice`)
4. **The checklist, promoted from a rail card to a full-width horizontal band**
   of three ticked steps — the same component and the same keys
   (`wallet.addBalance`, `budgets.createBudget`, whatever the shipped step-1
   label uses), laid out across rather than down
5. `onboarding.later`

Approximate vertical budget at 855: 120 heading + 140 primary + 160 row +
110 band + 60 skip + ~80 gaps ≈ 670, plus the 56px bar and 40px padding ≈ 766
of 855. Full without stretching, and the primary card genuinely reads as
primary at ~1240px wide rather than as one filled tile in a 2×2.

**Degradation.** The row of three wraps to 2+1 below ~900px of content width and
to 1×3 below ~620px, measured with `onLayout` on the row — not
`useContentWidth()`. The checklist band becomes a stack at the same first
threshold. At 1440 and 1200 the composition is the same, shorter; it must never
be vertically centred with `justifyContent: 'center'`, or a narrow window
pushes the skip link off-screen while leaving air above the heading.

## The checklist's missing title — no longer a defect

Shipping it titleless was correct and it stops being a gap once it is a band: a
full-width row of three labelled, ticked steps under the entry cards reads as a
progress strip, not as an untitled card. **Do not add a title key for it.**

## Is "Bring your history" the right primary — yes, and now it is actually primary

Kept, as a decision rather than an inheritance:

- It is the **only one of the four that is easier here than on the phone.** The
  export is on this machine; the camera and the microphone are not. A desktop
  first-run screen should lead with the thing desktop is best at, which is also
  the argument for the desktop app existing.
- It is the only action that turns all nine cards real in one step.
- The phone leads with Scan for the mirror-image reason. The two platforms
  disagree **on purpose**, and `app/get-started.tsx` stays untouched.

The real defect the report exposes is that a filled tile in a 2×2 does not read
as primary at all. Full width above a row of three fixes the hierarchy and the
vertical budget with one change.

**The mitigation is structural, not copy:** a user with no export to hand must
never hit a dead end, so the other three sit immediately below the primary in
the same view. At 1440×855 all four cards and the skip link must be above the
fold — see criterion 26.

## Acceptance criteria

24. At 1920×855 the first-run screen has no visible rail, no third column, and
    no region taller than ~120px that contains nothing.
25. The primary card spans the full content width; the other three sit in one
    row beneath it.
26. At 1440×855 and at 1200×800, all four entry cards, the checklist band and
    "I'll do this later" are reachable without scrolling.
27. Narrow the window from 1200 to 1000. The row of three reflows (2+1, then
    stacked) without any card being clipped, and the skip link stays on screen.
28. Nothing anywhere on the screen shows a currency amount.
29. Complete step 1. The band's tick updates in place and the layout does not
    reflow around it.

## The two smaller items

**Account name truncating to "Investm…"** — a real defect, not this screen's.
Cause: `AccountSwitcher`'s `triggerCompact` sets `maxWidth: 110`, and
`WebTopBar` passes `compact` even though its bar carries a `flex: 1` spacer and
has room to spare at every desktop width. The cap exists for phone headers where
space is genuinely scarce. Worth its own small fix — either stop passing
`compact` from `WebTopBar` or let the caller raise the cap; either way it is a
`WebTopBar`/`AccountSwitcher` change with no bearing on first-run, and it should
be checked at 1024 as well as 1920 before the cap is simply removed.

**No new i18n key is requested by anything in this addendum.**

---

# Addendum 2 — the checklist band's internal composition (2026-09-06)

Measured: 1640px content width, three 539px cells, ~130px of visible content
each, chevron pinned ~390px from its label, "0 of 3" alone in the top-left.

The diagnosis in one line: **one void at a card's trailing edge is invisible;
three voids between an item and its own chevron are the defect.** Everything
below follows from that.

## 1. The chevron — remove it

Two reasons, and the incoming dialog change settles it rather than changing it.

- It is a **list-row idiom**. A chevron pinned right exists because a full-width
  phone row's target is ambiguous and the chevron says "this row goes
  somewhere". In a 539px cell holding 130px of content it clarifies nothing and
  is the sole cause of the 390px traverse.
- **A chevron means "this leaves."** That is what it means everywhere in this
  app. Once a step opens a dialog over the dashboard it becomes a false
  promise — it advertises navigation and delivers a dialog. The design
  language's own desktop rule is that a flow which returns on mobile resolves in
  place here; the chevron *is* the mobile-return affordance.

So the answer to "does it belong" was already no, and the dialog change removes
the last argument for keeping it.

**The affordance becomes the cell.** The whole cell is one `Pressable`:
`cursor: pointer` comes free on web, plus a surface-tint hover state, and it is
a real focusable target with `Enter`/`Space` — the focusable twin of the hover,
which a chevron never was.

**A completed step stays clickable** (re-opening the wallet or budget dialog is
harmless) but reads as settled: filled circle with a check, label at
`textSecondary`. Do not disable it — a dead cell in a row of three is worse than
a redundant one. Removing the chevron also fixes this: a chevron on a finished
step was nonsense.

## 2. The counter — delete it

I ruled earlier that the missing title stops being a defect once this is a band.
That was right about the title and wrong about the counter: a small grey string
alone in the top-left **occupies the title slot**, so the band still reads as an
untitled card. Relocating it only moves the problem.

**Three visible circles are the counter.** "0 of 3" earns its place over a
collapsed list or a long one; over three items on a single row it counts things
the eye has already counted. Deleting it removes the corner-title problem
outright and frees whatever key it was using.

## 3. Equal thirds — equal, but capped, and left-packed

Not thirds. An equal split of 1640px guarantees ~400px of nothing per cell, and
the band sits directly under the row of three entry cards, so a stretched echo
of that rhythm with a fifth of the content reads as the same row, broken.

**Each cell is `flex: 1` with `maxWidth: 420`, the row left-packed with a fixed
gap.** The cap only bites above ~1300px of content width, so:

- 1920 (1640 content): three 420px cells, ~340px trailing at the card's edge —
  one void, at the edge, which is ordinary for a card holding a horizontal list
- 1440 (~1360 content): cells ~430 → fills naturally, cap inactive
- 1200 (~1120 content): cells ~355 → fills, cap inactive

Equal cells keep it tidy and symmetric with the row above; the cap is what stops
them becoming thirds on a wide monitor. 420 is a starting value to be judged by
eye — nothing in this repo renders a component in CI.

**And give each step its second line.** With the chevron gone a cell is a circle
and one short label, which is what makes 420px still feel thin. Each step
already has hint copy written and translated in all nine locales, and my
original spec named two of the three for this exact card:

| Step | Label key | Hint key (verified in all 9 locales) |
|---|---|---|
| Add your first transaction | as shipped | `dashboard.addFirstExpense` |
| Set your wallet balance | `wallet.addBalance` | `wallet.noBalancesHint` |
| Create a budget | `budgets.createBudget` | `budgets.createHint` |

This is what turns three bare labels into a band that is actually informative —
each step now says what it unlocks — and it is why the trailing space shrinks
without inventing anything. The band grows ~110px → ~135px; the vertical budget
had ~90px of slack.

**Zero new i18n keys. One key is freed** (whatever "0 of 3" used).

## Consistency with the rail form

When this same component returns to the 300px rail after first-run, it stacks —
that is its original shape and it is correct there. **No chevron in either
form**, and no counter in either form, or the two variants drift into different
answers to the same question.

## Acceptance criteria

30. No chevron appears anywhere in the band, in either the first-run row form or
    the post-first-run rail form.
31. Hovering anywhere in a step tints the whole cell; tabbing reaches each step
    as one target and `Enter` opens its dialog.
32. No "N of 3" counter appears; progress is legible from the circles alone.
33. At 1920 the three cells are equal and visibly narrower than a third of the
    band, with the leftover space at the band's right edge, not inside the cells.
34. At 1440 and 1200 the cells fill the band with no cap gap and no clipped hint
    text.
35. Each step shows two lines — its label and its hint — in all nine locales,
    with no truncation at 1200.
36. A completed step shows a filled circle and a dimmed label, and is still
    clickable.

---

# Addendum 3 — the rail widgets (2026-09-06)

## 1. Widget problem, not a rail problem

The circularity breaks with one test: **would widening the rail fix this tell?**

| Tell | Fixed by a wider rail? |
|---|---|
| Centred pill titles | No — centred is wrong at 300px and at 600px |
| Centred content in a column | No |
| Horizontal scroller (Family Feed) | No — it would scroll later, not stop |
| Gauge sized for a thumb | No |
| Calendar's tiny days and dots | **No — see below** |

Zero of five. **Do not widen the rail and do not move the widgets into a grid** —
both cost a layout change and deliver nothing.

**I checked the one I expected to be a genuine width case and it is not.**
`CalendarWidget`'s day cell is a **fixed** `width: 28, height: 28` with a fixed
`5×5` dot. Seven columns is 196px inside a rail whose inner width is 260px — the
calendar is not being compressed by the rail, it has **~64px of unused room and
is simply drawn at thumb scale**. That was going to be my counter-example, and
it turned out to be the strongest evidence for the ruling.

**The real diagnosis, in two parts:**

- **The rail has no scan line.** A phone card centres its content because it is
  the full width of the screen and the only thing you see. A rail card is one of
  eight in a column the eye runs *down* — so every card must start its content
  at the same x. Eight centred cards give eight different starting positions.
  That is why they read as transplanted, and it is why the fix is mostly
  alignment rather than size.
- **They are drawn at thumb scale**, which on a screen driven by a precise
  pointer wastes the density the product owner is asking for.

## 2. The ranking, and the three

**Do these three properly:**

1. **Quick actions.** The loudest phone tell on the screen — a full-width orange
   primary button is a FAB's cousin, and icon-above-label is an action sheet.
   It is also **the only one of the eight with zero mobile cost**: it is not a
   widget, it is the rail-only list from this spec's own earlier ruling, so it
   can be rewritten outright with no `desktop?` prop and no shared branch.
   Highest wrongness, lowest price — do it first.
2. **Family Feed.** A horizontal scroller inside a vertical rail is a **second
   scroller**, which the design language forbids outright ("If two scrollbars
   look wrong, there is one scroller too many"). The fourth avatar cut off at
   the edge is the phone-carousel affordance advertising it. This is a rule
   violation, not a taste difference.
3. **Calendar.** Not unfamiliar — **illegible**, which is worse: the information
   is rendered and cannot be read. And per the check above it is the cheapest of
   the three to fix, because the room is already there.

**Then one sweep for the rest** (see §3) — Financial Health, Debts & Loans,
Expense Audit, Net Capital, Gamification. These are *alignment*, not layout.
Net Capital is the one the product owner already read as closest to right, and
its only real tell is the pill; that is the proof the sweep is the right size of
fix for this group.

**Nothing here is merely unfamiliar except Net Capital's body**, which is
already correct and should not be touched.

## 3. Cheapest correct treatment

**The sweep is one extraction, not five bespoke branches.** I checked: the
centred header is **copy-pasted, not shared** — `DebtsCard`'s `cardHeader`,
`NetCapitalWidget`'s `headerRow` and `FatFinderCard`'s `headerRow` are three
independent copies of the same `justifyContent: 'center'` + `alignSelf: 'center'`
shape, several of them beside an identical absolutely-positioned `chevronHint`.

So: extract one shared `WidgetHeader` (title, optional leading icon, optional
trailing chevron) taking `desktop?: boolean`. Its default branch renders
byte-identical to today's copy; its desktop branch is left-aligned and drops the
pill. Then each widget swaps its hand-rolled header for it. **One new component
plus N one-line swaps**, instead of N bespoke desktop layouts — and it retires a
triplication that would otherwise drift.

| Widget | Treatment | Cost |
|---|---|---|
| **Quick actions** | Four equal, left-aligned rows with small leading icons. No full-width fill, no icon-above-label; weight the primary with an accent icon, not an orange block | Rewrite in place, **no `desktop?` prop, no mobile surface** |
| **Family Feed** | Drop the horizontal strip on desktop: three stacked rows, avatar left, name and amount beside it. Same data, same three items, no second scroller | `desktop?` prop |
| **Calendar** | Scale up into the room it already has: day cell 28→**36**, dot 5→**7**, `dayText` `bodySm`→`body`. 7×36 = 252 against 260 of inner width | `desktop?` prop, **three numbers** |
| **Financial Health** | Shrink the gauge, move it beside the score rather than dominating, and **drop the "tap for details" line** — wrong verb for a mouse, and the card is already a `Pressable` with hover and `cursor: pointer`. Dropping is also how it stays key-neutral | `desktop?` prop + `WidgetHeader` |
| **Debts & Loans** | `WidgetHeader`; the two icon-above-number columns become two left-aligned label/value rows | `WidgetHeader` + small |
| **Expense Audit** | `WidgetHeader`; left-align the empty state | `WidgetHeader` only |
| **Net Capital** | `WidgetHeader` only — the currency list is already left-aligned rows | `WidgetHeader` only |
| **Gamification** | `WidgetHeader`; the full-width button becomes a left-aligned text action | `WidgetHeader` + small |

**Zero new i18n keys** — every change above is alignment, sizing or removal.
`healthScore.tapForDetails` is dropped on desktop rather than reworded, which is
what keeps that true.

**1440 and 1200, where there is one rail:** nothing above is width-conditional.
The rail is 300px at every desktop width, so all eight render identically at
1200, 1440 and 1920 — which is the point of ruling that this was never a width
problem.

## Acceptance criteria

37. Run the eye down the rail: every card's title starts at the same x, and no
    title sits in a centred pill.
38. No horizontal scrollbar or cut-off item appears inside any rail card at any
    desktop width; the page still has exactly one scrollbar.
39. Calendar day numbers are legible at arm's length and the dots are
    distinguishable by colour without leaning in; the grid still fits with no
    clipping at 1200.
40. The rail's action list has no full-width filled button and no
    icon-above-label item.
41. No card says "tap".
42. Open the mobile app on a phone: all eight widgets are pixel-identical to
    before this pass, including the three headers that moved to `WidgetHeader`.

---

# Addendum 4 — the top bar's right-hand cluster (2026-09-06)

*(Addendum 3, on the rail widgets, was answered against a misread brief. It
stands as a record but was not asked for; nothing in it is scheduled.)*

## 1. What the cluster is

It is not a toolbar. It is **four different kinds of thing wearing one costume**:

| Control | What it actually is |
|---|---|
| Account | **Scope.** It changes every number on the screen — the workspace switcher |
| Currency | **A display preference.** Changes presentation, not scope |
| Alerts | **An inbox**, with a count |
| Settings | **Navigation** to a screen |

Giving a scope selector, a preference, an inbox and a nav link the same 34px
translucent pill is the defect. **Ruling: three tiers, not four equals.**

- **Account is the one prominent element** — labelled, widest, visibly a
  different weight from the two icon buttons. It is the only control here whose
  value the user needs to *read* rather than recognise.
- **Alerts and Settings stay icon-only pills** — a bell and a gear are
  universally legible and their labels would be noise. They are correct as they
  are; they are only wrong *relative* to the account control, which is the thing
  that changes.
- **A thin vertical divider between the account control and the two icons**
  makes the tiering legible with no new chrome and no new key.

Settings does **not** fold into the account menu — folding a navigation target
into a scope selector is a category error, and it is the one control a user
looks for by position.

## 2. The account menu — a 340px panel anchored right

**The full-width band has a one-line cause.** `styles.dropdown` sets
`marginHorizontal: theme.spacing[5]` and **no width and no `maxWidth`**, inside
an overlay with `justifyContent: 'flex-start'` — so the panel stretches to the
viewport minus 40px. At 1920 that is an 1880px panel. It was never sized; it was
only inset.

Desktop branch, three style values:

- `dropdown`: `width: 340`, replacing the horizontal margins
- `overlay`: add `alignItems: 'flex-end'` and `paddingRight` equal to
  `WebTopBar`'s own `paddingHorizontal` (20), so the panel's right edge lines up
  with the trigger that opened it
- `overlay.paddingTop`: use `TOP_BAR_HEIGHT + 4`, not the current magic `60` —
  the constant already exists in `webLayout.constants.ts`

No measurement and no positioning math: the bar's padding is a known constant.
The existing `maxHeight: '82%'` already handles seven accounts (≈700px at 855),
so the list needs nothing.

**One real bug to fix in the same branch: the scrim is a `Pressable`.** Both
this menu and `CurrencyPill`'s use `<Pressable style={styles.overlay}>`, and a
`Pressable` always emits a `tabIndex`, which makes the invisible scrim the focus
trap's **first** target — the design language names this exactly, and
`ExpenseDialog` already solves it. On desktop the scrim must be a raw `<div>`.

## 3. Currency — remove it from the bar

**Ruling: drop the standalone `CurrencyPill` from `WebTopBar`, and let the
account trigger carry the currency as a suffix instead.**

- It is **already inside the account menu** — deliberately, per that component's
  own comment that the menu always opens "so the currency control is
  reachable". Two controls for one preference, side by side, one of them
  unlabelled, is the redundancy the design language tells us to resolve by
  choosing a leader.
- A display preference does not belong in a navigation bar. Its home is
  Settings → Profile; its shortcut is the account menu. Two clicks is right for
  a preference.
- Nothing becomes unreachable, and the unlabelled `zł ⌄` — which reads as
  decoration precisely because it has no label — stops existing.

**What replaces the indicator:** `WebTopBar` currently passes
`showCurrency={false}`. Stop passing it, and the trigger reads `Family · zł ⌄`
— one control that states both the scope and the currency those numbers are
in, which is what the combined pill was built for. The split into two pills was
a *mobile tab-header* decision, made where width is scarce; on a desktop bar
with a `flex: 1` spacer it buys nothing.

**This makes the earlier truncation fix load-bearing rather than cosmetic.**
`AccountSwitcher`'s `triggerCompact` caps at `maxWidth: 110`, which already
clips "Investment"; adding a currency suffix guarantees it. `WebTopBar` must
stop passing `compact`.

## 4. The alert badge

Two things, both grounded: the badge is a **hardcoded `#E53935`**, which
violates the rule that every colour comes from `useTheme()` — `danger` exists.
And `danger` is deliberately **not** accent-derived while the bar's ground **is**,
so on a red-family accent it is red on red. The accent-independent fix is a
**2px border in `theme.colors.primary`** — the bar's own colour, so the ring
reads as a gap and separates the badge from the ground whatever the accent is.
Label colour becomes `onSemantic`, not a literal `#FFFFFF`.

## 5. Cost, cheapest first

| Change | Where | Mobile risk |
|---|---|---|
| Remove `CurrencyPill`; stop passing `compact` and `showCurrency={false}`; add the divider; re-tier the two icons | `WebTopBar` | **None — web-only file** |
| Badge → `danger` + `onSemantic` + primary ring | `WebTopBar` | **None** |
| Menu panel width, right-anchor, `TOP_BAR_HEIGHT` | `AccountSwitcher` | `desktop?` prop, **three style values**, byte-identical default |
| Scrim `Pressable` → `<div>` | `AccountSwitcher` | Same `desktop?` branch |

Everything above the line is free. `CurrencyPill` itself needs **no change at
all** — it simply stops being rendered on desktop.

**1440 and 1200:** nothing here is width-conditional. The bar has a `flex: 1`
spacer at every desktop width and a 340px panel fits with room to spare at
1200, so all four widths render identically.

**Zero new i18n keys** — one control is removed, one already-translated suffix
is re-enabled, and the rest is colour, size and anchoring.

## Acceptance criteria

43. The account control is visibly wider and heavier than the bell and gear, and
    a divider separates them.
44. The account control reads `<name> · <currency symbol>` with the full account
    name — open an account named "Investment" and confirm no ellipsis.
45. Open the account menu at 1920: the panel is ~340px wide and its right edge
    aligns with the control that opened it. Repeat at 1440 and 1200.
46. With the menu open, press `Tab` once — focus lands on a real control inside
    the panel, never on the scrim. `Esc` closes it.
47. There is no separate currency pill in the bar; the display currency is still
    changeable from inside the account menu.
48. With unread alerts, cycle all 13 accents in both themes: the badge is
    distinguishable from the bar's ground at every one.
49. Open the app on a phone: the account switcher, its menu and the currency
    pill are pixel-identical to before this pass.

---

# Addendum 5 — where the bell and the gear go (2026-09-06)

Addendum 4 ruled on how these two controls look. This is where they lead.

## 1. Alerts — a panel from the bell

**Ruling: a panel anchored to the bell, 400px, same anchoring mechanics as the
account menu.** I already called this control an inbox, and an inbox opens where
its badge is. The page is not deleted — it is demoted (see below).

**No tabs in the panel.** Stretched half-viewport tabs are the reported defect,
and a tab control inside a 400px panel is that same idiom merely compressed.
More to the point, the two lists do not warrant a switch: invitations are
"usually zero or one" and alerts are a handful. **One list, invitations first,
then unread alerts** — which is deliberately the *same order* the dashboard's
attention panel already uses, so the two surfaces cannot disagree about what is
most urgent.

**What it hosts, all existing:** `renderAlertBody` + `TYPE_ICON` from
`src/features/alerts/alertPresentation.ts` and `InvitationCard` — both already
rendered by the attention panel, so this hosts pieces rather than extracting
any. Accept/Decline stay inline; that is what `InvitationCard` already exposes,
and it is the reason a panel is *better* than the page here — the action
resolves without leaving the screen the user was on.

**Chrome, zero new keys:** `alerts.markAllRead` in the header when
`unreadCount > 0`; `alerts.empty` / `alerts.invitationsEmpty` for the empty
state; a footer row using **`dashboard.seeAll`** → `/alerts`. All four verified
present in all nine locales.

**Scrolling.** `maxHeight` with the list scrolling inside, exactly as the
account menu's `maxHeight: '82%'` + `FlatList` already does. A modal panel is
not the page, so this is not the second-scroller rule; the precedent is already
accepted one control to the left.

**Why 400 and not the account menu's 340.** That menu lists labels; this one
lists a title, a wrapped body line and a date. Two adjacent panels of different
widths is fine for the same reason the language doc already tolerates the income
dialog being thinner than the expense one — it reflects a real content
asymmetry, not sloppiness.

**A defect the panel exposes, worth fixing in the same pass:** `WebTopBar` reads
only `useAlertStore(s => s.unreadCount)`, while `useHomeScreenData` sums
`unreadCount + invitations.length`. So on web a pending invitation lights no
badge at all — and once the panel *leads* with invitations, that becomes a
person waiting behind an unlit bell. One line in `WebTopBar`, web-only.

**`/alerts` becomes the archive**, reached from "See all": read history,
dismissed items, the full invitation list. Its phone-shaped layout is then a
rarely-visited page rather than the destination the app's own badge points at,
which is why it drops down the queue rather than being fixed here.

## 2. Settings — the page is right, the layout is wrong, and the fix is not now

**A full page is correct.** A panel is the wrong answer: 20 rows in a panel is a
menu that dead-ends into 20 full pages, which is worse than the list it
replaced.

**The correct desktop layout is two-pane** — categories on the left, the
selected screen's content on the right. That is the canonical desktop settings
idiom and it fixes the hub *and* every sub-screen at once, including the
appearance screen's half-viewport language buttons, because a sub-screen
rendered into a ~900px right-hand pane can no longer stretch to the viewport.

**It should not be started now.** Every one of ~20 sub-screens lives under
`app/`, and `src/` cannot import from `app/` — so a right-hand pane requires
moving all of them to `src/` first, which is the `ExpenseDetailsCard` move
performed twenty times. That is the real cost, and it is a multi-week piece
that also removes twenty phantom expo-router routes as a side effect. Record
the shape so it is not re-litigated; schedule it separately.

**Do not do the cheap interim either.** Grouping the hub's 20 rows into a
multi-column card grid is one file's work, but every card still leads to a
phone-shaped sub-screen — it polishes the front door of a phone-shaped house,
and it would have to be undone when the two-pane layout lands.

## 3. Ranking — alerts now, settings not now

Not a close call, and not merely about frequency:

- **The bell is a promise the app makes.** The badge summons the user; the
  quality of what it opens is therefore the app's own claim, not the user's
  choice to go looking.
- **Alerts is nearly built.** The extraction to `src/` was done early in this
  work precisely so a panel could host these pieces, and the attention panel
  proves they render. There is no page-layout work in it at all.
- **The asymmetry is in the cheap versions.** The cheap version of alerts is
  ~90% of the correct answer; the cheap version of settings is close to
  worthless. That, more than priority, is why one ships and one waits.

## Cost

| Change | Where | Mobile risk |
|---|---|---|
| Bell opens a panel; badge sums invitations | `WebTopBar` + a new desktop-only `AlertsPanel` | **None** — web-only file plus a new desktop-only component |
| Panel hosts `renderAlertBody` / `TYPE_ICON` / `InvitationCard` | already in `src/` | **None** — no extraction, no `desktop?` prop |
| `/alerts` page layout | — | **Deferred** |
| Settings two-pane | ~20 moves out of `app/` | **Deferred, scheduled separately** |

**1440 and 1200:** a 400px right-anchored panel fits at every desktop width;
nothing here is width-conditional. **Zero new i18n keys.**

## Acceptance criteria

50. Click the bell at 1920: a ~400px panel opens right-aligned under it. The
    page behind does not navigate. Repeat at 1440 and 1200.
51. The panel shows one list with no tab control, invitations above alerts.
52. Accept an invitation from the panel: the row disappears, the account list
    updates, and the page still has not navigated.
53. Dismiss an alert from the panel: it disappears and stays gone after reload.
54. With only a pending invitation and no unread alerts, the bell shows a badge.
55. With nothing pending, the panel opens and shows an empty state — not a blank
    box.
56. "See all" opens `/alerts`; `Esc` and an outside click both close the panel,
    and `Tab` from the open panel never lands on the scrim.
57. Open the app on a phone: the alerts screen and the bell are pixel-identical
    to before this pass.
