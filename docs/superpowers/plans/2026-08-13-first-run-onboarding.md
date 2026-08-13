# First-Run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one screen between registration and the empty dashboard whose only job is to get the user to their first transaction.

**Architecture:** A pure predicate decides whether to show it; a hook in `RootNavigator` acts on that predicate at the moment the existing cold-start gate opens; the screen itself routes every option to a transaction-entry screen that already exists. No server state, no schema, no new way to enter a transaction.

**Tech Stack:** Expo Router, React Native, Zustand, MMKV, SQLite via raw `executeSql`, i18next (9 locales).

**Spec:** `docs/superpowers/specs/2026-08-13-first-run-onboarding-design.md`

## Global Constraints

- **The goal is the first transaction.** Not a feature tour, not preference setup. Measured by the activation metric the investor-metrics endpoint already counts.
- **No new transaction-entry logic.** Every option routes to a screen that already exists. If an entry screen needs to know it was reached from onboarding, the design is wrong.
- **No server change**: no schema, no migration, no endpoint, no push, no cron.
- **The "has no transactions" check reads SQLite directly, never the in-memory stores.** The stores fill *after* the cold-start gate opens, so reading them shows onboarding to an established user during the pre-hydration window. `useHydrationStore.isHydrating` does not fix this: it is `false` both before hydration starts and after it ends.
- **Navigation must be gated by the existing `useColdStartGate`.** Navigating while `RootNavigator` still returns `null` wedges expo-router on a black screen; both existing deep-link paths are gated for this reason.
- **Google sign-in's exposure to pricing must not change.** It routes straight to `/(tabs)` today and never sees `/welcome`; this feature must not start showing it to them as a side effect.
- **9 locales**, always all of them: `en, de, es, fr, pl, ru, ua, be, nl`. Real translations, Polish especially — it is the primary market.

---

### Task 1: The predicate and the seen-flag

**Files:**
- Create: `apps/mobile/src/features/onboarding/shouldShowFirstRun.ts`
- Create: `apps/mobile/src/features/onboarding/__tests__/shouldShowFirstRun.test.ts`
- Create: `apps/mobile/src/stores/firstRunStore.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface FirstRunInputs { gateOpen: boolean; seen: boolean; hasTransactions: boolean; canEdit: boolean }`
  - `function shouldShowFirstRun(inputs: FirstRunInputs): boolean`
  - `useFirstRunStore` — Zustand store with `{ seen: boolean; markSeen: () => void }`
  - `function resolveSeen(read: (key: string) => string | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/onboarding/__tests__/shouldShowFirstRun.test.ts`:

```ts
import { shouldShowFirstRun } from '../shouldShowFirstRun';

const ready = { gateOpen: true, seen: false, hasTransactions: false, canEdit: true };

describe('shouldShowFirstRun', () => {
  it('shows the screen to a brand-new, editable, empty account once the gate is open', () => {
    expect(shouldShowFirstRun(ready)).toBe(true);
  });

  it('waits while the cold-start gate is still closed', () => {
    // Navigating before RootNavigator has mounted its Stack wedges expo-router
    // on a black screen — the same trap both deep-link paths are gated against.
    expect(shouldShowFirstRun({ ...ready, gateOpen: false })).toBe(false);
  });

  it('never shows twice', () => {
    expect(shouldShowFirstRun({ ...ready, seen: true })).toBe(false);
  });

  it('does not show to an account that already has transactions', () => {
    // Reinstall, second device, or an existing user on the release that adds
    // this: they are already activated and must not be sent to onboarding.
    expect(shouldShowFirstRun({ ...ready, hasTransactions: true })).toBe(false);
  });

  it('does not show to a viewer, who cannot create a transaction at all', () => {
    expect(shouldShowFirstRun({ ...ready, canEdit: false })).toBe(false);
  });

  it('requires every condition — no single one is sufficient', () => {
    expect(shouldShowFirstRun({ gateOpen: true, seen: true, hasTransactions: true, canEdit: false })).toBe(false);
    expect(shouldShowFirstRun({ gateOpen: false, seen: false, hasTransactions: false, canEdit: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/mobile && npx jest src/features/onboarding/`
Expected: FAIL — `Cannot find module '../shouldShowFirstRun'`.

- [ ] **Step 3: Write the predicate**

Create `apps/mobile/src/features/onboarding/shouldShowFirstRun.ts`:

