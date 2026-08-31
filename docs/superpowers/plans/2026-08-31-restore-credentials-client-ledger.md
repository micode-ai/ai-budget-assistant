# SDD ledger — plan: docs/superpowers/plans/2026-08-31-restore-credentials-client.md

Spec: docs/superpowers/specs/2026-08-31-restore-credentials-client-design.md (read)
Branch: feature/restore-credentials-client
Base: f7a6baa8

## Setup rulings

Ruling: same as stage 1 — execute on a branch in the main working tree, not a git
worktree, because a fresh worktree has no node_modules (Turborepo hoists to the repo
root) and every task's `npx jest` would fail until a slow install. Additionally here,
the Android build needs `apps/mobile/android` with its Gradle caches in place.
Cost if wrong: weaker isolation; recoverable with a branch reset.

Ruling: commits authorized — the user chose to execute a plan whose every task ends in
`git commit`. No pushes without a separate explicit OK. Cost if wrong: local commits.

## Pre-flight conflict scan

### Cross-task pairs (shared file or interface)

| Pair | Produced → Consumed | Finding |
|---|---|---|
| T1 → T2 | native module name `RestoreCredentialModule` + `createCredential`/`getCredential`/`clearCredential` → `NativeModules.RestoreCredentialModule.<same names>` | agree |
| T2 → T3 | `createRestoreCredential`/`getRestoreCredential` → imported and mocked by the same paths | agree |
| T2 → T6 | `clearRestoreCredential` | agree |
| T3 → T4 | `registerRestoreCredential(userId)`, `restoreCredentialFlag.hasSynced(userId)` | agree, signatures match |
| T3 → T5 | `attemptRestoreSession(): Promise<AuthResponse \| null>` | agree |
| T3 → T6 | `api.deleteRestoreCredentials()` | agree — declared in T3 Step 1's five-method list |
| **T4, T5, T6 → same file** | all three modify `apps/mobile/src/stores/authStore.ts` | **Sequential dispatch is mandatory here.** They touch different methods (`login`/`googleLogin`/verify-email; `initialize`; `logout`), so they should not collide, but each review must confirm the previous task's edits are still present rather than only checking its own. Recorded so the reviewers are told. |
| T1 → T7 | Kotlin compile check | agree, T7 re-runs it |

### Per-task self-consistency

| Task | Finding |
|---|---|
| T1 | Consistent. Minor redundancy: `createCredential` null-checks `currentActivity` and then `createWith` checks it again. Harmless, left as-is rather than churning the plan. |
| T2 | Consistent. `index.web.ts` is explicitly "same contents as index.ios.ts" — duplication is intentional, Metro needs a real file per platform. |
| T3 | Consistent. The `api` mock lists four methods and omits `deleteRestoreCredentials`; correct, those tests never call it. |
| T4 | Consistent. Snippet uses `useAuthStore.getState()` inside a hook that does not currently import the store — the implementer adds the import; not ambiguous. |
| T5 | Consistent. Explicitly preserves the corrupted-stored-user branch and only replaces the no-token one — the file has two `set({ isInitializing: false })` sites and the plan names which. |
| T6 | Consistent. |
| T7 | Consistent. Correctly flags that stage 2 IS user-visible and needs all nine locales, unlike stage 1. |

### Rulings

Ruling: no plan defects found requiring a change before execution. The one deliberate
spec deviation (the `E2eeUnavailableException` check by class simple-name instead of by
import) is already documented in the plan's own self-review section and is the safe
direction — a wrong import fails the build, a wrong name check merely skips a retry.
Cost if wrong: users without a screen lock get no restore credential; visible as an
absence of rows for those users, not as a failure.

## Progress

Task 1: first turn ended without the report contract (agent backgrounded the compile and stopped);
  resumed with an instruction to run it in the foreground. Not a defect in the work, a process miss.
Task 1: implemented DONE by sonnet, commit 67a028a6, `./gradlew :app:compileDebugKotlin` BUILD SUCCESSFUL.
  All 13 androidx imports from the plan were correct; the one wrong line was the plan's bare
  `currentActivity` (RN interop, not androidx) -> `reactContext.currentActivity`. Agent upgraded the
  E2eeUnavailableException simple-name comparison to a verified real `is` check, as the plan permitted.
  `.kotlin/` build dir left untracked as instructed.
