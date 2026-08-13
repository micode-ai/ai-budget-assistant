# First-Run Onboarding — Design (v1)

A newly registered user lands on an empty dashboard and is left to find their
own way into an app with receipt scanning, statement import, three chat bots,
budgets, goals and a shopping list. This adds one screen between registration
and that dashboard whose only job is to get them to their first transaction.

## Why this, and why measured this way

The product already defines activation and already counts it: the investor
metrics (ABA-340) treat a user as activated when they log their first expense or
income within a 3-day window. So this feature has a pre-existing success metric,
and can be judged against a number rather than taste.

Everything below is subordinate to that one goal. A screen that teaches the app's
breadth, collects preferences, or sells a plan is not this feature.

## What the codebase actually does today

Three findings shaped the design, and two of them contradict what a reader would
reasonably assume.

**There is no onboarding.** No file and no i18n key mentions it. Registration
collects name, email, password, a currency chip row and an optional referral
code, then goes to email verification.

**`app/welcome.tsx` is a pricing screen, not a welcome.** It is 332 lines of
plan cards, a trial pitch and a "continue with free" button, and
`verify-email.tsx:49` sends every newly verified user straight to it. So the
first thing a new user sees after registering is a price list — before they have
seen a single one of their own numbers.

**Google sign-in never reaches it.** `login.tsx` routes a successful Google
sign-in directly to `/(tabs)`, so a Google-registered user sees neither the
pricing screen today nor, if the trigger were hung off email verification, this
onboarding tomorrow. That is why the trigger below sits where all sign-in paths
converge rather than on the verification screen.

## Locked decisions (from brainstorming)

1. **The goal is the first transaction**, matching the existing activation
   metric — not a feature tour, not preference setup, not history import for its
   own sake.
2. **One screen with a choice**, not a multi-step wizard and not a coach mark on
   the home screen. Every option routes to a screen that already exists; this
   feature introduces no new way to enter a transaction.
3. **Shown once**, via a device-local flag. No server state, no schema, no cron,
   no push.
4. **Action first, pricing second.** The onboarding screen takes the slot
   `/welcome` occupies today, and `/welcome` follows it. Asking for money before
   a user has seen any of their own data is the most reliable way to lose them,
   and the pricing screen is not removed — only moved one screen later.

### Non-goals

- No schema change, no migration, no endpoint.
- No changes to any transaction-entry screen. If one needs to know it is being
  used during onboarding, the design is wrong.
- No push notification and no reminder cron. A user who skips is not chased.
- The pricing screen's content and its own logic are untouched.

## Trigger

A new `useFirstRunOnboarding` hook in `apps/mobile/src/hooks/`, composed into
`RootNavigator` alongside the seven hooks already there — the pattern ABA-354
established, which explicitly says a new cross-cutting concern gets its own hook
rather than another `useEffect` inline in `_layout.tsx`.

It navigates to `/get-started` when, and only when, all four hold:

- the existing `useColdStartGate()` is open (`!isInitializing && isAuthenticated
  && fontsLoaded`);
- the device-local "seen" flag is unset;
- an authoritative count of the account's transactions is zero;
- the current account role can edit (a viewer cannot create transactions).

**"Authoritative" rules out reading the in-memory stores, and that distinction
is load-bearing.** The expense and income stores fill from SQLite *after* the
gate opens, so a returning user's in-memory list is empty for a moment on every
cold start — long enough to show onboarding on top of their own data.

`useHydrationStore.isHydrating` does not solve this either, and it is worth
saying why, because it looks like it should: the flag starts `false`, flips to
`true` when hydration *begins*, and back to `false` when it ends. So `false`
means "finished" **or** "not started yet", and gating on it would open the door
in exactly the window it is meant to close.

The hook therefore asks SQLite directly for a count. That is race-free by
construction and depends on no ordering at all. The cost is one cheap query, run
only while the seen-flag is unset — that is, at most once per install.

**The gate is not optional.** CLAUDE.md records that navigating while
`RootNavigator` still returns `null` wedges expo-router on a black screen, and
that both existing deep-link paths are gated for exactly this reason. A third
navigation trigger must reuse the same gate rather than approximate it.