```ts
export interface FirstRunInputs {
  /** The shared "app is fully ready" gate — see useColdStartGate. */
  gateOpen: boolean;
  /** Device-local: has this install already shown the screen? */
  seen: boolean;
  /** Authoritative count from SQLite, NOT the in-memory stores. */
  hasTransactions: boolean;
  /** A viewer cannot create a transaction, so has nothing to be onboarded to. */
  canEdit: boolean;
}

/**
 * Whether to send the user to the first-run screen.
 *
 * Pure so the decision can be tested without a navigator, mirroring
 * `computeColdStartGate`, which this deliberately composes with rather than
 * re-deriving.
 */
export function shouldShowFirstRun({
  gateOpen,
  seen,
  hasTransactions,
  canEdit,
}: FirstRunInputs): boolean {
  return gateOpen && !seen && !hasTransactions && canEdit;
}
```

- [ ] **Step 4: Write the flag store**

Create `apps/mobile/src/stores/firstRunStore.ts`, following `locationSettingsStore`'s single-key MMKV shape and `quickActionStore`'s pure-resolver-for-testability shape:

```ts
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'first-run' });
const KEY = 'seen';

/** Pure so the default can be tested without mocking MMKV. */
export function resolveSeen(read: (key: string) => string | undefined): boolean {
  return read(KEY) === 'true';
}

interface FirstRunState {
  seen: boolean;
  markSeen: () => void;
}

export const useFirstRunStore = create<FirstRunState>((set) => ({
  seen: resolveSeen((k) => mmkv.getString(k)),
  markSeen: () => {
    mmkv.set(KEY, 'true');
    set({ seen: true });
  },
}));
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx jest src/features/onboarding/ && npx tsc --noEmit`
Expected: PASS, 6 tests; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/onboarding apps/mobile/src/stores/firstRunStore.ts
git commit -m "feat(onboarding): first-run predicate and seen flag"
```

---

### Task 2: The authoritative transaction count

**Files:**
- Modify: `apps/mobile/src/db/expenseRepository.ts` (append one function)

**Interfaces:**
- Consumes: `executeSql` from `@/db/client`.
- Produces: `countTransactions(accountId: string): Promise<number>`

- [ ] **Step 1: Add the query**

Append to `apps/mobile/src/db/expenseRepository.ts`:

```ts
/**
 * Number of transactions this account holds locally, expenses and incomes both.
 *
 * Exists for the first-run check, which must NOT read the in-memory stores:
 * they fill from SQLite after the cold-start gate opens, so an established user
 * looks empty for a moment on every cold start — long enough to be sent to
 * onboarding on top of their own data. Reading the table is race-free by
 * construction.
 *
 * Mirrors loadAllExpenses' filters so a planned expense (which never counts as
 * spending anywhere else either) does not make an empty account look used.
 */
export async function countTransactions(accountId: string): Promise<number> {
  const rows = await executeSql<{ n: number }>(
    `SELECT
       (SELECT COUNT(*) FROM expenses
         WHERE account_id = ? AND is_deleted = 0
           AND (is_planned IS NULL OR is_planned = 0))
     + (SELECT COUNT(*) FROM incomes
         WHERE account_id = ? AND is_deleted = 0) AS n`,
    [accountId, accountId],
  );
  return Number(rows[0]?.n ?? 0);
}
```

- [ ] **Step 2: Verify it compiles and the web stub tolerates it**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

Note: `db/client.web.ts`'s `executeSql` returns `[]`, so this yields `0` on web — meaning web would show onboarding. That is correct for web's actual behaviour (it has no local data at all) and matches how every other SQLite-backed feature degrades there.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/db/expenseRepository.ts
git commit -m "feat(onboarding): authoritative local transaction count"
```

---

### Task 3: The hook, wired into RootNavigator

**Files:**
- Create: `apps/mobile/src/hooks/useFirstRunOnboarding.ts`
- Modify: `apps/mobile/app/_layout.tsx:45-51` (compose the hook beside the existing ones)

**Interfaces:**
- Consumes: `shouldShowFirstRun` (Task 1), `useFirstRunStore` (Task 1), `countTransactions` (Task 2), `useColdStartGate`'s boolean, `useAccountStore`.
- Produces: `useFirstRunOnboarding(gateOpen: boolean): void`

- [ ] **Step 1: Write the hook**

Create `apps/mobile/src/hooks/useFirstRunOnboarding.ts`:

```ts
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAccountStore } from '@/stores/accountStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { countTransactions } from '@/db/expenseRepository';
import { shouldShowFirstRun } from '@/features/onboarding/shouldShowFirstRun';

/**
 * Sends a brand-new user to the first-run screen once, at the moment the app is
 * fully ready.
 *
 * Lives here rather than on the email-verification screen because Google
 * sign-in routes straight to the tabs and never passes through verification —
 * hanging the trigger off that screen would silently exclude every Google
 * sign-up. This is the point where all sign-in paths converge.
 *
 * One of the cross-cutting hooks composed by RootNavigator (ABA-354): a new
 * concern of this kind gets its own hook here, never another inline useEffect.
 */
export function useFirstRunOnboarding(gateOpen: boolean): void {
  const seen = useFirstRunStore((s) => s.seen);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  // Fires at most once per mount even if the effect re-runs.
  const navigated = useRef(false);

  useEffect(() => {
    if (navigated.current) return;
    if (!gateOpen || seen || !canEdit || !currentAccountId) return;

    let cancelled = false;
    void (async () => {
      // SQLite, not the stores — see countTransactions' comment.
      const count = await countTransactions(currentAccountId).catch(() => 1);
      if (cancelled || navigated.current) return;
      if (!shouldShowFirstRun({ gateOpen, seen, hasTransactions: count > 0, canEdit })) return;
      navigated.current = true;
      router.replace('/get-started');
    })();

    return () => {
      cancelled = true;
    };
  }, [gateOpen, seen, canEdit, currentAccountId]);
}
```

Note the `.catch(() => 1)`: if the count query fails, assume the account HAS transactions. Failing closed shows nothing; failing open would route an established user into onboarding on a transient database error.

- [ ] **Step 2: Compose it in RootNavigator**

In `apps/mobile/app/_layout.tsx`, add the import beside the other hook imports and the call immediately after `useTripInviteDeepLink`:

```ts
import { useFirstRunOnboarding } from '@/hooks/useFirstRunOnboarding';
```

```ts
  useFirstRunOnboarding(coldStartGateReady);
```

It takes the same `coldStartGateReady` boolean the two deep-link hooks take — do not re-derive the gate expression.

- [ ] **Step 3: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/features/onboarding/`
Expected: clean; tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/useFirstRunOnboarding.ts apps/mobile/app/_layout.tsx
git commit -m "feat(onboarding): trigger the first-run screen where all sign-in paths converge"
```

---

### Task 4: The screen

**Files:**
- Create: `apps/mobile/app/get-started.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register the route beside `welcome`)
- Modify: all 9 files in `apps/mobile/src/i18n/locales/`

**Interfaces:**
- Consumes: `useFirstRunStore.markSeen` (Task 1).
- Produces: the route `/get-started`, accepting an optional `next` param (`'welcome'`).

- [ ] **Step 1: Build the screen**

Create `apps/mobile/app/get-started.tsx`. It renders a heading, one primary card, three secondary rows and a text link, following the visual conventions of `app/welcome.tsx` (same screen slot) rather than inventing new ones.

Behaviour:

```tsx
const { next } = useLocalSearchParams<{ next?: string }>();
const markSeen = useFirstRunStore((s) => s.markSeen);

// Where the user goes when onboarding is done — after an action or a skip.
// `next=welcome` is passed only by the email-verification path, which is the
// one that used to land on the pricing screen. Google sign-in passes nothing
// and therefore keeps going straight to the tabs, exactly as it does today:
// this feature must not start showing pricing to an audience that never saw it.
const finish = () => {
  markSeen();
  router.replace(next === 'welcome' ? '/welcome' : '/(tabs)');
};
```

The four options `push` (not `replace`) their targets, so finishing one returns here:

| Slot | Label key | Target |
|---|---|---|
| primary card | `onboarding.scanReceipt` | `/expense/receipt` |
| row | `onboarding.useVoice` | `/expense/voice` |
| row | `onboarding.typeManually` | `/expense/new` |
| row | `onboarding.bringHistory` | `/settings/import` |
| text link | `onboarding.later` | calls `finish()` |

Each option calls `markSeen()` before pushing, so an abandoned run is not repeated.

- [ ] **Step 2: Advance when a transaction appears**

In the same screen, watch the store counts and finish when the account stops being empty:

```tsx
const expenseCount = useExpenseStore((s) => s.expenses.length);
const incomeCount = useIncomeStore((s) => s.incomes.length);
const startedEmpty = useRef(expenseCount + incomeCount === 0);

useEffect(() => {
  if (startedEmpty.current && expenseCount + incomeCount > 0) finish();
}, [expenseCount, incomeCount]);
```

Reading the stores is correct *here* — unlike in the trigger — because by this point the user is looking at the screen, hydration has long since run, and what we need is a change over time rather than an absolute truth at cold start.

- [ ] **Step 3: Register the route**

In `apps/mobile/app/_layout.tsx`, beside the existing `welcome` registration (~line 277), add:

```tsx
        <Stack.Screen
          name="get-started"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
