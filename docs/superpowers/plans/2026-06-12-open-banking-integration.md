# Open Banking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Background reading:** `docs/research/open-banking-overview.md` — what Open Banking is, how AIS consent flows work, country coverage, aggregator landscape.

**Goal:** Let users connect their bank accounts once and have transactions sync automatically every day — replacing manual CSV/PDF statement uploads with live Open Banking (AIS) data.

**Architecture:** A new `modules/open-banking/` NestJS module wraps an aggregator behind a provider-agnostic `OpenBankingProvider` interface (Enable Banking adapter first). Consent flow: API issues an `authUrl` → user authenticates at their bank → bank redirects to an API callback page → API stores the session (encrypted at rest) and the connected accounts. A daily cron pulls transactions per connected account and writes them through the **existing import pipeline** (`externalRef` dedup + `ImportBatch` + anomaly `checkExpenseBatch`), so rollback, dedup against CSV imports, and anomaly alerts all work unchanged. Mobile adds a "Connect a bank" flow to the existing import hub.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), Redis (state/nonce), Enable Banking REST API (JWT RS256 auth), AES-256-GCM at-rest encryption (reuse Slack `token-crypto` pattern), Expo `expo-web-browser` for the consent redirect.

---

## Phase 0 — Decisions & compliance (no code; blocks Phase 1)

These are business decisions. Each has a recommended default so the plan is executable, but confirm them before Phase 1 lands in production.

- [ ] **D1. Aggregator choice.** Recommended: **Enable Banking** (self-serve sandbox, EU/EEA coverage incl. all major Polish banks, volume pricing per connected account, suits a small product). Fallbacks: **Salt Edge** (delegated "under our licence" agent model, sales-gated pricing), **Kontomatik** (deepest PL coverage, CEE only). **GoCardless Bank Account Data is closed to new customers since autumn 2025 — do not plan around it.** Action: register a sandbox app at enablebanking.com, request production quota + pricing from sales, compare with Salt Edge quote.
- [ ] **D2. Licensing model.** We do not have an AISP registration (KNF, 6–12 months) and should not get one for v1. Confirm with the chosen aggregator which model applies: (a) we operate as their **agent/under their licence** (Salt Edge delegated AIS), or (b) Enable Banking's model where the TPP-of-record is Enable Banking and we are the end-client application. Get this **in writing** before production launch.
- [ ] **D3. Tier gating.** Recommended: connections are a paid feature — `free: 0` (keeps CSV import as the free path), `pro: 2`, `business: 10` connections per account. Constant `OB_CONNECTION_LIMITS` in the service, same pattern as `MEMBER_LIMITS` in `subscriptions.service.ts:30`.
- [ ] **D4. GDPR.** Transactions data we already store; new is the *source*. Required: DPIA addendum, privacy-policy update (name the aggregator as processor/recipient), data-minimisation default (sync transactions + balances only, no holder-identity endpoints). Owner: Mihail.
- [ ] **D5. Launch market.** v1 = **Poland only** (`country=PL` institution list), since the product is PL-focused. The provider interface takes a country code, so adding DE/ES/FR later is config, not code.

**Phase 0 exit criteria:** sandbox credentials in `.env`, signed pricing/licensing answer from the aggregator, tier limits agreed.

---

## File structure (locked in for Phases 1–3)

