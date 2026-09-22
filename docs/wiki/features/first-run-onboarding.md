# First-run onboarding

*Hub: [mobile-app](../mobile-app.md)*

## What this is

A brand-new user is routed once to a get-started screen — scan a receipt, or voice, manual entry or
import — instead of landing on an empty dashboard. On web the same problem is solved as a dashboard
state rather than a screen.

## Entry points

- `apps/mobile/src/features/onboarding/shouldShowFirstRun.ts` — the pure predicate
- `apps/mobile/src/features/onboarding/resolveWebFirstRun.ts` — the three-valued web answer
- `apps/mobile/src/hooks/useFirstRunOnboarding.ts`
- `apps/mobile/app/get-started.tsx`
- `apps/mobile/src/db/expenseRepository.ts` — `countTransactions`

## Key concepts

**A strict AND of four conditions:** the cold-start gate is open, the one-time flag is unseen, the
account has no transactions, and the user can edit. Viewers are excluded because they cannot create
a transaction at all.

**The trigger lives in `RootNavigator`,** deliberately not on the email-verification screen: Google
sign-in routes straight to the tabs and never passes through verification, so hanging it there would
silently exclude every Google sign-up.

**On web it is a dashboard state, not a screen.** One expense populates two cards while five others
keep reporting absence, so a separate screen only defers the problem.

## Invariants

**Count from SQLite, never from the stores.** The stores fill from SQLite only *after* the cold-start
gate opens, so an established user's in-memory list is empty for a moment on every cold start — long
enough to route them into onboarding on top of their own data. `useHydrationStore.isHydrating`
cannot substitute either: it is false both before hydration starts and after it ends, which is
exactly the window this check needs.

**Two guards keep an established user out, and both are load-bearing.** When the count comes back
> 0 the hook calls `markSeen()` itself — the flag is otherwise set only by the get-started screen's
own handlers, which an established user never visits, so before this it stayed false for the entire
installed base forever. And the whole check runs at most once per app session via a ref set when the
query is *issued*, which is what makes the account-switch path structurally unreachable: an account
the user has never opened has no local rows and counts zero.

**A failed count returns without marking seen.** It is not evidence either way, and burning the flag
on one transient SQLite error would cost a genuinely new user the screen forever.

**Web bails outright.** `db/client.web.ts` returns `[]` for every read, so the count is always zero
there and every established web user got the screen. Other SQLite-backed features degrade on web by
showing *less data*; this one degraded by interrupting the user with a screen whose premise is false.

**`resolveWebFirstRun` is three-valued (`wait | show | suppress`), not boolean.** A boolean cannot
express "we have not heard back", which is exactly what an offline first paint is — and would read
it as "brand-new user". The wait is bounded at ~5 s, after which the ordinary dashboard renders,
never the first-run state.

**`lastPullAt` is what makes a failed pull distinguishable from an empty account** at all.

**The destination after onboarding travels out-of-band.** `welcome.tsx` is a pricing screen despite
its name, and only the email-verification redirect routes through it. The flag is set
*synchronously before* navigating, because nothing orders a SQLite promise's continuation against
React committing a route change — a param-based hand-off could only narrow the window in which this
hook's param-less `router.replace` deletes the pricing screen from the registration funnel.

**Do not reintroduce `usePathname()` here.** `RootNavigator` renders 95 `<Stack.Screen>` elements
with freshly allocated inline `options`, and that subscription re-rendered all of it on every
navigation in the app, on the JS thread during transition animations.

**Auto-advance fires on focus, not on the count change.** `finish()` is a global `router.replace`
and the entry screens are pushed on top, so acting immediately replaced the receipt screen underneath
its own open success alert.

## Known gaps

- A restored device marks onboarding seen for a different reason — see
  [restore-credentials](restore-credentials.md).
- The web first-run state and the native screen are two implementations of one idea.

## History

The feature, plus ABA-507 (the web dashboard state, the setup checklist, and the route-to-dialog
table it shares with the dashboard).
