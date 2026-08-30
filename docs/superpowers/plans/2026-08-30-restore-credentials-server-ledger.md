# SDD ledger — plan: docs/superpowers/plans/2026-08-30-restore-credentials-server.md

Spec: docs/superpowers/specs/2026-08-30-restore-credentials-design.md (read)
Branch: feature/restore-credentials-server
Base: f1bbfae6

## Setup rulings

Ruling: Execute on a branch in the main working tree, not a git worktree — a
fresh worktree has no node_modules (Turborepo hoists to the repo root), so every
task's `npx jest` step would fail until a slow monorepo install. Cost if wrong:
weaker isolation than a worktree; recoverable with a branch reset.

Ruling: Commits are authorized — the user chose to execute a plan whose every
task ends in `git commit`. No pushes. Cost if wrong: local commits the user can
reset.

## Pre-flight conflict scan

### Cross-task pairs (shared file or interface)

| Pair | Produced → Consumed | Finding |
|---|---|---|
| T1 → T4 | `resolveRestoreCredentialConfig`, `RestoreCredentialConfig{rpId,rpName,expectedOrigins}` → `this.config.*` | agree |
| T1 → T7 | env `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` (colon-hex, comma-separated) → same values in assetlinks.json | agree |
| T2 → T4 | `prisma.restoreCredential` fields → `create({userId,credentialId,publicKey,counter,transports})` | agree |
| T2 → T5 | `credentialId @unique`, `counter`, `lastUsedAt` → `findUnique({where:{credentialId}})`, `update({counter,lastUsedAt})` | agree; unique required for findUnique and present |
| T3 → T5 | `AuthService.buildAuthResponse(user, override?)` → `this.auth.buildAuthResponse(user)` | agree |
| T4 → T5 | same service file: `CHALLENGE_TTL_SEC`, `regKey`, ctor fields `config/prisma/cache/auth/logger` → T5 uses all of them plus module-level `authKey` | agree; T5's additions are consistent with T4's module-level style |
| T4 → T5 | T4's spec-file mock declares all four library fns → T5 uses the two authentication ones | agree; mock is deliberately complete up front |
| T4,T5 → T6 | 5 service methods → 5 routes | agree, signatures match |
| T4 → T6 | `@simplewebauthn/server` installed in T4 → T6 DTOs import its types | agree, ordering correct |
| T7 → web-deploy.yml | only task touching that file | no conflict |

### Per-task self-consistency

| Task | Finding |
|---|---|
| T1 | Tests match implementation. Round-trip assertion avoids a copied base64 constant — deliberate, not a gap. |
| T2 | Schema and hand-written SQL agree column for column. Step 5 references `$SHADOW_DATABASE_URL`, which this repo does not define; the step already carries an explicit skip-and-hand-verify fallback. Acceptable. |
| T3 | Test names a `makeUser` helper and instructs the implementer to check it exists rather than assume. Consistent. |
| T4 | **DEFECT — see ruling below.** Otherwise consistent. |
| T5 | Consistent; counter rule in test and code agree. |
| T6 | Guard assertions read `__guards__` metadata; plan already instructs verifying the guard import path. Consistent. |
| T7 | Consistent. |
| T8 | Consistent. |

### Rulings

Ruling: T4's constructor calls `resolveRestoreCredentialConfig(process.env)`,
which T1 makes **throw** when `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` is unset.
A throwing constructor fails Nest's DI container, so the ENTIRE API would refuse
to boot on any environment lacking the new variable — including production on
the first deploy, and every developer machine. The spec intends the feature to
fail closed, not the application. Decision: keep `resolveRestoreCredentialConfig`
throwing (T1 unchanged, its test stands), but have the service catch in the
constructor, log a warning, hold `config = null`, and have each of the five
ceremony methods throw `ServiceUnavailableException` while it is null. Fails
closed for the feature, leaves every other route alive.
Cost if wrong: a misconfigured deployment serves 503 on five restore routes
instead of failing loudly at boot — discoverable in logs, not silent.