Placing the trigger here — rather than on `verify-email.tsx` — is what makes it
reach Google sign-ups, who never pass through verification.

## The screen — `app/get-started.tsx`

Heading: "Where would you like to start?" One obvious action, three
alternatives, and an escape hatch:

| | Option | Routes to |
|---|---|---|
| primary card | Scan a receipt | `expense/receipt.tsx` |
| row | Say it out loud | `expense/voice.tsx` |
| row | Type it in | `expense/new.tsx` |
| row | Bring my history | `settings/import` |
| text link | Later | — |

The primary slot goes to receipt scanning because it is what the app does that
its competitors do not, and because a scanned receipt produces a far richer first
transaction than a typed one — line items, a merchant, and now a category split.
It is not the *only* option because it is the one most likely to be impossible at
that exact moment: it needs a paper receipt in hand.

"Bring my history" is how the competitor-migration import (ABA-401) becomes
reachable by someone who has just installed the app. Today its only entry point
is a card inside Settings → Import transactions, which a new user has no reason
to open — and migrating history is worth most on day one, when the alternative is
an empty app.

## What happens after the action

Each option `push`es its target screen. The entry screens keep their existing
"done" behaviour, which returns to the caller — so the user comes back to
`/get-started`.

`/get-started` watches the combined expense and income count. When it observes
that count go from zero to at least one, it advances to `/welcome`. The "Later"
link advances immediately.

This keeps every piece of onboarding logic inside one screen. The entry screens
are not modified, do not receive a flag, and cannot tell they were reached from
onboarding — which is what makes this feature cheap to build and cheap to delete.

A user who backgrounds the app mid-scan returns to `/get-started`, which is a
reasonable place to be and needs no special handling.

## Showing it once

A device-local MMKV flag, set when the screen is left by any path — completing
an action, tapping Later, or navigating away. The store follows the existing
single-key MMKV pattern (`locationSettingsStore`, `merchantSuggestionStore`), and
the show/hide decision is a pure exported function so it can be unit-tested
without mocking MMKV — the `quickActionStore` precedent.

Device-local rather than server-side is a deliberate trade: a user who reinstalls
or signs in on a second device sees the screen again. That costs one skippable
screen in a rare case and saves a column, a migration, an endpoint and a sync
path. If it ever proves annoying, moving the flag to `User` is a small, separate
change.

## Edge cases

- **Existing users on the next release.** The flag is unset for everyone, so
  every existing user would see the screen once. That is wrong: they are already
  activated. The trigger therefore also requires the account to have **no
  transactions**, which is both the honest condition and self-correcting.
- **A user who already has data but no flag** (reinstall, second device) is
  covered by the same condition — no screen.
- **Offline first run.** Every option routes to a screen that already works
  offline except the import, which needs a file and a network call; it fails
  through its own existing error handling, not new code here.
- **Viewer role.** A viewer cannot create transactions. The screen is skipped for
  them entirely rather than offering four actions that will be refused.

## Testing

- Pure `shouldShowFirstRun({ gateOpen, seen, hasTransactions, canEdit })` with
  unit tests covering each condition — one test per condition proving it alone
  can suppress the screen — mirroring `computeColdStartGate`.
- The count that feeds `hasTransactions` comes from SQLite, not the stores. A
  test cannot easily prove the absence of that race, so the reason is recorded
  in a comment at the call site instead: reading the stores here would show
  onboarding to an established user during the pre-hydration window.
- The flag store's resolve helper, tested against a fake reader as
  `quickActionStore`'s is.
- No component-render tests: this codebase has no React Native testing library,
  and adding one for this screen is out of scope. What is consequently unverified
  by CI — the layout, and the navigation actually firing — is stated here rather
  than papered over.

## Follow-ups

- Measure it. The activation metric already exists in the investor-metrics
  endpoint; comparing activation before and after is the point of the feature and
  should be checked a fortnight after release rather than assumed.
- If activation improves but "Later" dominates, the next iteration is a home
  screen card while the account is still empty — deliberately not built now, per
  the locked decision to show the screen once.
- Whether `/welcome` should show at all for Google sign-ups is a pre-existing
  gap this design surfaces but does not fix: it is a monetisation decision.