```
apps/api/src/modules/open-banking/
  open-banking.module.ts
  open-banking.controller.ts        # consent + connection CRUD endpoints
  open-banking.service.ts           # connection lifecycle, tier limits
  open-banking-sync.service.ts      # tx fetch → import pipeline
  open-banking-sync.cron.ts         # daily sync
  dto/index.ts
  providers/provider.interface.ts   # OpenBankingProvider + Ob* types
  providers/enable-banking.provider.ts
  helpers/callback-pages.ts         # HTML "return to app" page (like slack oauth-pages.ts)
apps/api/src/common/crypto/token-crypto.ts   # extracted from modules/slack/helpers/token-crypto.ts
apps/api/prisma/migrations/<ts>_add_bank_connections/
packages/shared-types/src/entities/index.ts  # BankConnection, BankConnectionAccount
packages/shared-types/src/dto/index.ts       # Ob DTOs
apps/mobile/src/services/open-banking.api.ts # 18th domain api file
apps/mobile/src/stores/bankConnectionStore.ts# 27th store (in-memory, no SQLite)
apps/mobile/app/settings/import/connect.tsx  # institution picker + consent launch
apps/mobile/app/settings/import/connections.tsx # manage/sync/disconnect
apps/mobile/src/i18n/locales/*.ts            # bankConnect.* keys, all 9 locales
user_docs/<lang>/28-bank-connections.md      # help section, 9 languages
```

---

## Phase 1 — Backend MVP (consent + manual sync)

### Task 1: Shared types

**Files:**
- Modify: `packages/shared-types/src/entities/index.ts`
- Modify: `packages/shared-types/src/dto/index.ts`

- [ ] **Step 1: Add entities**

```typescript
// entities/index.ts
export type BankConnectionStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'error';

export interface BankConnection {
  id: string;
  accountId: string;
  userId: string;
  provider: string;            // 'enablebanking'
  institutionId: string;
  institutionName: string;
  status: BankConnectionStatus;
  consentExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  accounts: BankConnectionAccount[];
}

export interface BankConnectionAccount {
  id: string;
  connectionId: string;
  providerAccountId: string;
  iban: string | null;
  name: string | null;
  currencyCode: string;
  isEnabled: boolean;
}
```

- [ ] **Step 2: Add DTOs**

```typescript
// dto/index.ts
export interface ObInstitutionResponse {
  id: string;
  name: string;
  country: string;
  logoUrl: string | null;
}

export interface StartBankConnectionRequest {
  institutionId: string;
  institutionName: string;
}

export interface StartBankConnectionResponse {
  connectionId: string;
  authUrl: string;
}

export interface BankConnectionSyncResponse {
  createdExpenses: number;
  createdIncomes: number;
  skippedDuplicates: number;
  batchId: string | null;       // null when nothing new
}
```

- [ ] **Step 3: Build + commit**

Run: `npm run build -- --filter=@budget/shared-types` → PASS, then
`git add packages/shared-types && git commit -m "feat(open-banking): shared types for bank connections"`

### Task 2: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add models** (follow existing `@map` snake_case convention)

```prisma
model BankConnection {
  id               String    @id @default(uuid())
  accountId        String    @map("account_id")
  userId           String    @map("user_id")
  provider         String                                  // 'enablebanking'
  institutionId    String    @map("institution_id")
  institutionName  String    @map("institution_name")
  status           String    @default("pending")           // pending|active|expired|revoked|error
  providerRef      String    @map("provider_ref")          // provider session/requisition id
  sessionEnc       String?   @map("session_enc")           // AES-256-GCM encrypted provider session
  consentExpiresAt DateTime? @map("consent_expires_at")
  lastSyncAt       DateTime? @map("last_sync_at")
  lastError        String?   @map("last_error")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  account          Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  accounts         BankConnectionAccount[]

  @@unique([provider, providerRef])
  @@index([accountId])
  @@index([status, consentExpiresAt])
  @@map("bank_connections")
}

model BankConnectionAccount {
  id                String         @id @default(uuid())
  connectionId      String         @map("connection_id")
  providerAccountId String         @map("provider_account_id")
  iban              String?
  name              String?
  currencyCode      String         @map("currency_code")
  isEnabled         Boolean        @default(true) @map("is_enabled")
  createdAt         DateTime       @default(now()) @map("created_at")
  connection        BankConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([connectionId, providerAccountId])
  @@map("bank_connection_accounts")
}
```

Also add `bankConnections BankConnection[]` to the `Account` model's relation list.

- [ ] **Step 2: Migrate + generate**

