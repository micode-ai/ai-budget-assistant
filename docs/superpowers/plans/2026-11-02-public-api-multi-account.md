# Public API Multi-Account Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One OAuth connection (one token pair) covers several accounts the user ticks on the consent screen; every account-scoped `/public/v1` call is addressed to one of them with `X-Account-Id`, and the user can drop a single account from a connection.

**Architecture:** `OAuthGrant.accountId` moves into a join table `oauth_grant_accounts` (grant ↔ account), with one active grant per (client, user). Connection-level checks (token, client, user, scopes, rate limit) stay in `PublicApiAuthGuard`; it then resolves the addressed account from the header and rechecks the grantor's role, the tier and the deleted state for that account only. A shared util computes each granted account's state (`active`, `reason`, `access`) for the token endpoint, `GET /public/v1/accounts` and Connected apps.

**Tech Stack:** NestJS 10, Prisma 5 + raw SQL migration, PostgreSQL 16, Redis (`CacheService`), `@nestjs/swagger` 7, Jest (`*.spec.ts`, `apps/api/test/*.e2e-spec.ts`), Expo Router + Zustand (phone + `.web.tsx` desktop), i18next (9 locales).

**Spec:** `docs/superpowers/specs/2026-11-02-public-api-multi-account-design.md` (read it first). Predecessor: `docs/superpowers/specs/2026-11-01-public-api-design.md`, plan `docs/superpowers/plans/2026-11-01-public-api-phase1.md`. Wiki: `docs/wiki/features/public-api.md`.

## Global Constraints

- Only accounts where the grantor is **owner or editor** can be connected; the role is rechecked on every request, **per addressed account**.
- `encryptionTier >= 2` accounts are not selectable (shown disabled with the reason); tier 1 accounts are **read-only** with tier-1 fields nulled. Addressing an account that reached tier ≥ 2 after it was connected → `403 account_encrypted`; other accounts unaffected.
- Archived trips keep phase 1 behaviour (readable; writes `403 trip_archived`). `PUBLIC_API_ENABLED` still gates everything.
- Header is `X-Account-Id`. The rule counts **granted** accounts, not usable ones: exactly 1 granted → header optional; more than 1 → missing header is `400 account_required` (also for `GET /public/v1/account`). Not in the connection → `403 account_not_granted`; role recheck fails → `403 grant_inactive`. All through the existing `{error:{code,message,details?}}` envelope.
- `GET /public/v1/accounts` is token-only and always succeeds for a live token: every granted account with `id, name, type, base_currency, access: 'read'|'read_write', active, reason: 'role'|'encrypted'|'archived'|null`.
- `/oauth/token` always returns `account_ids` (array); `account_id` only when the connection has exactly one account. Refresh/code exchange fail with `invalid_grant` when no account of the connection is active.
- Scopes and rate limits stay per connection/per client: one bucket `pa:g:<grantId>` for a multi-account connection. Idempotency keys are scoped per account and per client.
- Re-consent pre-ticks the currently connected accounts and **replaces** the set; removal cuts that account off on the next request; tokens stay valid for the remaining accounts. A grant whose last account is removed is revoked.
- Consent default: nothing pre-ticked on a first connection unless the user has exactly one eligible account; grant button disabled until ≥1 ticked; each row shows name, type and a read-only badge for tier 1.
- Co-owners see a connection only with the accounts of that grant they are themselves owner/editor of; never the grantor's other accounts. A co-owner's Disconnect removes only those accounts; only the grantor revokes the whole connection. The "app connected" e-mail to an owner lists only that owner's accounts.
- Phase 1 contract for a single-account connection must not break (old approve body `account_id`, no header, `account_id` in the token response).
- Repo rules: `schema.prisma` change ships with its migration in the same commit; never runtime-import `@budget/shared-utils` in `apps/api`; fire-and-forget uses `logFireAndForget`; every UI string in all 9 locales (en/de/es/fr/pl/ru/ua/be/nl); every screen verified on phone and desktop web (≥1024) with component-level `.web.tsx` splits; docs (Swagger texts + guide) in en/pl/ru.
- Commits: step commits locally, squashed into one `ABA-{N} …` commit by `finish-aba-task`; never push without the owner's OK.
- Build note: `ts-jest` type-checks every imported file, and Task 1 removes `OAuthGrant.accountId`. `apps/api` `npm run typecheck` is expected red from Task 1 until Task 4 ends; Tasks 1–3 verify with their own jest targets only.

## Review Focus