Task 1: review dispatched (sonnet), diff f7a6baa8..67a028a6
Task 1: review spec OK, Approved, 1 Important (plan-mandated) + 3 Minor.
Ruling: (Imp 1) FIX. No try/catch around the synchronous CreateRestoreCredentialRequest /
  GetCredentialRequest construction, unlike the NotificationCaptureModule precedent in this same
  codebase which wraps every method body precisely so the Promise always settles. The sibling API
  CreatePublicKeyCredentialRequest throws JSONException synchronously on malformed requestJson.
  Sharp point the reviewer did not have: registerRestoreCredential (Task 3) has NO timeout, so an
  unsettled promise there hangs forever and the registration silently never completes or retries;
  only the restore path is bounded. Cost if wrong: three lines of defensive code that never fire.
Ruling: (Imp 2, same-thread Executor) LEAVE the behaviour, ADD a comment. The callbacks do a cast and
  a promise settle, both thread-safe and neither UI work, so an inline executor is fine; but an
  unexplained choice that diverges from Google's samples invites someone to "fix" it later. Documenting
  why is the actual value here. Cost if wrong: none.
Ruling: fold Minor 1 (vestigial `activity` local in createCredential) into the same round — the round
  is happening anyway and it is one line.
Task 1: fix round 1/5 dispatched, FIX_BASE 67a028a6
Task 1: fix round 1/5 (3 addressed, 0 open; commits 67a028a6..ddbd5712). Re-review confirmed the
  try/catch is safe BY CONSTRUCTION (try scoped to end at the dispatch call, no trailing statement)
  rather than by accident, incl. the retry recursion which gets its own try scope. Residual channel
  named honestly: if the androidx call synchronously invokes the callback AND then throws internally
  before returning, the catch would double-reject — unverifiable, inherent to the pattern, not introduced here.
Task 1: complete (commits f7a6baa8..ddbd5712, review clean)
Task 2: dispatched (haiku), BASE ddbd5712
Task 2: implemented DONE by haiku, commit d250d99c. Reviewer independently re-ran the test (1/1) and
  the typecheck and confirmed the report's RED/GREEN claims; also noted the report file DID contain
  counts (only the short reply omitted them) — my prompt's framing was wrong on that point.
Task 2: review Approved, 1 Important (plan-mandated): index.android.ts has zero test coverage; the
  brief's prescribed test only imports the iOS stub.
Ruling: FIX. "No exported function may reject" is the single property this layer exists to provide, and
  it is currently guarded by nothing on the only file with real control flow. A future edit removing a
  catch would ship silently. Cost if wrong: a handful of cheap tests with a mocked NativeModules.
Task 2: fix round 1/5 dispatched, FIX_BASE d250d99c
Task 2: fix round 1/5 (1 addressed, 0 open; commits d250d99c..7ee7d05d). Re-review verified the
  happy-path test pins pass-through in BOTH directions (arg in, value out) with arbitrary strings,
  the logging test distinguishes all three functions individually, production file untouched,
  no cross-file mock pollution.
Task 2: complete (commits ddbd5712..7ee7d05d, review clean)
Task 2: minor (deferred): dead `import { NativeModules }` at index.android.test.ts:1 — never used as a
  value, may trip the eslint unused-var rule in Task 7's lint step. Flag to Task 7.
Task 3: dispatched (sonnet), BASE 7ee7d05d
Task 3: implemented DONE by sonnet, commit 3b9a69d9, 8/8 new tests, tsc clean, 200/200 adjacent suites.
  Implementer found THREE defects in my plan and resolved all correctly:
Ruling: (a) naming — plan's Interfaces line said `useRestoreCredentialStore` while its own code/tests said
  `restoreCredentialFlag`. The latter is right: it is a plain MMKV accessor, not a Zustand hook, so a `use`
  prefix would be actively misleading. Carry `restoreCredentialFlag` into Task 4's dispatch.
Ruling: (b) plan's test code omitted beforeEach(jest.clearAllMocks) and 3 tests genuinely failed on
  cross-test mock accumulation. Added, matching 12 precedents in this repo. Correct.
Ruling: (c) plan's withTimeout never cleared its setTimeout — stalled Jest exit ~12s and would tick
  needlessly in prod after every successful restore. clearTimeout via .finally() added. Real bug in my
  code, good catch. Cost if wrong: none; clearing a fired timer is a no-op.
Task 3: review dispatched (sonnet), diff 7ee7d05d..3b9a69d9
Task 3: review Approved, 0 Critical, 0 Important. Reviewer independently re-derived the skipAuth
  mechanism from http-client.ts and confirmed both public calls are unauthenticated (no 401 cascade),
  traced both flows as total under every failure ordering, and confirmed the timeout test is non-vacuous
  (the mocked bridge promise never settles, so only the timer can resolve it).