Run from `apps/api/`: `npx prisma migrate dev --name add_bank_connections && npx prisma generate` → migration created, client regenerated.

- [ ] **Step 3: Commit**

`git add apps/api/prisma && git commit -m "feat(open-banking): bank_connections schema"`

### Task 3: Extract token-crypto to common

**Files:**
- Create: `apps/api/src/common/crypto/token-crypto.ts` (move content from `apps/api/src/modules/slack/helpers/token-crypto.ts`)
- Modify: `apps/api/src/modules/slack/helpers/token-crypto.ts` → re-export from common (keep import sites stable)
- Test: `apps/api/src/common/crypto/token-crypto.spec.ts`

- [ ] **Step 1: Move the AES-256-GCM helper.** Copy `encryptToken`/`decryptToken` verbatim into `common/crypto/token-crypto.ts`, but make the env-var name a parameter: `encryptToken(plain: string, keyHex: string)` / `decryptToken(payload: string, keyHex: string)`. Update the slack helper to call through with `process.env.SLACK_TOKEN_ENC_KEY`.
- [ ] **Step 2: Round-trip test**

```typescript
import { encryptToken, decryptToken } from './token-crypto';

const KEY = 'a'.repeat(64); // 32-byte hex

describe('token-crypto', () => {
  it('round-trips', () => {
    const enc = encryptToken('secret-session', KEY);
    expect(enc).not.toContain('secret-session');
    expect(decryptToken(enc, KEY)).toBe('secret-session');
  });
  it('fails on tampered payload', () => {
    const enc = encryptToken('x', KEY);
    expect(() => decryptToken(enc.slice(0, -2) + 'zz', KEY)).toThrow();
  });
});
```

- [ ] **Step 3: Run tests** — `npx jest token-crypto` from `apps/api/` → PASS (incl. existing slack tests).
- [ ] **Step 4: Commit** — `git commit -m "refactor: extract AES-256-GCM token-crypto to common/crypto"`

### Task 4: Provider interface + Enable Banking adapter

**Files:**
- Create: `apps/api/src/modules/open-banking/providers/provider.interface.ts`
- Create: `apps/api/src/modules/open-banking/providers/enable-banking.provider.ts`
- Test: `apps/api/src/modules/open-banking/providers/enable-banking.provider.spec.ts`

- [ ] **Step 1: Define the provider contract**

```typescript
// provider.interface.ts
export interface ObInstitution {
  id: string;
  name: string;
  country: string;
  logoUrl: string | null;
}

export interface ObAccount {
  providerAccountId: string;
  iban: string | null;
  name: string | null;
  currency: string;
}

export interface ObTransaction {
  providerTransactionId: string;  // stable id from the bank — dedup key
  bookingDate: string;            // ISO yyyy-mm-dd
  amount: number;                 // signed; negative = debit/expense
  currency: string;
  description: string;
  merchant: string | null;        // creditor/debtor name when present
}

export interface ObConsentResult {
  authUrl: string;
  providerRef: string;            // id to correlate the callback
}

export interface ObSession {
  session: string;                // opaque provider session (stored encrypted)
  accounts: ObAccount[];
  consentExpiresAt: string;       // ISO datetime
}

export interface OpenBankingProvider {
  readonly id: string;
  listInstitutions(country: string): Promise<ObInstitution[]>;
  startConsent(institutionId: string, redirectUrl: string, state: string): Promise<ObConsentResult>;
  completeConsent(callbackCode: string): Promise<ObSession>;
  fetchTransactions(session: string, providerAccountId: string, fromDate: string): Promise<ObTransaction[]>;
  revoke(session: string): Promise<void>;
}
```