1. **Odd `X-Account-Id` values** — uppercase UUID, surrounding spaces, empty string, the header sent twice. Expected: compared lower-cased and trimmed; empty = absent; repeated header → `400 validation_failed` with `details.fields['X-Account-Id']`. Tests in Task 4.
2. **Account soft-deleted in the app** (`Account.isActive = false`, which is how `AccountsService.remove` deletes — no FK cascade fires) — must drop out of every grant, and a grant left empty is revoked (`401 invalid_token` next call). Tests in Task 2.
3. **Co-owner views and disconnects** — the co-owner's list and the owner's e-mail never contain the name of the grantor's other accounts; the co-owner's Disconnect leaves the grantor's personal account connected. Tests in Tasks 2 and 3, e2e in Task 9.
4. **Phase 1 web bundle or integrator still sending `account_id`** in approve, and a phase 1 integrator reading `account_id` from the token response — both keep working for one account. Tests in Tasks 3 and 4.
5. **A changes-feed cursor or an `Idempotency-Key` reused across two accounts of one connection** — the key creates a separate expense in each account (both `201`); a cursor from account A used on B never returns A's rows. Tests in Task 5 (adapter) and Task 9 (e2e).

---

### Task 1: Join table, merge migration, new partial unique index

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`OAuthGrant`, `Account`, new `OAuthGrantAccount`)
- Create: `apps/api/prisma/migrations/20261102000000_public_api_multi_account/migration.sql`
- Modify: `apps/api/src/modules/oauth/schema-guard.spec.ts`

**Interfaces — Produces:**
- Prisma model `OAuthGrantAccount { grantId @map("grant_id"), accountId @map("account_id"), createdAt @default(now()) @map("created_at"); grant → OAuthGrant onDelete Cascade; account → Account onDelete Cascade; @@id([grantId, accountId]); @@index([accountId]); @@map("oauth_grant_accounts") }`.
- `OAuthGrant`: `accountId` and `account` removed; `accounts OAuthGrantAccount[]` added; `@@index([accountId])` removed; doc comment says "one ACTIVE grant per (client, user), index `oauth_grants_active_client_user_key`".
- `Account.oauthGrants` replaced by `oauthGrantAccounts OAuthGrantAccount[]`.
- Raw index: `CREATE UNIQUE INDEX oauth_grants_active_client_user_key ON oauth_grants (client_id, user_id) WHERE revoked_at IS NULL;`