Task 3: complete (commits 7ee7d05d..3b9a69d9, review clean)
Task 3: minor (deferred): no test pins the malformed-JSON path (JSON.parse inside the try) for either flow.
Task 3: minor (deferred): attemptRestoreSession's catch logs nothing, so a genuine server rejection of an
  assertion leaves no diagnostic trace — deliberate (boot-path noise) but worth revisiting once in use.
Task 4: dispatched (sonnet), BASE 3b9a69d9
Task 4: review Approved, 0 Critical, 0 Important. Reviewer read the WHOLE authStore to enumerate every
  session-establishing path (not just the diff) and found coverage complete: 3 direct calls plus the
  isAuthenticated effect, which fires on ANY transition to true and therefore also covers biometricLogin,
  verifyEmail's dead else branch, and initialize's restore (Task 5). Verified the verifyEmail else branch
  is genuinely unreachable by reading the SERVER's auth.service.ts. Also confirmed the fire-and-forget in
  login() still carries a bearer token, because HttpClient reads from secureStorage (already awaited),
  not from Zustand state.
Task 4: complete (commits 3b9a69d9..e85388d0, review clean)
Task 4: minor (deferred): three call sites place the call inconsistently relative to the biometricEnabled write.
Task 4: minor (deferred): no regression test for the launch-path wiring (gate inside setTimeout, userId source).
Ruling: do NOT open a fix round for that second minor. No Critical/Important exists, so opening a round
  purely for a Minor contradicts the rule I applied earlier (fold minors in only when a round is already
  happening). The primitives are tested in Task 3; what is unguarded is placement, whose realistic failure
  modes are "fires earlier" or "one wasted network call per launch", not "feature broken". Sent to the
  final whole-branch review for triage. Cost if wrong: a future refactor moves the wiring unnoticed.
Task 5: dispatched (sonnet), BASE e85388d0
Task 5: implemented DONE by sonnet, commit 81c5be37, 18 suites / 104 tests, tsc clean.
Task 5: review Approved, 1 Important: isVerified hardcoded true although the wire response carries the
  real value (buildAuthResponse always emits it; the restore endpoint refuses unverified accounts before
  reaching it). Only the DECLARED client type omits it.
Ruling: FIX. Hardcoding decouples the client from the server's actual decision, and isVerified drives
  biometric gating elsewhere in this same store. The server guard is documented as defence-in-depth for
  an unreachable state — precisely the kind of check that gets relaxed later, after which the client would
  keep asserting true. Told the implementer to first check why login() already reads the field: if the
  type has it, no cast is needed at all; if it genuinely lacks it, fix the shared type rather than adding
  a second cast. Cost if wrong: a shared-types edit that must typecheck across api and admin too.
Task 5: fix round 1/5 dispatched, FIX_BASE 81c5be37
Task 5: fix round 1/5 (2 addressed, 0 open; commits 81c5be37..0c111a4a). Root cause was real drift:
  the shared AuthResponse genuinely lacked isVerified and login() only got away with reading it because
  auth.api.ts types that response's user as `any`. Fixed the shared type (additive optional field;
  admin never imports AuthResponse; reviewer re-ran mobile+api typechecks itself). isAuthenticated now
  mirrors the sibling branch byte-for-byte. Reviewer worked the failure-mode matrix and confirmed no
  half-done implementation can pass both new tests.
Task 5: complete (commits e85388d0..0c111a4a, review clean)
Task 5: minor (deferred): test 1 does not assert isAuthenticated, so a hypothetical mis-gating off the RAW
  response field (rather than the defaulted local user) would go uncaught. Shipped code does not have it.
Task 6: dispatched (sonnet), BASE 0c111a4a
Task 6: implemented DONE by sonnet, commit 508bf295, 19 suites / 109 tests (3 new), tsc clean.
Task 6: review Approved, 0 Critical, 0 Important. Placement verified by reading the whole logout body;
  isLoggingOut cannot wedge (finally resets it unconditionally); Tasks 4/5 edits confirmed intact by grep
  AND by a diffstat showing insertions only.
Ruling: the reviewer's residual — unguarded clearRestoreCredential() before the token/store reset, so a
  throw there would skip local cleanup — is CLOSED, not open. Task 2's bridge catches every path and
  always resolves; Task 2's own review traced that per-function. The residual only exists if the bridge
  contract is violated, which is itself guarded by tests. Recording so the final review does not re-raise it.
Task 6: minor (deferred): the throw-safety test's isAuthenticated assertion is decorative (beforeEach
  already seeds false), so it cannot distinguish full cleanup from an early bail.