- [ ] **Step 2: Implement `EnableBankingProvider`.** Enable Banking auth = self-issued **JWT RS256** (`kid` = application id, signed with the app private key, `aud: api.enablebanking.com`, short `exp`), sent as `Authorization: Bearer`. Endpoints (verify against current docs at implementation time — https://enablebanking.com/docs/api/reference/): `GET /aspsps?country=PL` (institutions), `POST /auth` (start authorization → returns `url`), `POST /sessions` (exchange callback `code` → `session_id` + `accounts[] (uid, account_id.iban, currency)` + `access.valid_until`), `GET /accounts/{uid}/transactions?date_from=` (paginated via `continuation_key`), `DELETE /sessions/{id}` (revoke). Skeleton:

```typescript
@Injectable()
export class EnableBankingProvider implements OpenBankingProvider {
  readonly id = 'enablebanking';
  private readonly base = 'https://api.enablebanking.com';

  private jwt(): string {
    // RS256, kid = ENABLE_BANKING_APP_ID, key = ENABLE_BANKING_PRIVATE_KEY (PEM, \n-escaped)
    return signJwt({ iss: 'enablebanking.com', aud: 'api.enablebanking.com' }, ...);
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.jwt()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`enablebanking ${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async listInstitutions(country: string): Promise<ObInstitution[]> { /* GET /aspsps?country= */ }
  async startConsent(institutionId, redirectUrl, state): Promise<ObConsentResult> { /* POST /auth */ }
  async completeConsent(code: string): Promise<ObSession> { /* POST /sessions */ }
  async fetchTransactions(session, providerAccountId, fromDate): Promise<ObTransaction[]> {
    // GET /accounts/{uid}/transactions?date_from= ; loop continuation_key; map:
    // amount = transaction_amount.amount with sign from credit_debit_indicator (DBIT → negative)
    // providerTransactionId = entry_reference ?? sha256 fallback of (date|amount|description)
  }
  async revoke(session: string): Promise<void> { /* DELETE /sessions/{id} */ }
}
```

- [ ] **Step 3: Unit-test the mapping only** (no live HTTP — stub `req`). Test that a raw Enable Banking transaction payload maps to `ObTransaction` with correct sign, date, merchant fallback, and that a missing `entry_reference` falls back to the deterministic hash.
- [ ] **Step 4: Run tests** — `npx jest enable-banking.provider` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(open-banking): provider interface + Enable Banking adapter"`

### Task 5: Connection service + controller (consent lifecycle)

**Files:**
- Create: `open-banking.service.ts`, `open-banking.controller.ts`, `dto/index.ts`, `helpers/callback-pages.ts`, `open-banking.module.ts`
- Modify: `apps/api/src/app.module.ts` (register module), `apps/api/src/main.ts` (exclude `open-banking/callback` from `/api/v1` prefix, same list as slack/whatsapp)
- Test: `open-banking.service.spec.ts`

Service methods (signature convention `(accountId, userId, dto)`; all queries filter by `accountId`):

- [ ] **Step 1: `listInstitutions(country)`** — delegate to provider, cache in Redis `ob:institutions:{country}` TTL 24h via `CacheService`.
- [ ] **Step 2: `startConnection(accountId, userId, dto)`** — enforce `OB_CONNECTION_LIMITS` by tier (count `status: 'active'` connections; resolve tier the same way `subscriptions.service.ts` does); create `BankConnection` row `status:'pending'`; `state` = connection id signed into a Redis nonce `ob:state:{state}` TTL 900s (CSRF, same pattern as `slack:oauth_state:`); call `provider.startConsent(institutionId, redirectUrl, state)` with `redirectUrl = {API_ORIGIN}/open-banking/callback`; store `providerRef`; return `{ connectionId, authUrl }`.
- [ ] **Step 3: `handleCallback(query)`** — public GET (no auth — browser redirect): validate+consume the `state` nonce → load connection by id → `provider.completeConsent(code)` → encrypt `session` with `encryptToken(session, OB_TOKEN_ENC_KEY)` → upsert `BankConnectionAccount` rows → set `status:'active'`, `consentExpiresAt` → return HTML page from `callback-pages.ts` ("Bank connected — return to the app", deep link `aibudget://ob-callback?connectionId=`, HTML-escape everything user-influenced, same pattern as slack `oauth-pages.ts`). On any error: mark connection `status:'error'`, `lastError`, render failure page.
- [ ] **Step 4: `list(accountId)` / `remove(accountId, userId, id)`** — list with accounts included; remove = `provider.revoke(decrypted session)` best-effort + set `status:'revoked'` (keep the row for history; transactions stay).
- [ ] **Step 5: Controller routes**

```typescript
@Controller('open-banking')
export class OpenBankingController {
  // JwtAuthGuard + AccountContextGuard on everything except callback
  @Get('institutions')                    // ?country=PL
  @Post('connections') @UseGuards(new ViewerBlockGuard())
  @Get('connections')
  @Post('connections/:id/sync') @UseGuards(new ViewerBlockGuard())   // Task 6
  @Delete('connections/:id') @UseGuards(new ViewerBlockGuard())
  @Public() @Get('callback')              // excluded from /api/v1 prefix in main.ts
}
```

- [ ] **Step 6: Unit tests** — mock provider + Prisma: (a) tier limit throws `ForbiddenException` for free tier; (b) callback with unknown/expired state → failure page, no DB write; (c) happy path persists encrypted session and accounts (assert stored value ≠ plaintext session).
- [ ] **Step 7: Run** — `npx jest open-banking.service` → PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat(open-banking): consent flow endpoints + connection lifecycle"`

### Task 6: Sync service (transactions → import pipeline)

**Files:**
- Create: `open-banking-sync.service.ts`
- Modify: `open-banking.module.ts` (import `ImportBatchesModule`, `AnomalyModule` deps as the import modules do)
- Test: `open-banking-sync.service.spec.ts`

- [ ] **Step 1: `syncConnection(connectionId)` flow:**
  1. Load connection (`status:'active'`) + enabled accounts; decrypt session.
  2. `fromDate` = `lastSyncAt - 3 days` (overlap window — banks back-date bookings) or 90 days ago on first sync.
  3. `provider.fetchTransactions()` per enabled account.
  4. Map to rows: `amount < 0` → Expense, `> 0` → Income; `externalRef = 'ob:enablebanking:{providerTransactionId}'`; category suggestion via `MERCHANT_CATEGORY_HINTS` (reuse `import-bank/merchants/merchants-pl.ts` matcher); `source: 'import'`.
  5. Filter rows whose `externalRef` already exists for the account (same query as `import-bank.service.ts:491` dedup) — the overlap window makes re-seen transactions a no-op.
  6. Write in one `$transaction` with an `ImportBatch` (`source: 'ob:enablebanking'`), stamp `importBatchId` — identical shape to the wise/bank commit.
  7. Fire-and-forget `AnomalyService.checkExpenseBatch` (duplicate detector NOT skipped here — unlike CSV preview there is no content-dedup step, and a card payment + the same purchase entered manually SHOULD flag).
  8. Update `lastSyncAt`; on provider 401/403 → set `status:'expired'` (consent ran out), other errors → `lastError`.
- [ ] **Step 2: Wire `POST /open-banking/connections/:id/sync`** to call it (account-scoped lookup first).
- [ ] **Step 3: Unit tests** — mocked provider returning: (a) mixed debit/credit rows → correct Expense/Income split + batch rowCount; (b) previously-seen `providerTransactionId` → skippedDuplicates, no insert; (c) provider 403 → connection flips to `expired`, no throw to caller.
- [ ] **Step 4: Run** — `npx jest open-banking-sync` → PASS.
- [ ] **Step 5: Sandbox end-to-end check** — with Enable Banking sandbox creds in `.env`: connect the mock ASPSP via the real consent flow (browser), run sync, verify rows appear with `externalRef` prefix `ob:` and an `import_batches` row exists, and that re-running sync creates nothing.
- [ ] **Step 6: Commit** — `git commit -m "feat(open-banking): transaction sync through import pipeline"`

### Task 7: Env + docs plumbing

- [ ] Add to `.env.example` (own bordered section, matching style): `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `OB_TOKEN_ENC_KEY` (32-byte hex, `openssl rand -hex 32`), `OB_REDIRECT_BASE_URL` (prod: `https://api.ai-budget.pl`). Module is a **no-op when unset** (same convention as the Slack bot).
- [ ] Commit — `git commit -m "chore(open-banking): env vars + example"`

**Phase 1 exit criteria:** sandbox bank connects via real browser flow; manual sync endpoint imports transactions exactly once; `npm run typecheck && npm run test` green.

---

## Phase 2 — Mobile (connect, manage, sync)

### Task 8: API client + store

**Files:**
- Create: `apps/mobile/src/services/open-banking.api.ts` (register in the `api.ts` barrel like the other 17 domain files)
- Create: `apps/mobile/src/stores/bankConnectionStore.ts`

- [ ] **Step 1: API methods** — `getObInstitutions(country)`, `startBankConnection(dto)`, `getBankConnections()`, `syncBankConnection(id)`, `deleteBankConnection(id)`. Plain `this.request()` calls; `X-Account-Id` auto-injected by `HttpClient`.
- [ ] **Step 2: Store** — in-memory only (no SQLite; connections are server state, like `alertStore`): `{ institutions, connections, isLoading, error, loadInstitutions(country), loadConnections(), startConnection(inst), syncConnection(id), removeConnection(id) }`. `startConnection` returns the `authUrl` for the screen to open. After `syncConnection`, call `hydrateTransactions({ force: true })` so new rows appear in tabs.
- [ ] **Step 3: Commit** — `git commit -m "feat(mobile): open-banking api client + store"`

### Task 9: Screens + deep link

**Files:**
- Create: `app/settings/import/connect.tsx` (institution picker), `app/settings/import/connections.tsx` (manage)
- Modify: `app/settings/import/index.tsx` (add "Connect a bank — beta" card above BANKS + "Connected banks" section when ≥1 connection), `app/_layout.tsx` (register headers — **every new screen needs a nav header**, recurring review feedback)

- [ ] **Step 1: `connect.tsx`** — searchable institution list (logo + name, from `loadInstitutions('PL')`); tap → `startConnection` → `WebBrowser.openAuthSessionAsync(authUrl, 'aibudget://ob-callback')`; on return (or dismiss) poll `loadConnections()` up to ~20s until the connection leaves `pending`; route to `connections.tsx` on `active`, show localized error on `error`. Gate behind tier: if API returns 403 limit → show `Paywall` component.
- [ ] **Step 2: `connections.tsx`** — card per connection: institution name, status pill (active/expired/error), account list with IBAN tail, `lastSyncAt` relative time, consent expiry countdown when <14 days, actions: Sync now, Reconnect (re-runs consent flow with same institution), Disconnect (confirm alert). All write affordances `canEdit`-gated (viewer role).
- [ ] **Step 3: i18n** — `bankConnect.*` keys in **all 9 locales** (en/de/es/fr/pl/ru/ua/be/nl) — use the `i18n-add-strings` skill.
- [ ] **Step 4: Manual verify on web + Android** — `npm run dev:web`, walk the flow against sandbox; verify the deep-link return path on a device build.
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): bank connect + connections screens"`