```

`headerShown: false` because the screen carries its own heading, and `gestureEnabled: false` so it cannot be swiped away into an undefined state — the same two choices `welcome` makes.

- [ ] **Step 4: Add the i18n keys to all 9 locales**

Under a new `onboarding` object: `heading` ("Where would you like to start?"), `subheading` ("Add one thing and the app starts working for you."), `scanReceipt`, `scanReceiptHint` ("Line items and categories, read for you"), `useVoice`, `typeManually`, `bringHistory`, `bringHistoryHint` ("From your bank or another budgeting app"), `later`. Real translations in all nine, not English placeholders.

- [ ] **Step 5: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/features/ src/stores/`
Expected: clean; existing suites still green.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/get-started.tsx apps/mobile/app/_layout.tsx apps/mobile/src/i18n/locales
git commit -m "feat(onboarding): the first-run choice screen"
```

---

### Task 5: Put the action before the pricing screen

**Files:**
- Modify: `apps/mobile/app/(auth)/verify-email.tsx:49`

**Interfaces:**
- Consumes: the `/get-started` route and its `next` param (Task 4).

- [ ] **Step 1: Reroute the email path**

`verify-email.tsx:49` currently reads `router.replace('/welcome')` — sending a newly verified user straight to a price list before they have seen a single one of their own numbers. Change it to:

```ts
      router.replace('/get-started?next=welcome');
```

The pricing screen is not removed and its own logic is untouched; it moves one screen later, and `next=welcome` is what carries it there.

- [ ] **Step 2: Confirm Google's path is unchanged**

Read `apps/mobile/app/(auth)/login.tsx` and confirm the Google branch still routes to `/(tabs)` with no `next` param anywhere. A Google sign-up must reach `/get-started` only via the hook, and must finish to `/(tabs)` — never to `/welcome`, which it does not see today.

Report what you found. If the Google branch turns out to route somewhere else, stop and say so rather than adjusting it.

- [ ] **Step 3: Verify**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(auth)/verify-email.tsx"
git commit -m "feat(onboarding): show the first action before the pricing screen"
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `user_docs/<lang>/` — the getting-started section, all 9 languages
- Run: `npm run generate:help`

- [ ] **Step 1: Document in CLAUDE.md**

A bullet covering: the trigger's placement and why it is not on the verification screen; the four conditions; that the count comes from SQLite and why `useHydrationStore` cannot substitute; the `next=welcome` param and why Google's pricing exposure is deliberately unchanged; that `app/welcome.tsx` is a pricing screen despite its name.

- [ ] **Step 2: Update the user docs**

Describe the first-run screen in the getting-started section for all 9 languages, then run `npm run generate:help` from the project root. Never hand-edit `apps/mobile/src/help/content.ts`.

- [ ] **Step 3: Full check**

Run: `npm run typecheck && npm run test`
Expected: PASS. Note `npm run lint` fails on a pre-existing, unrelated issue in `apps/admin/src/app/users/page.tsx` — ignore it.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git commit -m "docs: first-run onboarding"
```

The controller creates the `ABA-{N}` issue — not the task implementer.

---

## Self-Review

**Spec coverage.** Trigger placement and the cold-start gate → Task 3. The four conditions → Task 1 (predicate) and Task 3 (wiring). SQLite-not-stores → Task 2, with the reason carried into the code comment. The screen, its options and the migration entry point → Task 4. Once-only flag → Task 1, marked in Task 4. Action-before-pricing → Task 5. Google's unchanged pricing exposure → Task 4's `next` param and Task 5 Step 2. Viewer exclusion → Task 1. Non-goals (no schema, no endpoint, no push, no entry-screen changes) appear as Global Constraints and are implemented nowhere.

**Known softness.** Task 4 describes the screen's layout rather than giving its JSX, because it must match `welcome.tsx`'s visual conventions, which are better copied at the keyboard than transcribed here; its *behaviour* — the `finish()` routing, the `next` param, the store-count advance — is given as literal code, since that is where the decisions live. Task 6's copy is described rather than written for the same reason it always is: nine languages of prose do not belong in a plan.

**Type consistency.** `FirstRunInputs`'s four fields are named identically in Task 1's predicate, its tests, and Task 3's call site. `countTransactions(accountId: string): Promise<number>` is defined in Task 2 and called with that exact signature in Task 3. `markSeen` is defined in Task 1 and called in Task 4. The route name `get-started` matches between Task 3's `router.replace`, Task 4's `Stack.Screen name`, and Task 5's `router.replace`.