Task 6: complete (commits 0c111a4a..508bf295, review clean)
Task 7: dispatched (sonnet), BASE 508bf295. Issue creation retained by the controller.
Task 7: implemented DONE by sonnet, commit 0a564d49. jest 88 suites / 735 tests, tsc clean, eslint 0 errors,
  gradle BUILD SUCCESSFUL on a forced fresh recompile. Removed the predicted dead NativeModules import and
  fixed an unprompted stale "not started" cross-reference in CLAUDE.md that contradicted the new entry.
Task 7: review Approved, 0 Critical, 0 Important. Reviewer independently re-derived the eslint delta via a
  temp worktree at the merge base and matched it exactly; verified all nine locales are genuinely and
  distinctly translated (checked ru/ua/be for markers that rule out transliteration between them); verified
  content.ts provenance as a regeneration by matching every hunk to its markdown source modulo the
  generator's own documented link-stripping.
Task 7: complete (commits 508bf295..0a564d49, review clean)
ALL 7 TASKS COMPLETE. Final whole-branch review dispatching (opus).

## FINAL WHOLE-BRANCH REVIEW (opus) — 4 merge blockers, all whole-path properties
Ruling: (B1) FIX — CRITICAL. Only the bridge call is inside withTimeout; both api calls around it are bare
  awaits, RN's OkHttp has no default timeouts, and initialize() gates the splash via useAppBootstrap +
  RootNavigator returning null. A stalled socket holds a white screen forever on EVERY logged-out cold
  start, including first launch after install where the credential is guaranteed absent. Regression on a
  path that previously did zero I/O. Bound the whole body.
Ruling: (B2) FIX. Availability is probed after the first server call, so every authenticated launch on
  iOS and app.ai-budget.pl issues GET /auth/restore/register/options and writes a 300s Redis key that is
  then discarded — permanently, since hasSynced can never become true there. Add an
  isRestoreCredentialAvailable() to the bridge so platform knowledge stays in the platform files, and it
  also covers the missing-native-module case nothing else catches.
Ruling: (B3) FIX. Sign-in double-registers: the launch timer arms on isAuthenticated before the direct
  call reaches markSynced. On verifyEmail the flag is set 9 lines and 4 awaits BEFORE the register call,
  so the race is near-certain. Guard belongs INSIDE registerRestoreCredential, not at the four call sites —
  call sites will keep multiplying. Do NOT gate the sign-in calls on hasSynced: the flag survives logout(),
  which deletes the server row, so post-sign-out re-registration depends on those calls staying ungated.
Ruling: (B4) FIX. applyRestoredSession calls loadAccounts(), mirroring the stored-session branch whose
  premise (populated local SQLite) is exactly what a restored device lacks — so it re-fetches accounts the
  response already carried, awaited on the boot path, and picks localAccounts[0] instead of
  defaultAccountId. A multi-account user can land on the wrong account after a transfer in an app where
  every screen is account-scoped.
Ruling: deferred items 1 and 2 (launch-path test; inconsistent call placement) move to FIX — both are
  subsumed by B3, whose code is being edited anyway. All other deferred items: LEAVE, per the reviewer's
  triage, which I accept. Notably the "catch logs nothing" deferral is better justified than I thought:
  an offline cold start reaches that catch via the options fetch, so a warn there would be per-launch
  noise for every offline user.
Fix wave (single dispatch) covers B1-B4 + the two promoted deferrals.
Fix wave: commit f812cbaf, 748/748 tests, tsc clean, eslint 0 errors. Scoped re-review: B1-B4 all
  genuinely ADDRESSED and correctly tested (timeout proven end-to-end — the clock starts before the
  options fetch can settle; contract preserved; timer still cleared; in-flight guard's finally
  unreachable-skip ruled out). Fix 5 PARTIAL + 2 new Important.
Ruling: FIX all three residuals despite the "no second fix wave" rule — same reasoning as stage 1: the
  rule bars endless broad re-fixes, and the controller is directed to rule on load-bearing residuals.
  (a) registerRestoreCredential is still unbounded, and the guard our own fix wave added turns a network
  stall into a process-lifetime block of ALL registration, including for a different user (the flag is
  global, not per-userId). This is a defect our fix introduced. One line: race the body with withTimeout.
  (b) AUTHENTICATED_BOOTSTRAP_DELAY_MS is exported with a docstring claiming a test references it; none
  does. (c) Fix 5's narrowed docstring still omits register() as an inline writer — a smaller instance
  of the defect it was raised to remove.
Ruling: also fold in logout()'s api.deleteRestoreCredentials() call on iOS/web — same class as B2 and now
  one line with the new probe. Fixing one half of a defect class and leaving the other reads as deliberate.
  Cost if wrong: four one-to-three-line changes, all on non-boot paths.