**Phase 2 exit criteria:** sandbox bank connectable end-to-end from the app; transactions visible in the Expenses tab after "Sync now".

---

## Phase 3 — Automation & lifecycle

### Task 10: Daily sync cron

**Files:**
- Create: `open-banking-sync.cron.ts`
- Test: `open-banking-sync.cron.spec.ts`

- [ ] **Step 1:** `@Cron('30 5 * * *')` (before the 08:00 subscription auto-charge and 09:00 reminders): iterate `status:'active'` connections, `syncConnection` each inside try/catch (one failure must not stop the loop), small concurrency (sequential is fine at current scale). PSD2 allows 4 unattended calls/day/account — one daily run is well inside the limit.
- [ ] **Step 2:** After a sync that created rows, send ONE localized push per account (reuse `NotificationsService.sendToUser`, new type `bank_sync` in `NotificationType` + `notification-i18n.ts` 9 langs), gated by new `user.notifyBankSync` pref (default `true`; add to notification-preferences API + `app/settings/notifications.tsx` toggle — same checklist as `debt_reminder`).
- [ ] **Step 3:** Test: two connections, first throws → second still syncs; push sent only when rows > 0.
- [ ] **Step 4: Commit.**

### Task 11: Consent expiry handling

- [ ] **Step 1:** In the same cron, find `status:'active'` with `consentExpiresAt` within 7 days → send `bank_reconnect` push (deep link → `/settings/import/connections`), once per connection (Redis dedup key `ob:expnotif:{connectionId}:{yyyy-mm}` or a `pushSent`-style column — pick the Redis key, no migration).
- [ ] **Step 2:** Connections past `consentExpiresAt` → flip to `expired` so the UI shows Reconnect.
- [ ] **Step 3: Commit.**

