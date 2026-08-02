# Financial Month Anchor — Design (v1)

Let an account declare that its month starts on some day other than the 1st, and make every
user-facing "this month" number honour it. Motivated by the common case where salary lands on
the 10th and the user budgets from that date, not from the calendar boundary.

## The problem in one line

`BudgetPeriod` already has a `custom` value, but it means a **fixed, one-off window**
(`computeBudgetPeriod` returns `[startDate, endDate]` unchanged, budget history returns `[]` for
it, and the mobile create screen deliberately filters it out —
`BUDGET_PERIODS.filter(p => p.value !== 'custom')` in `app/budget/new.tsx:289`). What users
actually need is a **recurring month with a shifted anchor**: 10 Aug – 9 Sep, then 10 Sep – 9 Oct.
That is a third thing, and it does not exist today.

## Locked decisions (from brainstorming)

1. **Scope is app-wide, not budgets-only.** The anchor is a "my financial month" concept.
2. **The anchor lives on `Account`,** not `User`. A shared budget must have exactly one period —
   two members with different salary dates would otherwise see different spend for the same
   budget and get contradictory alerts. Personal accounts are unaffected (one member, own anchor).
3. **Anchored month only.** No arbitrary cycle length (every 14/45 days), no semi-monthly. The
   salary case is ~95% of the demand and a single `anchorDay` column expresses it.
4. **Range 1–31 with clamping** to the last day of short months, not the safer 1–28.
5. **`null` means calendar month.** No backfill, no behaviour change for existing accounts.
6. **Phased rollout in three waves**, with server and client sides of any given number always
   migrated in the same wave.

Note discovered during brainstorming: **quarterly budgets do not exist.** `BudgetPeriod` is
`daily | weekly | monthly | yearly | custom`. If quarterly is wanted it is a separate piece of
work, out of scope here.

## Data model

```prisma
// model Account
monthAnchorDay Int? @map("month_anchor_day")   // null = calendar month; 1..31, clamped
```

Migration `add_account_month_anchor` (timestamp assigned by `prisma migrate dev`), nullable, no
backfill. A single scalar on
`Account` mirrors the existing `purchaseApprovalRule` / `tripStatus` precedent — no new table.

Mobile SQLite: `month_anchor_day INTEGER` added to `accounts` via `ALTER TABLE` in
`client.native.ts` (same pattern as `expense_items.canonical_name`), mapped in `accountRepository`.

`Account` in `packages/shared-types` gains `monthAnchorDay?: number | null`.

### Why 1–31 and not 1–28

Salaries land on the 25th, the 30th, and the last working day. Restricting to 1–28 would tell
those users their case is unsupported, which is the exact complaint this feature exists to fix.
Clamping an out-of-range anchor to the last day of the month is what billing systems (Stripe
subscription anchors) already do, so the behaviour is familiar.

The honest cost: with `anchorDay = 31` the period length oscillates between 28 and 31 days, so
month-over-month comparison is slightly less like-for-like. With `anchorDay <= 28` it never
happens. This is a user-visible trade-off the UI should not hide, but it is theirs to make.

## Computation

Two pure functions. Because the API has no build step and **must not import
`@budget/shared-utils` at runtime** (`ERR_UNSUPPORTED_DIR_IMPORT` in prod Node — this broke
production in ABA-252/253 and `deploy.yml` now runs
`scripts/check-no-shared-utils-runtime-import.sh` as a pre-deploy guard), these live in two
places by necessity:

- `packages/shared-utils/src/formatting/financial-month.ts` — for mobile and admin
- `apps/api/src/common/utils/financial-month.ts` — mirror for the API

```ts
financialMonth(now: Date, anchorDay: number | null): { start: Date; end: Date }
shiftFinancialMonth(ref: Date, delta: number, anchorDay: number | null): Date
formatFinancialMonth(start: Date, end: Date, locale: string): string
```

This does **not** add a fourth copy of a period concept — `computeBudgetPeriod` (which already
exists twice, in `apps/api/src/modules/budgets/budget-period.util.ts` and
`packages/shared-utils/src/formatting/index.ts`) stops computing the month itself and delegates
to `financialMonth`. The existing duplication gets thinner, not wider.

### `financialMonth`

Returns the period **containing** `now`. If `now.getDate() >= effectiveAnchor` the period starts
this month, otherwise it started last month. `end` is the next anchor minus 1 ms.

`effectiveAnchor = min(anchorDay, daysInThatMonth)` — so anchor 31 resolves to Feb 28 (29 in a
leap year), Apr 30, and so on.

With `anchorDay === null` it returns exactly today's calendar-month result, byte for byte. This
is the property that makes the migration a no-op for existing accounts, and it is asserted by a
golden test rather than assumed.

### `shiftFinancialMonth`

Needed for budget history and for "previous period" navigation.

It must **not** be implemented as `ref.setMonth(ref.getMonth() - 1)`. That idiom is used today at
`apps/api/src/modules/budgets/budgets.service.ts:260` and carries the classic JS overflow bug:
on 31 March, `setMonth(-1)` yields 3 March (Feb 31 rolls forward), so budget history opened on
the 29th–31st silently shows March twice and never shows February. Anchored periods make the
window where this bites wider, so the fix ships as part of this work — it is code we are
modifying anyway.

Correct approach: build the target from `(year, month + delta, effectiveAnchorForThatMonth)`
explicitly, never by mutating a date in place.

### Labelling

A period of 10 Aug – 9 Sep is labelled by the month it **starts** in ("August"), with the exact
range as a subtitle. This matches how people speak about it ("the August salary"). One helper so
the label cannot drift between screens.

## API