- [ ] **Step 1: Update `schema-guard.spec.ts`** — parameterise over two indexes. `oauth_grants_active_key`: created by exactly one migration (`20261101000000_public_api_oauth`) and dropped only by `20261102000000_public_api_multi_account`. `oauth_grants_active_client_user_key`: created by exactly one migration, contains `WHERE revoked_at IS NULL`, never dropped later. New assertion: the multi-account migration's SQL has `INSERT INTO "oauth_grant_accounts"` **before** `DROP COLUMN "account_id"` (string index comparison), so data is copied before the column goes.
- [ ] **Step 2: Run** `cd apps/api && npx jest schema-guard` → FAIL (migration missing).
- [ ] **Step 3: Edit the schema, then** `npx prisma migrate dev --name public_api_multi_account --create-only` and rename the folder to `20261102000000_public_api_multi_account`. Rewrite the SQL by hand in this order (Prisma's generated order drops the column first and loses data):
  1. `CREATE TABLE "oauth_grant_accounts"` + PK `("grant_id","account_id")` + index on `account_id` + both FKs `ON DELETE CASCADE`.
  2. `INSERT INTO oauth_grant_accounts (grant_id, account_id, created_at) SELECT id, account_id, created_at FROM oauth_grants;` (every grant, revoked ones too — keeps history).
  3. Merge (spec decision 13): survivor per (client_id, user_id) among `revoked_at IS NULL` = earliest `created_at`, tie on `id`. Insert losers' accounts into the survivor (`ON CONFLICT DO NOTHING`); set survivor `scopes` = `ARRAY(SELECT DISTINCT unnest(...) ORDER BY 1)` over the group; `DELETE FROM oauth_tokens` of losers; `UPDATE oauth_grants SET revoked_at = now(), revoked_by = 'user'` on losers (comment: no dedicated enum value; production holds no grants on 2026-11-02).
  4. `DROP INDEX oauth_grants_active_key;` then the new partial index.
  5. Drop FK `oauth_grants_account_id_fkey`, index `oauth_grants_account_id_idx`, column `account_id`.
  Then `npx prisma migrate dev` (applies) and `npx prisma generate`.
- [ ] **Step 4: Verify the merge on the dev DB** — before applying step 3's migration, seed via psql two active grants for one (client, user) on accounts X and Y with scopes `{expenses:read}` / `{categories:read}`, each with one token row. After apply: `SELECT count(*) FROM oauth_grants WHERE revoked_at IS NULL AND client_id=…` = 1; survivor has 2 rows in `oauth_grant_accounts` and scopes `{categories:read,expenses:read}`; loser has `revoked_by='user'` and 0 tokens. Then `npx jest schema-guard` → PASS.
- [ ] **Step 5: Commit** `public-api: grant-accounts join table and merge migration`

---

### Task 2: Grant service, account states, Connected apps endpoints, account deletion

**Files:**
- Create: `apps/api/src/modules/oauth/oauth-grant-accounts.util.ts` (+ `oauth-grant-accounts.util.spec.ts`)
- Modify: `apps/api/src/modules/oauth/oauth-grants.service.ts` (+ spec), `connected-apps.controller.ts`, `connected-apps.spec.ts`, `oauth-token-cleanup.cron.ts` (+ spec)
- Modify: `apps/api/src/modules/accounts/accounts.service.ts` (`remove`, ~line 183) + its spec

**Interfaces:**
- Consumes: Task 1 models.
- Produces (`oauth-grant-accounts.util.ts`):
  - `GRANTING_ROLES: ReadonlySet<string>` (`owner`, `editor`) — the guard and token service import it from here.
  - `interface GrantAccountState { id: string; name: string; type: AccountType; currencyCode: string; encryptionTier: number; tripStatus: TripStatus | null; role: AccountRole | null }` (`role` = the grantor's current role, `null` when no longer a member).
  - `loadGrantAccountStates(db: PrismaService | Prisma.TransactionClient, grantId: string, grantorId: string): Promise<GrantAccountState[]>` — only accounts with `isActive = true`, ordered by `oauth_grant_accounts.created_at`, then `account.id`.
  - `grantAccountStatus(s: GrantAccountState): { active: boolean; reason: 'role' | 'encrypted' | 'archived' | null }` — precedence role (`null` or `viewer`) → `{false,'role'}`, tier ≥ 2 → `{false,'encrypted'}`, `tripStatus === 'archived'` → `{true,'archived'}`, else `{true,null}`.
  - `grantAccountAccess(s: GrantAccountState, scopes: readonly string[]): 'read' | 'read_write'` — `read_write` only when active, tier 0, not archived and `scopes` includes `expenses:write`.
  - `dropAccountFromGrants(tx: Prisma.TransactionClient, accountId: string): Promise<void>` — deletes the account's join rows; every active grant left with zero join rows gets its tokens deleted and `revokedAt/revokedBy:'user'`.
- Produces (`OAuthGrantsService`):
  - `replaceActive(clientDbId: string, userId: string, accountIds: string[], scopes: PublicScope[]): Promise<{ grant: OAuthGrant; isNew: boolean; addedAccountIds: string[] }>` — replaces `upsertActive`. Existing active grant for (client, user): in one `$transaction`, delete join rows not in `accountIds`, `createMany({ skipDuplicates: true })` the rest, replace scopes. Else create with nested accounts; P2002 on `oauth_grants_active_client_user_key` → re-fetch and replace (same pattern as today). `addedAccountIds` = all for a new grant, the newly added for an existing one.
  - `removeAccounts(grantId: string, accountIds: string[]): Promise<{ revoked: boolean }>` — deletes those join rows; zero left → `revoke(grantId, 'user')`.
  - `revoke(grantId, by)` unchanged.
  - `listConnectedApps(userId)` → `ConnectedAppRow[]`: `{ grantId, isGrantor: boolean, app:{name, logoUrl, homepageUrl, isVerified, status}, accounts: {id, name, type, active, reason}[], account: {id, name} /* = accounts[0], phase 1 clients */, scopes, connectedBy:{id,name}, connectedAt, lastUsedAt }`. Includes grants where `userId` is the grantor, or the caller is owner/editor of ≥1 granted account. Grantor sees every granted account (states via the util); a co-owner sees only granted accounts where they are owner/editor. Rows with no visible account are dropped.
  - `disconnectAsUser(userId: string, grantId: string): Promise<void>` — grantor → `revoke(grantId,'user')`; otherwise `removeAccounts(grantId, <granted accounts where caller is owner/editor>)`; none → `NotFoundException`.
  - `removeAccountAsUser(userId: string, grantId: string, accountId: string): Promise<void>` — 404 unless the account is in the active grant AND (caller is grantor OR caller is owner/editor of that account).
- Routes: `DELETE /api/v1/connected-apps/:grantId` → `disconnectAsUser` (204); new `DELETE /api/v1/connected-apps/:grantId/accounts/:accountId` → `removeAccountAsUser` (204).
- Cron (`oauth-token-cleanup.cron.ts`): also revokes active grants with zero join rows (an account hard-deleted by FK cascade), via `paginateById`.

- [ ] **Step 1: Write failing tests**
  - util: `grantAccountStatus({role:'viewer',encryptionTier:2,…})` → `{active:false, reason:'role'}`; `{role:'owner', encryptionTier:2}` → `'encrypted'`; `{role:'editor', tripStatus:'archived'}` → `{active:true, reason:'archived'}`; `{role:null}` → `'role'`. `grantAccountAccess` tier 1 + `expenses:write` → `'read'`; tier 0 without `expenses:write` → `'read'`; tier 0 with it → `'read_write'`; archived → `'read'`. `dropAccountFromGrants`: grant with [A,B] minus A keeps B, not revoked; grant with [A] only → revoked, tokens deleted.
  - grants service: `replaceActive` new grant with [A,B] → `isNew:true, addedAccountIds:['A','B']`; second call with [B,C] → `isNew:false`, join rows exactly {B,C}, `addedAccountIds:['C']`, scopes replaced; P2002 race → re-fetch path, `isNew:false`. `removeAccounts(g,['A'])` on [A,B] → `{revoked:false}`, tokens untouched; on [A] → `{revoked:true}`.
  - `connected-apps.spec.ts`: grantor U with grant [personal P, shared S]; co-owner V (owner of S) lists → one row, `isGrantor:false`, `accounts` = [S] only, and `JSON.stringify(rows)` does not contain P's name; U lists → `accounts` [P,S], `isGrantor:true`. V `DELETE /:grantId` → grant still active with [P]. U `DELETE /:grantId` → revoked. V `DELETE /:grantId/accounts/P` → 404. Viewer of S lists → `[]`. Grantor demoted to viewer in S: U still sees S with `active:false, reason:'role'`.
  - `accounts.service.spec`: `remove()` calls `dropAccountFromGrants` inside the same transaction as `isActive:false`.
  - cron spec: an active grant with zero join rows is revoked; a grant with one row is not.
- [ ] **Step 2: Run** `cd apps/api && npx jest oauth-grant-accounts oauth-grants connected-apps oauth-token-cleanup accounts.service` → FAIL.
- [ ] **Step 3: Implement.** `AccountsService.remove` wraps its `account.update` in `$transaction(async tx => …)` and calls `dropAccountFromGrants(tx, accountId)` — a plain function import, no `OAuthModule` dependency in `AccountsModule`.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `public-api: multi-account grants and per-account disconnect`

---

### Task 3: Authorize — preview marks connected accounts, approve takes `account_ids`, e-mail lists accounts

**Files:**
- Modify: `apps/api/src/modules/oauth/oauth-authorize.service.ts` (+ spec), `dto/authorize.dto.ts`
- Modify: `apps/api/src/modules/mail/mail.service.ts` (`sendAppConnectedEmail`), `mail/app-connected-email-i18n.ts` (9 languages), `mail/mail.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 `replaceActive`.
- Produces:
  - `AuthorizePreviewAccount` gains `connected: boolean` (account is in the caller's active grant for this client).
  - `AuthorizeApproveDto` gains `account_ids?: string[]` (`@IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({each:true}) @MaxLength(64,{each:true})`); `account_id` stays, documented as the phase 1 form. Resolution: `account_ids ?? (account_id ? [account_id] : [])`, de-duplicated; empty on `allow` → `400 invalid_request 'account_ids is required'`.
  - Every requested account is checked as today (member, owner/editor, `isActive`, tier < 2); **any** failure refuses the whole approve with the existing 403 body — no partial grant.
  - `MailService.sendAppConnectedEmail({ to, lang, appName, accountNames: string[], connectedByName, manageUrl })` — `accountName` replaced. Copy: `AppConnectedParams.accounts: string` (pre-joined with `Intl.ListFormat(lang, {type:'conjunction'})`, each name quoted, raw text escaped by the caller as today) and `count: number`; `body` chooses singular/plural wording per language.
  - `notifyConnected` input: `{ clientDbId, appName, grantorId, grantor, added: { id, name, grantorRole }[] }`. Per added account, dedupe key unchanged (`oauth:mail:connected:<client>:<account>`, 24 h, Redis outage → send). Grantor gets one e-mail listing every surviving added account. For each surviving account where the grantor is `editor`, each other `owner` of it is collected; each owner gets one e-mail listing only the accounts they own among those.

- [ ] **Step 1: Write failing tests**
  - preview: user with active grant on [A] for this client → A `connected:true`, B `connected:false`; another client's grant does not mark anything.
  - approve: `account_ids:['A','B']` → `replaceActive(client, user, ['A','B'], scopes)`; `account_ids:['A','A']` → `['A']`; `account_id:'A'` alone → `['A']` (Review Focus 4); `account_ids:[]` → `invalid_request`; `['A', viewerAccount]` → 403 and `replaceActive` not called; `['A', tier2Account]` → 403 `account_encrypted`.
  - e-mail: new grant [P (owner), S (editor; owner O)] → grantor mail `accountNames:['P','S']`, O's mail `accountNames:['S']` (never `'P'`); re-consent [P,S] → [P,S,T] with dedupe free for T only → grantor mail `['T']`; re-consent with nothing added → no mail; dedupe key already taken for P on a new grant [P,S] → grantor mail `['S']`.
  - `mail.service.spec`: `accountNames:['A&B','C']` in `en` → HTML contains `A&amp;B` and `C`; one name uses the singular body; unknown `lang` falls back to English.
- [ ] **Step 2: Run** `cd apps/api && npx jest oauth-authorize mail.service` → FAIL.
- [ ] **Step 3: Implement** (all nine languages of `app-connected-email-i18n.ts` get singular and plural bodies).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: consent approves several accounts`

---

### Task 4: Token endpoint and bearer guard — `account_ids`, addressing, per-account checks

**Files:**
- Modify: `apps/api/src/modules/oauth/oauth-token.service.ts` (+ spec), `oauth-token.controller.spec.ts`, `dto/oauth-token.doc.ts`
- Modify: `apps/api/src/modules/public-api/guards/public-api-auth.guard.ts` (+ spec), `public-api.types.ts`, `public-api-error.ts`
- Create: `apps/api/src/modules/public-api/decorators/connection-level.decorator.ts`

**Interfaces:**
- Consumes: Task 2 util (`loadGrantAccountStates`, `grantAccountStatus`, `GRANTING_ROLES`).
- Produces:
  - `TokenResponse.account_ids: string[]` (granted accounts, Task 2 order) and `account_id?: string` present only when `account_ids.length === 1`.
  - `assertGrantUsable(grant, client)`: grant exists, same client, not revoked, and `loadGrantAccountStates(...).some(s => grantAccountStatus(s).active)`; otherwise `invalid_grant` `'no account of this connection is usable any more'`.
  - `PUBLIC_API_ERROR_CODES` gains `'account_required'`, `'account_not_granted'` (appended, never reordered).
  - `export const ACCOUNT_HEADER = 'x-account-id'`; `@ConnectionLevel()` (metadata key `CONNECTION_LEVEL_KEY`) — the route skips account resolution.
  - `PublicApiOAuthContext` gains `grantAccountIds: string[]`; `encryptionTier` becomes the addressed account's tier (0 on a `@ConnectionLevel()` route, which sets no `req.accountId`).
  - Guard order: flag → bearer → token → grant/client active → user active → grant has ≥1 granted account (else `401 invalid_token`) → scopes → rate limit (unchanged keys, one bucket per grant) → [skip rest if `@ConnectionLevel()`] → address → grantor membership role ∈ owner/editor (`403 grant_inactive`) → tier ≥ 2 (`403 account_encrypted`) → set `req.accountId/accountRole/monthAnchorDay/oauth` → `lastUsedAt` stamp.
  - Address rule: read `req.headers['x-account-id']`; array → `400 validation_failed` `details.fields['X-Account-Id']`; trim + lower-case; empty = absent. Absent: 1 granted → that one; > 1 → `400 account_required` "This connection covers several accounts. Send the X-Account-Id header with one of the ids from GET /public/v1/accounts.". Present and not in `grantAccountIds` → `403 account_not_granted` (same answer for a nonexistent id).
  - The token row query selects `grant.accounts` (`where: { account: { isActive: true } }`, `select: { accountId, account: { encryptionTier, monthAnchorDay } }`) — one query; the membership lookup stays a second query on the addressed account.

- [ ] **Step 1: Write failing tests**
  - token: code exchange for a grant [A,B] → `account_ids:['A','B']`, no `account_id` key; grant [A] → `account_ids:['A'], account_id:'A'`; refresh with grantor viewer in A only → 200; viewer in A and B → `invalid_grant`; grant [A] where A became tier 2 → `invalid_grant`. Controller spec asserts the JSON keys.
  - guard: grant [A,B] — no header → `400 account_required`; `X-Account-Id: B` → `req.accountId === 'B'`; `' B-UPPER '` normalised → B (Review Focus 1); empty header → `account_required`; repeated header → `validation_failed`; unknown id → `403 account_not_granted`; grantor viewer in B → B `grant_inactive`, A passes; B tier 2 → B `account_encrypted`, A passes. Grant [A] — no header → A (phase 1); `X-Account-Id: A` → A; `X-Account-Id: B` → `account_not_granted`. `@ConnectionLevel()` route on grant [A,B] without header → passes, `req.accountId` undefined, `req.oauth.grantAccountIds === ['A','B']`. Rate limit called with the same `grantId` whichever account is addressed. Grant with zero accounts → `401 invalid_token`. Existing phase 1 cases (demoted grantor, insufficient scope, 429) still pass.
- [ ] **Step 2: Run** `cd apps/api && npx jest oauth-token public-api-auth` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `cd apps/api && npm run typecheck` → clean (first green typecheck since Task 1).
- [ ] **Step 5: Commit** `public-api: account addressing in the bearer guard and token response`

---

### Task 5: `GET /public/v1/accounts`, `/account` addressing, idempotency per account

**Files:**
- Create: `apps/api/src/modules/public-api/controllers/public-accounts.controller.ts`
- Modify: `apps/api/src/modules/public-api/dto/public-expense.dto.ts` (`PublicConnectedAccount`, `PublicConnectedAccountList`), `public-api.module.ts`, `controllers/public-read.controllers.spec.ts`, `public-expense-write.adapter.spec.ts`

**Interfaces:**
- Consumes: Task 4 `@ConnectionLevel()`, `req.oauth.grantAccountIds`; Task 2 util.
- Produces:
  - `GET /public/v1/accounts` — `@TokenOnly() @ConnectionLevel()`, `operationId: 'listAccounts'`, `@ApiTags('Account')` → `{ data: PublicConnectedAccount[] }`, `PublicConnectedAccount = { id, name, type: 'personal'|'business'|'shared'|'trip'|'investment', base_currency, access: 'read'|'read_write', active: boolean, reason: 'role'|'encrypted'|'archived'|null }`, built from `loadGrantAccountStates` + `grantAccountStatus` + `grantAccountAccess(state, req.oauth.scopes)`.
  - `/public/v1/account` unchanged in code; it now describes the addressed account (guard).
  - Idempotency lookup already filters `accountId` (`findOwnByIdempotencyKey`), so no code change — pinned by a test.

- [ ] **Step 1: Write failing tests**
  - read controllers: `/accounts` on grant [A personal tier 0, B business tier 1, S shared where grantor is viewer] with scopes incl. `expenses:write` → `[{id:A, type:'personal', access:'read_write', active:true, reason:null}, {id:B, access:'read', active:true, reason:null}, {id:S, access:'read', active:false, reason:'role'}]`; never contains `role`, `user` or e-mail keys. Archived trip T → `{active:true, access:'read', reason:'archived'}`. `/account` with `req.accountId = B` returns B.
  - adapter: same `Idempotency-Key` in A then in B → both `isNew:true`, two distinct ids; replay in A returns A's (Review Focus 5).
- [ ] **Step 2: Run** `npx jest public-read.controllers public-expense-write` → FAIL.
- [ ] **Step 3: Implement**; declare the controller in `PublicApiModule`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: list the connection's accounts`

---

### Task 6: Consent screen — pick several accounts (phone + desktop web)

**Files:**
- Modify: `apps/mobile/src/services/oauth.api.ts`, `src/features/oauth-consent/useConsent.ts`, `src/features/oauth-consent/consentDisplay.ts`, `src/components/oauth-consent/ConsentBody.tsx`
- Modify: 9 locale files under `apps/mobile/src/i18n/locales/` (`oauthConsent.*`) — use the `i18n-add-strings` skill
- Test: `src/features/oauth-consent/__tests__/useConsent.test.ts`, `__tests__/consentDisplay.test.ts`

**Interfaces:**
- Consumes: Task 3 preview `connected`, approve `account_ids`.
- Produces:
  - `OAuthConsentAccount.connected: boolean`; `OAuthApproveBody.account_ids?: string[]` (`account_id` removed from the client type).
  - `initialAccountSelection(accounts: OAuthConsentAccount[]): string[]` in `consentDisplay.ts` — selectable∧connected ids if any account is connected; else the one id when exactly one account is selectable; else `[]`.
  - `ConsentState`: `selectedAccountId`/`select` replaced by `selectedAccountIds: string[]`, `toggle(id: string): void` (ignores non-selectable), `isReconsent: boolean` (any account `connected`). `allow()` no-ops on an empty selection and posts `account_ids` in the order of `accounts`.
  - `ConsentBody`: rows become checkboxes (`checkbox` / `square-outline` icons, `accessibilityRole="checkbox"`), name + type + role line kept, tier-1 read-only badge kept; Allow disabled while `selectedAccountIds` is empty; `isReconsent` shows a note above the list. Shared by `ConsentPhone` and `ConsentDesktop`, so both layouts change together.
  - i18n: `oauthConsent.accountTitle` copy → plural ("Accounts to connect"), new `oauthConsent.accountsHint` ("Select at least one account"), `oauthConsent.reconsentNote` ("Accounts already connected are ticked. Untick one to cut the app off from it.") — 9 locales.

- [ ] **Step 1: Write failing tests** — `initialAccountSelection`: two selectable none connected → `[]`; exactly one selectable (plus a viewer row) → `[thatId]`; connected [A] among selectable A,B → `['A']`; connected but now viewer → excluded. `useConsent`: `toggle` adds/removes; toggling a non-selectable id does nothing; `allow` with `[]` does not call `oauthApi.approve`; with A,B ticked posts `{account_ids:['A','B'], decision:'allow'}` and no `account_id`; `deny` posts no `account_ids`; `isReconsent` true when any `connected`.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest oauth-consent` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run typecheck` → clean; manual: `npm run dev:web`, open `/authorize?…` for a dev app with two eligible accounts at 390 px and at 1280 px — nothing ticked, Allow disabled, tick two, allow, redirect carries a code; re-open → both pre-ticked with the note.
- [ ] **Step 5: Commit** `public-api: consent screen picks several accounts`

---

### Task 7: Connected apps settings — accounts per app, remove one account

**Files:**
- Modify: `apps/mobile/src/services/developerApps.api.ts` (`ConnectedApp`, `removeConnectedAppAccount`), `src/services/api.ts` (expose it), `src/stores/connectedAppsStore.ts`, `src/components/settings/connected-apps/ConnectedAppsSettings.tsx`
- Modify: 9 locale files (`connectedApps.*`)
- Test: `src/stores/__tests__/connectedAppsStore.test.ts`

**Interfaces:**
- Consumes: Task 2 list shape and routes.
- Produces:
  - `ConnectedApp`: `account` removed from the type; `isGrantor: boolean`; `accounts: { id: string; name: string; type: AccountType; active: boolean; reason: 'role'|'encrypted'|'archived'|null }[]`.
  - `developerAppsApi.removeConnectedAppAccount(grantId: string, accountId: string)` → `DELETE /connected-apps/:grantId/accounts/:accountId`.
  - `connectedAppsStore.removeAccount(grantId: string, accountId: string): Promise<void>` — drops the account from the item, drops the item when none remain; 404 treated as already gone (same rule as `disconnect`). `disconnect` unchanged.
  - UI: one card per app (no longer grouped by account): app header, "Connected by <name>" when `!isGrantor`, an account list (name, localized type, an "unavailable" note for `active:false` from `reason`), a remove control per account shown only when the card has more than one account, and Disconnect. Confirm copy differs: grantor → disconnects everywhere; co-owner → "removes your accounts only". Same component serves the desktop settings pane (≥1024).
  - i18n (9 locales): `connectedApps.accountsLabel`, `connectedApps.removeAccount`, `connectedApps.removeAccountConfirmTitle`, `connectedApps.removeAccountConfirmMessage`, `connectedApps.disconnectSharedConfirmMessage`, `connectedApps.accountUnavailable.role|encrypted`.

- [ ] **Step 1: Write failing tests** — `removeAccount('g',A)` on `accounts [A,B]` → item keeps `[B]`; on `[A]` → item removed; server 404 → removed locally, no throw; 500 → throws, item unchanged.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest connectedAppsStore` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; typecheck clean; manual on phone width and ≥1024 (settings two-pane): remove one of two accounts, then Disconnect as co-owner leaves the grantor's other account connected (check with the grantor's login).
- [ ] **Step 5: Commit** `public-api: connected apps show and remove single accounts`

---

### Task 8: Swagger and guides in English, Polish, Russian

**Files:**
- Modify: `apps/api/src/modules/public-api/docs/public-api-docs.decorators.ts` (`ApiAccountHeader()`), `docs/openapi.ts` (shared-param text slot), `docs/texts.{en,pl,ru}.ts`, `docs/guide.{en,pl,ru}.md`, `docs/openapi.spec.ts`, `docs/texts.spec.ts`
- Modify: every account-scoped public controller (`public-account`, `public-categories`, `public-expenses`) — class-level `@ApiAccountHeader()`

**Interfaces — Produces:**
- `ApiAccountHeader()` = `@ApiHeader({ name: 'X-Account-Id', required: false, schema: { type: 'string', format: 'uuid' } })`.
- Text slot walker: a parameter named in `SHARED_PARAM_KEYS = ['X-Account-Id']` takes its description from `param.X-Account-Id` (one key per language), not `op.<id>.param.X-Account-Id`.
- New texts: `op.listAccounts.summary|description|response.200`, `param.X-Account-Id`, error lines for `account_required` and `account_not_granted` in the errors list, field docs for `PublicConnectedAccount`, token response `account_ids` / `account_id` (compat note).
- Guides: new section `## 5. Several accounts in one connection` after "4. Call the API" (later sections renumbered 6–12 in all three languages): `account_ids` in the token response, `GET /accounts` with `type` for company vs private, `X-Account-Id` rule (optional with one granted account, required with more, counted on granted not usable accounts), the three errors, one call per account (no merged endpoint), re-consent replaces the set, refresh `invalid_grant` when nothing is usable, idempotency keys per account. The errors section lists the two new codes.

- [ ] **Step 1: Write failing tests** — openapi: `listAccounts` is in the operation list with `security` and no scopes, and **no** `X-Account-Id` param; every other `/public/v1` operation has a non-required `X-Account-Id` header param; error enum contains `account_required` and `account_not_granted` (existing enum test). texts: key sets still identical; pl/ru are translations; guides keep identical section structure and code samples.
- [ ] **Step 2: Run** `cd apps/api && npx jest docs/` → FAIL.
- [ ] **Step 3: Implement**, Polish and Russian written natively.
- [ ] **Step 4: Run** → PASS; with `PUBLIC_API_ENABLED=true` open `http://localhost:3000/public/docs/pl` → "Lista połączonych kont" (or the chosen Polish summary) present, header shown on expense operations.
- [ ] **Step 5: Commit** `public-api: document multi-account connections`

---

### Task 9: Two-account end-to-end flow

**Files:**
- Modify: `apps/api/test/public-api.e2e-spec.ts` (new `(j)`; helpers `approveMany(user, client, accountIds, challenge)` and `connectMany`, `api(...)` gains an optional `accountId` that sets `X-Account-Id`)

**Interfaces — Consumes:** everything above. Phase 1 cases `(a)`–`(i)` keep using `account_id` and no header — they are the compat test for Review Focus 4 and must pass unchanged.

- [ ] **Step 1: Write `(j) one connection, two accounts`** — setup: owner's A (personal) and B; a second user V owning shared account S with the owner added as editor.
  1. `connectMany(owner, app, [A, S])` → token `account_ids` = `[A, S]`, no `account_id`.
  2. `GET /accounts` → 2 rows, `type` `personal`/`shared`, both `active:true, access:'read_write'`.
  3. Seed one expense in A and one in S; `GET /expenses` with header A returns only A's id, with S only S's; without header → `400 account_required`; `GET /account` without header → `400`; header B → `403 account_not_granted`.
  4. `POST /expenses` with the same `Idempotency-Key` to A and to S → both `201`, different ids. Settle, then the changes-feed `next_cursor` from A used with header S never returns A's ids.
  5. Demote owner to viewer in S → header S `403 grant_inactive`, header A `200`; `/accounts` lists S `active:false, reason:'role'`; refresh → `200`.
  6. Restore editor. V `GET /api/v1/connected-apps` → one row, `accounts` = [S], body does not contain A's name; V `DELETE /api/v1/connected-apps/:grantId` → `204`; header S → `403 account_not_granted`; `GET /expenses` without header → `200` (one granted account left); old access token still valid.
  7. Re-consent preview → A `connected:true`; approve `[A, B]` → header B works with the existing access token; `/accounts` = [A, B].
  8. Owner `DELETE /connected-apps/:grantId/accounts/A`, then `…/accounts/B` → next call `401 invalid_token`; refresh → `invalid_grant`.
- [ ] **Step 2: Run** `cd apps/api && npm run test:e2e -- public-api` → PASS (fix code, not tests).
- [ ] **Step 3: Run** `npm run lint && npm run typecheck && npm run test` at the repo root → all green.
- [ ] **Step 4: Commit** `public-api: two-account end-to-end flow`

---

### Task 10: Wiki, user help, close-out

**Files:**
- Modify: `docs/wiki/features/public-api.md`, `user_docs/{en,de,es,fr,pl,ru,ua,be,nl}/45-connected-apps.md`, generated `apps/mobile/src/help/content.ts` (via script only)

- [ ] **Step 1: Wiki** — update Flow (steps 2, 4, 5: multi-select, `connected` pre-tick, replace-the-set, `account_ids`), Data model (`oauth_grant_accounts`, index `oauth_grants_active_client_user_key`, migration `20261102000000_public_api_multi_account`), Shared accounts (co-owner visibility, partial disconnect, e-mail per owner), Key concepts (`X-Account-Id` rule, `/accounts`). Invariants to add: header counts granted accounts; connection-level vs account-level checks; a removed account is cut off on the next request with no token change; an empty grant is revoked (including a soft-deleted account via `dropAccountFromGrants`); co-owners are never shown the grantor's other accounts; idempotency keys and cursors are per account. Remove "multi-account grants" from Known gaps; add a History line. Run `python scripts/wiki-lint.py` → clean.
- [ ] **Step 2: Help** — with the `add-help-section` skill (existing section: no registration), rewrite "What connecting an app means", "Seeing and disconnecting apps" and "Shared accounts" in all 9 locales: ticking several accounts, the pre-ticked re-consent, removing one account, what a co-owner sees and removes. `npm run generate:help`, then rebuild the public help site per the skill (`LANDING_BASE= ROBOTS="index,follow,max-image-preview:large"`).
- [ ] **Step 3:** Run the `aba-security` agent on the branch diff (focus: account addressing, co-owner visibility, migration); fix every finding rated medium or higher; re-run Task 9 Steps 2–3.
- [ ] **Step 4:** `finish-aba-task` skill — ABA-{N} issue, `docs/wiki/log.md` line, squash every step commit into one `ABA-{N} Public API multi-account connections` commit. Do not push; ask the owner.