### Task 12: Rollback parity

- [ ] Confirm `GET /import/batches` lists `ob:enablebanking` batches and `DELETE /import/batches/:id` rollback works on them (it should — sync writes through `ImportBatchesService`); add one service test asserting an OB batch rolls back and the rows become re-importable (`externalRef` nulled). The next cron run will legitimately re-import them — document this in the help section as expected behaviour of rolling back an automatic import.

**Phase 3 exit criteria:** unattended daily sync in prod against a real PL bank (team dogfood), reconnect push observed before a real consent expiry.

---

## Phase 4 — Productisation & rollout

- [ ] **Help section** — `user_docs/<lang>/28-bank-connections.md` × 9 languages via the `add-help-section` skill (covers: what connects, 180-day reconnect, how to disconnect, what data we access, rollback caveat from Task 12).
- [ ] **Paywall copy** — add the feature to the Pro/Business comparison in `subscription.tsx` + Stripe marketing copy.
- [ ] **Beta gate** — launch behind tier gating only (D3); no separate feature flag needed since free tier = 0 connections. If a kill switch is wanted: provider returns empty institution list when env unset (already the no-op convention).
- [ ] **Prod env** — add the four env vars to `.env.production` on the VPS, force-recreate `api` (compose `up -d --force-recreate api` — plain restart does NOT reload env_file).
- [ ] **Monitoring** — count of `status:'error'` connections surfaced in admin system-health (`AdminService`); sync failures log to Sentry.
- [ ] **Tech docs** — update `docs/en` + `docs/ru` (API.md, ARCHITECTURE.md) per the full-tech-docs convention; CLAUDE.md module list 37→38; release notes per the changelog convention.
- [ ] **ABA issue** — create the tracking issue via the `finish-aba-task` skill flow when implementation starts.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Aggregator pricing doesn't fit unit economics | Phase 0 gate; tier-gate to paid users only; per-tier connection caps bound the cost |
| GoCardless-style product shutdown (vendor risk) | Provider interface keeps adapters swappable; sessions are re-creatable by user reconnect, not migrated state |
| Bank API quality in PL is uneven | Start with majors (PKO, mBank, ING, Santander, Pekao, Millennium, Alior, BNP); CSV import stays as universal fallback |
| 180-day reconnect churn | Expiry pushes (Task 11) + visible countdown in UI |
| Duplicate data vs manual/CSV entry | `externalRef` exact dedup + anomaly `duplicate_charge` detector flags cross-source dupes for the user |
| Regulatory (acting without AISP status) | D2 written confirmation from aggregator before prod; PL-only launch keeps one regulator (KNF) in scope |

## Rough effort

| Phase | Estimate |
|---|---|
| 0 — decisions/contract | 1–3 weeks calendar (sales latency), ~0 dev |
| 1 — backend MVP | 4–6 dev days |
| 2 — mobile | 3–4 dev days |
| 3 — automation | 2–3 dev days |
| 4 — rollout | 1–2 dev days |