Ruling: Flag to T6 that `ValidationPipe` may be configured with `whitelist`
in `main.ts`; the WebAuthn payload is a nested plain object with no per-field
decorators, so the implementer must confirm it survives validation intact
rather than being stripped to `{}`. Cost if wrong: registration and
authentication both reject every real request with a confusing 400.

## Resolved interfaces (carry into dispatches)

- `AuthenticatedUser` (`apps/api/src/common/types/index.ts`) = `{ id, email, name, currencyCode, defaultAccountId? }`.
  T6's `req.user.id` / `req.user.email` are valid as written.
- `JwtAuthGuard` lives at `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`.
- **No `makeUser` helper exists in `auth.service.spec.ts`** — T3 must build the
  user object inline from the shape the neighbouring googleLogin tests use.
- `main.ts` ValidationPipe: `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
  T6 must confirm empirically that the nested WebAuthn payload survives; with no
  `@ValidateNested()`/`@Type()` on the DTO field, class-transformer should leave
  the plain object intact, but `forbidNonWhitelisted` makes a wrong guess a 400
  on every real request.

## Progress

Ruling: The plan's Task 4 code imports `PrismaService` from
`../../prisma/prisma.service`, which does not exist — the real path is
`../../database/prisma.service` (verified against merchant-rules.service.ts).
Task 4 and Task 5 dispatches must carry the correct path. `CacheService` at
`../../common/cache/cache.service` in the plan is correct as written.
`PrismaService` comes from a global module, so `RestoreCredentialsModule` still
needs only `AuthModule` in its imports, as the plan says.
Cost if wrong: a compile error tsc catches immediately — cheap either way, but
catching it here saves a fix round.

Task 1: dispatched (haiku), BASE f1bbfae6
Task 1: implemented DONE by haiku, commit 5351d0c4, 8/8 tests, RED+GREEN evidence in report.
Task 1: review dispatched (sonnet), diff f1bbfae6..5351d0c4
Task 1: complete (commits f1bbfae6..5351d0c4, review clean)
Task 1: minor (deferred): RESTORE_CREDENTIAL_RP_NAME is read by the code but undocumented in .env.example
Task 1: minor (deferred): no test asserts the rpName default 'AI Budget Assistant' (plan-inherited gap, not an implementer defect)
Task 2: dispatched (haiku), BASE 5351d0c4
Task 2: implemented DONE by haiku, commit 857b7d97, prisma validate + generate clean, no unit tests by design.
Task 2: review dispatched (sonnet), diff 5351d0c4..857b7d97
Task 2: review CRITICAL — migration.sql `transports TEXT[]` missing NOT NULL vs schema `String[] @default([])`.
Ruling: finding is correct and the defect is the PLAN's (I authored that SQL). Prisma has no
optional scalar list, so `String[] @default([])` always generates NOT NULL; repo precedent
chat_messages.mentioned_user_ids (migration 20260525121916) confirms. Fix the SQL, not the schema.
Cost if wrong: none plausible — the alternative is prod drift at deploy plus a Prisma
deserialization crash on any NULL row written outside the client.
Task 2: fix round 1/5 dispatched to original implementer, FIX_BASE 857b7d97
Task 2: fix round 1/5 (1 addressed, 0 open; commits 857b7d97..d8bd7000). Re-review independently
  verified all 8 columns' nullability; no second missed column, no new breakage.
Task 2: complete (commits 5351d0c4..d8bd7000, review clean)
Note: plan's own Task 2 SQL corrected in a follow-up docs commit so the defect cannot be re-read back in.
Task 3: dispatched (sonnet), BASE 5c731246. Carried: no makeUser helper exists; googleLogin's
  hardcoded isVerified:true must be proven equivalent by unmodified pre-existing tests.
Task 3: implemented DONE by sonnet, commit ec0b3202, auth suite 33/33, pre-existing tests unmodified.
Task 3: review dispatched (sonnet), diff 5c731246..ec0b3202 — asked to verify the isVerified equivalence
  across all three googleLogin paths, since that is the one way this "pure extraction" could silently change output.
Task 3: complete (commits 5c731246..ec0b3202, review clean)
Task 3: minor (deferred): buildAuthResponse doc comment claims "the single place a session is assembled",
  but login/register/verifyEmail still assemble inline. Plan-mandated wording; fix in Task 8's docs step.
Ruling (refines the ServiceUnavailable ruling): only the methods that actually need the trust-chain
  config throw ServiceUnavailableException when it is unresolved — getRegistrationOptions,
  verifyRegistration, getAuthenticationOptions, verifyAuthentication. `deleteForUser` is a plain
  Prisma delete needing no config, and blocking sign-out cleanup on a misconfigured origin list would
  be gratuitous. Cost if wrong: a sign-out can still clear server rows on a misconfigured deployment,
  which is the harmless direction.
Task 4: dispatched (sonnet), BASE ec0b3202
Task 4: implemented DONE by sonnet, commit 05db3861, 16/16 tests, tsc clean project-wide.
Task 4: review dispatched (sonnet), diff ec0b3202..05db3861 — pointed at challenge lifecycle,
  what persists on failed verification, the fail-closed gate, and test honesty (the library is mocked,
  so a test that only asserts the mock was called with what the code passed it proves nothing).
Task 4: review spec OK, quality Approved, 1 Important: no regression test pins attestationType:'none',
  residentKey/userVerification, supportedAlgorithmIDs — all named locked decisions in the spec. Reviewer
  independently re-ran the suite (16/16) and traced every test for honesty; found none tautological.
Task 4: minor (deferred): verifyRegistrationResponse not wrapped, so a malformed body surfaces as 500 not 401
  — note for Task 6's controller.
Task 4: minor (deferred): jest.clearAllMocks vs mockReset; no actual leakage today.
Task 4: fix round 1/5 dispatched to original implementer, FIX_BASE 05db3861
Task 4: fix round 1/5 (1 addressed, 0 open; commits 05db3861..1ae6a5a5). Re-review confirmed all four
  pinned values genuinely fail on change and rpID is asserted independently; test-only diff, no breakage.
Task 4: complete (commits ec0b3202..1ae6a5a5, review clean)
Task 5: dispatched (sonnet), BASE 1ae6a5a5
Task 5: implemented DONE_WITH_CONCERNS by sonnet, commit caff1ef4, 25/25 tests, tsc clean.
  Concern raised: the counter guard does not catch a non-zero -> 0 regression (5 -> 0).
Ruling: the SPEC's wording was wrong, not the code. A zero reading means "this authenticator does not
  report counts", not "it went backwards". A restore credential's purpose is to arrive on a NEW device
  where nothing promises the old counter travelled with it, so rejecting 5 -> 0 would fail the exact flow
  the feature exists for, to buy a weak clone signal already moot once an attacker holds the Google backup.
  Guard stays as implemented; spec corrected; a test + comment added so the accept is deliberate, not
  an accident of the boolean. Cost if wrong: we lose counter-based clone detection for restore keys,
  which was never a load-bearing control here.
Task 5: pre-review addition dispatched (test pinning 5->0 accept + explanatory comment)
Task 5: counter pinning added, commit 5af38fbf, 26/26 tests pristine, tsc clean.
Task 5: review dispatched (sonnet), diff 1ae6a5a5..5af38fbf (2 commits) — pointed at replay, challenge
  provenance (client-supplied clientDataJSON must be a Redis lookup key only, never a trusted expectation),
  every failure path's status code, and whether a session can be issued before the isActive check.
Spec wording for signCount corrected in its own docs commit.
Task 5: review spec OK, Approved, 3 Important — ALL labeled plan-mandated. Rulings:
Ruling: (Imp 1) FIX. verifyAuthenticationResponse/verifyRegistrationResponse are unguarded and
  SentryExceptionFilter maps non-HttpException to 500, violating the spec's explicit "every failure path
  returns 401, never 500". POST /auth/restore is public, so malformed traffic would also produce a 500
  storm in Sentry. Applies to the registration half too (Task 4, already closed) — same file, same
  implementer, so folded into this round rather than reopened separately.
  Cost if wrong: a genuine library bug is reported as 401 instead of 500; mitigated by logging at warn.
Ruling: (Imp 2) FIX. cache.get + cache.del is not atomic, so two concurrent identical assertions can both
  observe the challenge. Harm is narrow (two sessions for the same owner, no cross-account bypass) but the
  spec claims replay is impossible, and Redis 7 GETDEL closes it in one command via a new CacheService
  method. Cost if wrong: one new method on a global service; existing callers untouched.
Ruling: (Imp 3) FIX. The findUnique mock ignores its arguments, so "user resolved from the stored row, not
  userHandle" is not actually pinned; and the replay test never asserts del happens before verify. Both are
  the load-bearing security properties of this task. Cost if wrong: none, tests only.
Task 5: fix round 1/5 dispatched to original implementer
Task 5: fix round 1/5 (4 addressed, 0 open; commits b00ac88f..a4fce1ef). Re-review confirmed the try/catch
  wraps ONLY the library call (deliberate UnauthorizedException and requireConfig's ServiceUnavailable
  both raised before it), getAndDelete is a single Redis GETDEL that fails CLOSED on outage, and no
  pre-existing CacheService method was touched. Task 4's registration half got the same 500 fix.
Task 5: complete (commits 1ae6a5a5..a4fce1ef, review clean)
Task 6: dispatched (sonnet), BASE a4fce1ef
Task 6: implemented DONE by sonnet, commit c13c9f15, 4 suites / 33 tests, tsc clean.
  Honest caveats reported: brief named a non-existent npm script (repo uses `npm run dev`); no local
  Postgres/Redis, so full startup could not complete, but all 5 routes appeared in the startup log first.
Task 6: review dispatched (sonnet), diff a4fce1ef..c13c9f15 — pointed at guard placement (asked explicitly
  whether the guard test would fail if the two guards were SWAPPED, since a test asserting a metadata key
  Nest never writes would pass vacuously on both), route collisions on the shared /auth/restore path,
  throttle placement, and whether the ValidationPipe test really proves the nested payload survives.
Task 6: review spec FAIL on one point — @Throttle applied without @UseGuards(ThrottlerGuard), and this
  repo has no global APP_GUARD for the throttler, so both public routes were unthrottled despite looking
  throttled. Reviewer verified against app.module.ts and three existing call sites. Plan-mandated.
Ruling: FIX. The spec requires the public routes to be throttled, and this is the feature's ONLY
  unauthenticated surface. Cost if wrong: none — the guard is the repo's established pairing.
Ruling: fold the Minor "no delegation test" into the same round. Normally minors are deferred, but the
  round is happening anyway, and getRegistrationOptions(userId, email) takes two same-typed strings that
  a reflection test cannot tell apart — a swap would compile and pass everything. Cost if wrong: a few
  extra cheap tests.
Task 6: guard placement, DTOs, module wiring and the ValidationPipe empirical check all verified GOOD by
  the reviewer, incl. independent confirmation that '__guards__' is the real Nest metadata key.
Task 6: fix round 1/5 dispatched, FIX_BASE c13c9f15. Plan's own sample corrected in the repo too.
Ruling: implementer chose per-route ThrottlerGuard placement over the class-level form my plan edit showed,
  citing the three repo precedents. That is correct and is what I asked for (follow the precedent); the
  plan doc has been corrected to match the code rather than the other way round.
  Cost if wrong: none — both placements cover the same two routes on this controller.
Task 6: fix round 1/5 dispatched -> commit b3fa3814, 5 suites / 38 tests, tsc + eslint clean,
  argument-swap deliberate-failure check confirmed RED then reverted.
Task 6: scoped re-review dispatched (sonnet), diff c13c9f15..b3fa3814
Task 6: fix round 1/5 (2 addressed, 0 open; commits c13c9f15..b3fa3814). Re-review confirmed per-method
  ThrottlerGuard on both public routes, registration controller untouched, the JwtAuthGuard assertion
  still discriminating (method-level guards do not enter the class __guards__ array), and all five
  delegation assertions order-sensitive with concrete values.
Task 6: complete (commits a4fce1ef..b3fa3814, review clean)
Ruling: Task 7's deploy guard must check for LEFTOVER PLACEHOLDERS as well as file existence. We do not
  have the real fingerprints yet (release one is in Play Console, keytool is not on PATH), and
  web-deploy.yml runs on every push to development — so a merge would publish a public assetlinks.json
  full of dummy values. The branch is unmerged, so this blocks nothing today and makes forgetting the
  real values impossible. Cost if wrong: the apex web deploy fails loudly with a named error until the
  fingerprints are filled in, which is the intended behaviour.
Task 7: dispatched (sonnet)
Task 7: implemented DONE by sonnet, commits 3aede722 + 5348d4fc. YAML + JSON parse checks pass; placeholder
  guard tested in isolation both directions and confirmed firing against the real committed file. Real debug
  fingerprint obtained via gradlew signingReport; release fingerprint still a placeholder by design.
Ruling: the implementer went beyond scope and made a READ-ONLY ssh check of the prod VPS nginx config to
  verify the dotfile-deny caveat (confirmed no such rule; single-file bind mount confirmed). Accepted: no
  writes, and it materially de-risks the rollout by replacing a guess with a fact. Recorded because a
  subagent reaching production unprompted is scope the user should know was taken.
  Cost if wrong: none observed; nothing was mutated.
Task 7: review dispatched (sonnet), diff 1cefc5b7..5348d4fc
Task 7: complete (commits 1cefc5b7..5348d4fc, review clean). Debug fingerprint is real and shape-verified
  (32 uppercase hex pairs); release entry is a placeholder the deploy guard actively blocks today.
Task 7: minor (deferred): runbook folds its migration mention into Rollback rather than a dedicated
  Migrations section like receipt-split-rollout.md has.
Task 7: minor (deferred): the "what happens if unset" description is stated as fact but describes code
  outside that diff (verified true by the controller across tasks 4-6).
Task 8: dispatched (sonnet), BASE 5348d4fc. Issue creation retained by the controller.
Task 8: implemented DONE_WITH_CONCERNS by sonnet, commit 4937eaf4. jest 2064/2065; tsc clean;
  deploy guard exit 0. The single failing spec (safe-to-spend) and the 16 lint errors are PRE-EXISTING —
  controller independently verified against merge-base 61306b90 that this branch touches none of those files.
Task 8: review dispatched (sonnet), diff 5348d4fc..4937eaf4
Task 8: complete (commits 5348d4fc..4937eaf4, review clean). Reviewer spot-checked every technical claim
  in the CLAUDE.md bullet against branch source; zero inaccuracies.
Task 8: minor (deferred): the bullet is ~2x its immediate neighbours in length (justified by density,
  well within the file's range, but the self-review overstated how close the match was).
ALL 8 TASKS COMPLETE. Final whole-branch review dispatching (opus), merge-base 61306b90..4937eaf4.

## FINAL WHOLE-BRANCH REVIEW (opus) — 3 blockers, 7 Important, 11 Minor

Ruling (Blocker 1, debug fingerprint = public RN template key): ESCALATE TO USER, do not decide alone.
  The reviewer proved by sha256 that apps/mobile/android/app/debug.keystore is byte-identical to the
  stock react-native template keystore shipped inside node_modules. The user explicitly chose "both
  fingerprints" during brainstorming, but chose it on the spec's false premise that this key is ours.
  Reversing an explicit user choice, and anything involving generating/committing signing key material,
  is security-sensitive and theirs to settle. Nothing deploys until they merge, so there is no urgency
  forcing a unilateral call. Cost if wrong: none — the decision is simply deferred to the person who made it.
Ruling (Blocker 2, handle_all_urls): FIX. The spec asks only for get_login_creds; handle_all_urls is a
  latent site-wide link-hijack surface the day anyone adds an autoVerify intent-filter.
Ruling (Blocker 3, merge freezes the whole web deploy): DO NOT weaken the guard — it is correctly designed.
  Surface to the user instead: the answer is to obtain the Play fingerprint before merging. Fix only the
  CLAUDE.md wording, which undersells the blast radius as "the apex deploy" when the failing step precedes
  BOTH rsyncs and also freezes the app.ai-budget.pl SPA deploy.
Ruling (Imp 3 + Imp 4 together): FIX. One failure surfacing twice — the registration half was left behind
  when the auth half was hardened, and its non-atomic, success-only challenge delete feeds the missing
  create-idempotency straight into a 500. Repo already has a documented rule for this (ABA-316).
Ruling (Imp 5): FIX. The verifier's `credential.publicKey` argument is the single most security-relevant
  value in the module and the only one unpinned; a regression sourcing it from the request would verify
  every forged assertion with all tests still green.
Ruling (Imp 6): FIX via Math.max. Decision #3 ruled on ACCEPTING 5->0, never on PERSISTING 0, and a test
  now locks in a behaviour nobody chose.
Ruling (Imp 7, DELETE removes all rows): document in the spec as a stage-2 contract question rather than
  change the endpoint now; stage 2 defines the client contract that calls it.
Final review deferred-item triage accepted as given.
Fix wave (single dispatch) covers: Blocker 2, Imp 3, 4, 5, 6, Minor 1, 2, 4, 7, 8, RP_NAME doc,
  buildAuthResponse comment, CLAUDE.md blast-radius wording, spec note for Imp 7.
USER DECISION (Blocker 1): remove the debug fingerprint from production assetlinks.json entirely.
  Rationale accepted: the debug entry is unused until stage 2, and regenerating a project-specific
  keystore now would break Google sign-in on debug builds (OAuth client IDs are registered against a
  specific signing SHA-1) for no present benefit. A project debug key + its Google Cloud SHA-1
  registration becomes a stage-2 prerequisite. Spec decision #7, the runbook, CLAUDE.md and .env.example
  are being corrected in the same fix wave; restore-credential.config.ts is unchanged and keeps its
  multi-fingerprint support.
Scoped re-review of the fix wave: 8 findings ADDRESSED, 2 PARTIAL, 1 NEW Important, 2 nits.
Ruling: the NEW Important is load-bearing and gets fixed despite the "no second fix wave" rule. The rule
  bars endless broad re-fixes; it explicitly directs the controller to rule on load-bearing residuals.
  reconcileExistingCredential writes `counter: data.counter` verbatim, so an ordinary re-registration
  presenting 0 wipes a stored non-zero watermark — reintroducing the exact defect Important 6 closed, via
  the registration door, and NEW to this diff (previously a duplicate credentialId threw P2002 and wrote
  nothing). One line, specified precisely by the reviewer. Cost if wrong: none; Math.max cannot lower a
  watermark and the accept/reject behaviour is unchanged.
Ruling: fold in the two PARTIALs and both nits — all trivial, all documentation or one-line, and one of
  them (CLAUDE.md's 45-vs-46 module count) makes the file contradict its own ABA-335 entry with a
  fresh-looking number a reader would now trust.