`AccountContextGuard` (`apps/api/src/common/middleware/account-context.middleware.ts`) already
runs on every account-scoped request and performs exactly one `accountMember.findUnique`. It
gains `include: { account: { select: { monthAnchorDay: true } } }` and sets `req.monthAnchorDay`
(added to `AuthenticatedRequest` in `common/types/index.ts`).

One indexed-FK join for one small column is cheaper than making each of ~10 services fetch the
anchor itself, and it means every account-scoped service gets it for free.

Writes go through the existing `PATCH /accounts/:id` (`accounts.controller.ts:51`).
`UpdateAccountDto` gains `monthAnchorDay` with `@IsInt() @Min(1) @Max(31)` and an explicit `null`
to reset. Owner-only, like the other account settings.

### Crons are the exception — do not miss them

`budget-alert.service` runs from a cron with no HTTP request, so `req.monthAnchorDay` does not
exist there. It already loads budgets together with their account, so it reads the anchor from
that row. This is the only place where the source differs, and forgetting it produces the worst
possible failure mode: nightly alerts computed on calendar boundaries while the screen shows
anchored ones, i.e. an alert that disagrees with the number the user is looking at.

## Mobile

Every read goes through one small `useFinancialMonth()` hook over
`accountStore.currentAccount`, rather than ~15 screens each reaching into the store. Keeps the
call sites uniform and makes a later change to where the anchor comes from a one-file edit.

UI lives in `app/account/[id].tsx`, alongside the purchase-approval rule and trip settings: a
row "Financial month starts on", opening a bottom sheet with days 1–31 plus a "Calendar month"
entry that resets to `null`. Owner-only. Roughly 6 i18n keys across all 9 locales.

Two consequences to state plainly in the UI copy:

- **The anchor applies retroactively.** Setting the 10th re-buckets past months too. No data
  migrates — it is purely a lens over the same expenses. This is correct behaviour, but if it is
  not obvious from the UI it reads as "my old numbers got corrupted".
- **It works offline.** Periods are computed locally from the cached account row; no network.

## Rollout waves

Each wave gets its own implementation plan. **The first plan covers wave 1 only** — waves 2 and 3
are scoped here so the foundation is built to carry them, not so they ship together.

**Wave 1 — foundation + budgets.** Migration, `AccountContextGuard`, `UpdateAccountDto`, both
copies of `financial-month` with mirrored tests, `computeBudgetPeriod` delegating to it, the
`setMonth` overflow fix, mobile column + `useFinancialMonth` + `account/[id].tsx` UI + i18n,
`budgetStore.ts`. Delivers the original request end-to-end and is independently shippable.

**Wave 2 — main spending surfaces.** Mobile: `expenseStore.totalThisMonth`, `incomeStore`,
`useSummaryAnalytics`, `useCategoryAnalytics`, `useDailySpending`, `useFilteredTransactions`,
`useDrillDown`, `usePeriodNavigation`, `ExpenseFilterBar`, `NetProfitWidget`, `useCalendarData`,
`widgetData`, `localAnalytics`. API: `analytics.service`, `safe-to-spend.service`,
`user-context-builder.service`. This is the bulk of the work.

**Wave 3 — long tail.** `story.service`, `fat-finder.service`, `insights.service`,
`ai-insights.service`, `reports` + `report-scheduler.service`, mobile `story.tsx`,
`fat-finder.tsx`, `reports.tsx`, `useScenarioProjection`.

### Explicitly out of scope — these stay calendar-based

Monthly AI request quota, Stripe billing cycle, trial reminders, subscription auto-charge cron,
gamification streaks, price-history windows, admin investor metrics, debt reminders, the
recurring-expense cron, `useSubscriptionCalendar`, and `wrapped.service` (year-scoped by
definition). These only share the word "month"; shifting them would corrupt billing.

### The constraint that decides where wave boundaries fall

**A single number must never be half-migrated.** If a mobile hook already reports 10 Aug – 9 Sep
while `analytics.service` still reports 1–31 Aug for the same figure, the user gets two different
answers to one question and concludes the app is lying. Server and client sides of any given
number therefore ship in the same wave — which is why `analytics.service` sits in wave 2 with its
hooks rather than being pulled forward into wave 1.

## Edge cases

| Case | Behaviour |
|---|---|
| `anchorDay = null` | Calendar month, identical to current behaviour |
| `anchorDay = 1` | Calendar month (same result, different code path) |
| `anchorDay = 31`, February | Clamps to 28 (29 in a leap year) |
| `anchorDay` out of range (0, 32, NaN, garbage from an old client) | Treated as `null`, falls back to calendar |
| `now` exactly on the anchor day | Period starts today |
| Shift across a year boundary | Handled by explicit `(year, month + delta)` construction |
| Timezone | All math stays in local time (`new Date(y, m, d)`) as today. Moving to UTC would shift day boundaries and is out of scope |

Out-of-range anchors degrade to calendar rather than throwing: a bad value in one column must
never blank the analytics screen.

## Testing

The defence against the two copies drifting is an **identical case table** in both test suites:

- `null` anchor reproduces the current `computeBudgetPeriod` output exactly (golden test)
- anchor before / after / equal to today's date
- anchor 31 clamping through February, April, and a leap year
- `shiftFinancialMonth` ±1 across a year boundary
- `shiftFinancialMonth` from 31 March — regression test for the overflow bug
- out-of-range anchors fall back to calendar

Existing budget tests must pass **unchanged** with `anchorDay = null`. That is the proof that
nothing broke for current users, and it is a hard gate on wave 1.

## Follow-ups (not in this work)

- Quarterly budget period (does not exist today; unrelated to the anchor)
- Semi-monthly / arbitrary cycle length, if demand appears
- Per-user anchor override on personal screens within a shared account
