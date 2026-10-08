# Inbound e-receipts by e-mail forwarding (ABA-644) — Design

Issue: [#674](https://github.com/micode-ai/ai-budget-assistant/issues/674) (ABA-644).

## Goal

Polish chains and online shops e-mail e-paragony and order confirmations. A user sets up one
forwarding rule to a private address, and every forwarded message becomes a **pending** expense
they confirm in the app. Nothing is saved without the user's tap.

## Locked decisions

1. **We receive the mail ourselves.** The user ruled out Postmark, Mailgun and SES. Mail goes to a
   small dedicated container in our compose stack on the shared Hetzner VPS.
2. **Mail is received on a dedicated subdomain, `in.ai-budget.pl`.** The apex `ai-budget.pl` has no
   MX record today and stays that way, so the apex's mail setup is untouched. The address format is
   `<token>@in.ai-budget.pl`. The issue suggested `paragony+<token>@ai-budget.pl`; that is rejected
   because it would need an MX record on the apex.
3. **One address per user, with a target account the user picks.** A mailbox belongs to a person:
   - One Gmail rule maps to one address.
   - Co-members of a shared account must never see each other's forwarded mail.
   - Moving receipts to another account is a settings change, not a new Gmail rule plus a new
     Gmail verification.

   The target must be an account where the user is owner or editor.
4. **Never auto-save.** A message becomes an `InboundReceipt` staging row, never an `Expense` row.
   The expense is created by the client through the normal offline-first create path, with
   `source: 'ocr'`, when the user confirms.
   - The client-side create is what makes tier-1 E2EE encryption of `merchant`/`description`/receipt
     image work, through the existing `maybeEncrypt`.
   - `source: 'ocr'` is the same value the three bots use for scanned receipts. It inherits every
     receipt dedup rule (Tier-1 skip, push↔receipt pairing, `mergeWithExpenseId`) with no new
     `ExpenseSource` value.
5. **Encryption tier 2 is unsupported.**
   - The server cannot hold a readable expense for such an account, and AI cannot read it.
   - Creating an address that targets a tier-2 account is refused (`E2EE_UNSUPPORTED`).
   - The SMTP server rejects the RCPT if the target account moved to tier 2 later.
   - Moving an account to tier 2 disables the addresses that target it and purges their pending rows.
6. **Tier 1 is allowed, with a disclosure.** The e-mail is necessarily readable by our server while
   it is processed, the same as any receipt scan. The pending copy expires in 7 days instead of 30.
7. **Extraction is charged as one receipt scan:** `trackAiUsage(userId, 'ocr', 2.0, accountId)` on
   the address owner. It is free on every tier, within the existing AI quota. Two filters cost no AI
   request: a cheap pre-filter for messages that are not receipts, and the duplicate check. **This
   needs the user's call:** the alternative is to make it Pro-only (see "Open question").
8. **The SMTP server is a Node service** (`smtp-server` + `mailparser` + `mailauth`). It is not
   Postfix or Haraka. Reasoning:
   - The team writes TypeScript and has no MTA operator. Postfix needs main.cf/master.cf expertise,
     plus a pipe transport or milter to reach the API, and makes "no relay ever" a configuration
     property rather than a code property.
   - `smtp-server` is a **receive-only library**. It has no queue and no outbound path, so an open
     relay is structurally impossible.
   - RCPT-time token validation is one async callback.
   - It runs in about 60–80 MB RSS, which matters on a 4 GB box shared with four other projects.
   - Haraka is a plugin framework with its own queue semantics. It is more surface than one
     receive-and-forward job needs.
   - `mailauth` (same author as nodemailer/smtp-server) does SPF, DKIM, DMARC and ARC.
9. **No local spool. The API is the only state.** The container hands each message to the API over
   the internal Docker network and answers SMTP only after the API has persisted it:
   - `250` once the API persisted the message.
   - `451` (temporary failure) while the API is down or redeploying. The sending MTA retries for
     days, so a deploy loses no mail.
10. **The pre-check never fetches anything over the network.** The deterministic pre-check does not
    follow links in the mail and does not load remote images. That protects privacy (it tells the
    merchant nothing) and prevents SSRF.
    - **Not settled: the AI path.** `OcrService.parseReceipt` sends a `data:` URL today. Whether
      `parseReceiptText` also gets only stripped plain text, with no URLs, has not been checked. The
      backend agent must verify this before the claim holds end to end.
    - E-paragon links ("view your receipt at …") are Phase 2, and only for allow-listed domains.

## Open question for the user (blocking only the gating line, not the build)

- **Free within the AI quota (proposed), or Pro-only?** Free keeps the feature consistent with
  scanning a receipt, which is free and quota-bound. Pro-only is an upsell, but the main abuse
  vector — spam that burns the victim's quota — is bounded by the per-token caps either way.

## The constraint that shapes everything: a public port 25 on a shared box

- **One Docker daemon is shared** with `marketing-ai-*`, `accounting-*`, `legalka-bot` and
  `shared-nginx`. `eksiegowyai.pl` also lives on this box.
- **Port 25 may already be bound.** Before anything else, check `ss -ltnp 'sport = :25'` on the
  host. If another project runs an MTA there, this design needs a second Hetzner Primary IP, or
  inbound delivery through that MTA. That is a re-plan.
- **The proxy cannot help.** nginx `http` proxying does not carry SMTP, so the container publishes
  `25:2525` directly.
- **Docker-published ports bypass `ufw`.** Only the Hetzner Cloud Firewall, if one is attached,
  gates the port.
- **The container is internet-facing.** It therefore gets:
  - **no** `env_file` — only the variables it needs, passed explicitly;
  - **no** access to `budget-network`, where Postgres and Redis live. It joins a dedicated
    `inbound-mail-net` network that only `api` also joins.

## Architecture

```
Gmail / Outlook / shop MTA
   │ SMTP :25 (STARTTLS)        MX in.ai-budget.pl → mail-in.ai-budget.pl (A 46.225.23.232)
   ▼
budget-inbound-mail-prod  (apps/inbound-mail, Node 20, 192M, non-root, listens 2525)
   ├─ RCPT TO  → POST http://api:3000/api/v1/internal/inbound-mail/rcpt        (secret header)
   ├─ DATA     → size cap → mailparser → mailauth → pick document → sniff magic bytes
   └─ end-of-DATA → POST http://api:3000/api/v1/internal/inbound-mail/messages (secret header)
                    2xx → 250 · 4xx(reject) → 550 · 5xx/timeout → 451
   ▼
budget-api-prod  modules/inbound-mail/
   persist InboundReceipt(status=received) → 202
   → fire-and-forget process(id): dedup → pre-filter → trackAiUsage → OcrService → status=pending → push
   ▼
App: push → "E-mail receipts" inbox → existing receipt confirm card → normal expense create (source 'ocr')
     → POST /inbound-receipts/:id/confirm {expenseId}
```

## SMTP receiving side (`apps/inbound-mail/`)

New Turborepo workspace (`apps/inbound-mail`) with:
- `src/server.ts` — the `SMTPServer` wiring;
- `src/policy.ts` — pure decision functions;
- `src/pickDocument.ts`;
- `src/sniff.ts`;
- `src/gmailVerification.ts`;
- `src/apiClient.ts`;
- `src/healthcheck.ts`.

It may use `import type` from `@budget/shared-types` only. It defines its own payload types or
type-imports them, never runtime values.

Build: `docker/Dockerfile.inbound-mail`, multi-stage, `node:20-alpine`, runs as the `node` user.

### SMTP session rules

| Stage | Rule | Reply on failure |
|---|---|---|
| Connect | `maxClients: 50`. Per-IP concurrency 5. IP in the bad-RCPT penalty box (see below). | `421 4.7.0` |
| Banner/EHLO | Banner name is `mail-in.ai-budget.pl`. `disabledCommands: ['AUTH']`, `authOptional: true`. `size: 15 MB` is advertised (ESMTP SIZE). | — |
| MAIL FROM | Declared `SIZE` > 15 MB | `552 5.3.4` |
| RCPT TO | Domain must equal `INBOUND_MAIL_DOMAIN`, case-insensitive. Strip `+subaddress`. Local part must match `^[a-z2-7]{16}$`. Then the API `rcpt` call decides: unknown/disabled token, target tier 2, or user no longer an editor+ member. | `550 5.1.1` (any non-our domain: `550 5.7.1 relaying denied`) |
| RCPT TO | Per-token hourly or daily cap reached (API answers `limited`) | `452 4.2.2` (sender retries later) |
| RCPT TO | API unreachable or `503` | `451 4.3.0` |
| RCPT TO | More than 5 recipients | `452 4.5.3` |
| DATA | Stream byte counter exceeds 15 MB (do not trust SIZE) | `552 5.3.4` |
| DATA | Authentication: reject if DMARC = `fail` with policy `reject`/`quarantine` and no ARC `pass` from a trusted sealer (`google.com`, `outlook.com`/`microsoft.com`). Reject if neither SPF nor any DKIM signature passes. Gmail auto-forward and manual forwards always pass one of these, because Google rewrites the envelope sender and DKIM-signs. | `550 5.7.1` |
| DATA | Handoff `2xx` (including `409 duplicate`) | `250` |
| DATA | Handoff `422` (no usable content) | `250` (accepted and recorded as `unsupported`; never bounce, to avoid backscatter) |
| DATA | Handoff `5xx`/timeout (10 s) | `451 4.3.0` |

- `socketTimeout` is 60 s and `closeTimeout` is 30 s.
- Only one level of `message/rfc822` is re-parsed (Outlook "forward as attachment"). Deeper nesting
  is ignored.

### Content extraction in the container

- **Allow-list:**
  - PDF and images (JPEG, PNG, WebP, HEIC) are identified by **magic bytes**, never by
    `Content-Type`.
  - The body is taken as `text/html` → text (`html-to-text`, input capped at 2 MB, output at
    100 000 chars) or `text/plain`.
  - Everything else (zip, rar, docx, ics, executables) is ignored and counted as
    `ignoredAttachmentCount`. **Archives are never opened**, so a zip bomb cannot reach any parser.
- **Size caps:**
  - PDF ≤ 10 MB (same as share-to-capture);
  - image ≤ 8 MB;
  - at most 10 attachments inspected.
- **Document choice:** MVP extracts ONE document per message.
  1. The first PDF whose filename matches
     `/paragon|receipt|rachunek|faktura|invoice|order|zam[oó]wienie|potwierdzenie/i`, else the
     first PDF.
  2. Then the first image.
  3. Then the text body.
- **Never fetched:** remote images, `<img src>` and links are dropped by the HTML→text conversion.
- **Gmail forwarding verification:** a message whose From is `forwarding-noreply@google.com`, with a
  DKIM `pass` for `d=google.com`, is sent as `kind: 'forwarding_verification'`.
  - The code is read with `/confirmation code:\s*(\d{6,12})/i`, plus the localized variants seen in
    fixtures (PL: `kod potwierdzenia`).
  - No attachment or text body is forwarded for it.
- **Message identity:**
  - `messageIdHash = sha256(lowercased Message-ID)`.
  - If the Message-ID is missing: `sha256(from|date|subject|contentHash)`.
- **Content hash:**
  - for a file: `receiptFingerprint(base64)` — the same SHA-256-of-base64-text rule as ABA-603, so a
    PDF forwarded by mail and the same PDF shared to the app fingerprint identically;
  - for text: `sha256(normalised whitespace-collapsed text)`.

### Handoff payload (`POST /api/v1/internal/inbound-mail/messages`)

```ts
{
  token: string; remoteIp: string; helo: string; envelopeFrom: string;
  auth: { spf: string; dkim: string[]; dmarc: string; arc: string };
  messageIdHash: string; fromAddress: string; subject: string | null; date: string | null;
  kind: 'receipt' | 'forwarding_verification';
  verificationCode?: string;
  document?: { kind: 'pdf' | 'image' | 'text'; mimeType: string; filename?: string;
               base64?: string; text?: string; contentHash: string };
  ignoredAttachmentCount: number;
}
```

The API validates this with a **Zod schema local to the API**. The API never imports runtime values
from `@budget/shared-utils`.

### TLS

- **STARTTLS is opportunistic** (Gmail and Outlook use it when offered).
- **Certificate:** add `mail-in.ai-budget.pl` as a SAN to the existing
  `/etc/letsencrypt/live/ai-budget.pl/` certificate, which already covers the apex, `admin.` and
  `api.`. Use the same certbot method that issued it. The user must confirm how renewal runs
  (`certbot certificates`; webroot through `shared-nginx`?).
- **Mount:** `/etc/letsencrypt` read-only into the container. The whole directory is needed, because
  `live/` is symlinks into `archive/`.
- **Renewal:** every 6 h the container compares the cert's mtime and calls
  `server.updateSecureContext()`. Renewal never needs a restart.
- **If the cert is missing or unreadable at start:** log a warning and serve without STARTTLS rather
  than crash-looping. Senders still deliver in plaintext. `infra-check.sh` flags it (below).

### Compose service (devops)

```yaml
inbound-mail:
  build: { context: ., dockerfile: docker/Dockerfile.inbound-mail }
  container_name: budget-inbound-mail-prod
  restart: unless-stopped
  ports: ["25:2525"]
  logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
  environment:          # explicit — NOT env_file: this container faces the internet
    NODE_ENV: production
    NODE_OPTIONS: "--max-old-space-size=128"
    INBOUND_MAIL_DOMAIN: ${INBOUND_MAIL_DOMAIN:-in.ai-budget.pl}
    INBOUND_MAIL_HOSTNAME: ${INBOUND_MAIL_HOSTNAME:-mail-in.ai-budget.pl}
    INBOUND_MAIL_SHARED_SECRET: ${INBOUND_MAIL_SHARED_SECRET}
    API_INTERNAL_URL: http://api:3000/api/v1
    TLS_CERT: /etc/letsencrypt/live/ai-budget.pl/fullchain.pem
    TLS_KEY: /etc/letsencrypt/live/ai-budget.pl/privkey.pem
  volumes: ["/etc/letsencrypt:/etc/letsencrypt:ro"]
  networks: [inbound-mail-net]
  healthcheck: { test: ["CMD", "node", "dist/healthcheck.js"], interval: 30s, timeout: 5s, retries: 3 }
  deploy: { resources: { limits: { memory: 192M } } }
```

- `api` also joins `inbound-mail-net`.
- The healthcheck opens `127.0.0.1:2525` and expects a `220` banner.
- The container is **not** given Redis or Postgres. Rate counters live in the API (below).
- Memory: the box runs ≈2.2 GB of our own limits today. 192 MB more must be confirmed with
  `free -m` by devops.
- The `docker-compose.prod.yml` `logging` rotation covers this container. It is created by compose,
  not by hand.

### Deploy and monitoring changes (devops)

- `scripts/deploy.sh`: build `inbound-mail` with `api admin migrator`, and add it to the
  `up -d --force-recreate` list.
- `.github/workflows/deploy.yml`: add `apps/inbound-mail/**` and `docker/Dockerfile.inbound-mail` to
  the path filter.
- `scripts/infra-check.sh`: add `budget-inbound-mail-prod` to the default `CONTAINERS`.
- Add a TLS check: `openssl s_client -starttls smtp -connect 127.0.0.1:25` with
  `-checkend 1209600` (14 days). An expired or absent cert alerts.
- The shared reverse proxy (`shared-nginx`; `deploy.sh` still calls it `accounting-nginx`) gets
  `location ^~ /api/v1/internal/ { return 404; }` in the `api.ai-budget.pl` server block, applied
  with a graceful `nginx -s reload`, never a recreate.

## Data model

Migration name: **`add_inbound_mail`**. It is additive only. `schema.prisma` and the migration
folder land in the **same commit** (ABA-558).

```prisma
model InboundMailAddress {
  id              String    @id @default(uuid())
  userId          String    @unique @map("user_id")
  token           String    @unique                       // 16 chars [a-z2-7], 80 bits
  targetAccountId String    @map("target_account_id")
  disabledAt      DateTime? @map("disabled_at")
  rotatedAt       DateTime? @map("rotated_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  targetAccount   Account   @relation(fields: [targetAccountId], references: [id], onDelete: Cascade)
  @@map("inbound_mail_addresses")
}

model InboundReceipt {
  id                     String    @id @default(uuid())
  userId                 String    @map("user_id")
  accountId              String    @map("account_id")
  kind                   String    @default("receipt")     // receipt | forwarding_verification
  status                 String    @default("received")
  // received | processing | pending | confirmed | dismissed | duplicate
  // | not_a_receipt | quota_exceeded | unsupported | failed
  messageIdHash          String    @map("message_id_hash")
  contentHash            String?   @map("content_hash")
  fromAddress            String    @map("from_address")    // ≤320
  subject                String?                            // ≤200
  authSpf                String?   @map("auth_spf")
  authDkim               String?   @map("auth_dkim")
  authDmarc              String?   @map("auth_dmarc")
  documentKind           String?   @map("document_kind")   // pdf | image | text
  documentMime           String?   @map("document_mime")
  document               Bytes?                             // nulled on confirm/dismiss/expiry
  documentText           String?   @map("document_text")   // text body, ≤100k, same lifecycle
  ignoredAttachmentCount Int       @default(0) @map("ignored_attachment_count")
  extraction             Json?                              // ReceiptExpense minus possibleDuplicate
  verificationCode       String?   @map("verification_code")
  expenseId              String?   @map("expense_id")      // server PK after confirm
  attempts               Int       @default(0)
  errorCode              String?   @map("error_code")
  expiresAt              DateTime  @map("expires_at")
  createdAt              DateTime  @default(now()) @map("created_at")
  updatedAt              DateTime  @updatedAt @map("updated_at")
  user                   User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  account                Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@unique([userId, messageIdHash])
  @@index([userId, accountId, status])
  @@index([status, updatedAt])
  @@index([expiresAt])
  @@map("inbound_receipts")
}
```

- **Not synced, and no SQLite table.** Pending items are server-born, and the inbox is online-only.
  There is no `SyncXxxPayload`.
- **Excluded from account backups** (`backups` module) — the rows are transient.
- **Retention:**
  - receipt rows: `expiresAt` is 30 days, 7 days for tier-1 accounts;
  - verification rows: 24 h;
  - `document` and `documentText` are nulled at confirm or dismiss;
  - terminal rows are hard-deleted at `expiresAt`.
- The raw e-mail is **never stored**: no headers beyond those above, no body other than the chosen
  document.

## API surface (`apps/api/src/modules/inbound-mail/`)

Files:
- `inbound-mail.module.ts`;
- `inbound-mail.controller.ts` (user-facing);
- `inbound-mail-internal.controller.ts`;
- `guards/internal-secret.guard.ts`;
- `inbound-mail-address.service.ts`;
- `inbound-receipt.service.ts` (ingest + state machine);
- `inbound-receipt-processor.service.ts` (dedup → pre-filter → AI);
- `inbound-mail.cron.ts`;
- `inbound-mail-push.ts` (9-language copy);
- `dto/index.ts` (local Zod).

Add `inbound-mail` to the CLAUDE.md module list.

| Verb | Route | Guards | Request | Response |
|---|---|---|---|---|
| GET | /inbound-mail/address | `JwtAuthGuard + AccountContextGuard` | — | `InboundMailAddressResponse \| null` (`address`, `targetAccountId`, `enabled` feature flag, `pendingVerification?: {code, receivedAt}` = newest verification row < 24 h) |
| POST | /inbound-mail/address | `+ ViewerBlockGuard` | `{}` (target = `req.accountId`) | `InboundMailAddressResponse`. Idempotent: returns the existing address. `400 E2EE_UNSUPPORTED` at tier 2. `404` when the flag is off. |
| PATCH | /inbound-mail/address | `+ ViewerBlockGuard` | `{ targetAccountId }` | `InboundMailAddressResponse`. Requires an editor+ membership in the target and target tier < 2. |
| POST | /inbound-mail/address/rotate | `+ ViewerBlockGuard` | — | `InboundMailAddressResponse`. The new token takes effect immediately; the old token is rejected at once (no grace period). |
| DELETE | /inbound-mail/address | `+ ViewerBlockGuard` | — | `204` (sets `disabledAt`) |
| GET | /inbound-receipts | `JwtAuthGuard + AccountContextGuard` | `?status=pending\|handled` | `InboundReceiptListItem[]` (where `userId = me AND accountId = req.accountId`) |
| GET | /inbound-receipts/count | same | — | `{ pending: number }` |
| GET | /inbound-receipts/:id | same | — | `InboundReceiptDetail`, with `possibleDuplicate` **recomputed** through `ReceiptDuplicateService` (no AI). `404` if the row is not the caller's. |
| GET | /inbound-receipts/:id/document | same | — | the bytes, with the stored MIME type. `410` once nulled. |
| POST | /inbound-receipts/:id/confirm | `+ ViewerBlockGuard` | `{ expenseId }` (client id or server PK; resolve `OR:[{id},{clientId}]` within `accountId`) | `204`. Idempotent. Nulls the document. |
| POST | /inbound-receipts/:id/dismiss | `+ ViewerBlockGuard` | — | `204` |
| POST | /inbound-receipts/:id/retry | `+ ViewerBlockGuard + AiUsageGuard` + `@TrackAiUsage('ocr', 2.0)` | — | `InboundReceiptDetail`. Allowed from `quota_exceeded`/`failed` only. |
| POST | /internal/inbound-mail/rcpt | `InternalSecretGuard` only | `{ token, remoteIp }` | `{ result: 'accept' \| 'unknown' \| 'limited' }` |
| POST | /internal/inbound-mail/messages | `InternalSecretGuard` only | handoff payload | `202 {id}` · `409` duplicate · `422` nothing usable · `503` |

**Ownership:** every user-facing `:id` route filters on `id AND userId = req.user.id AND accountId =
req.accountId`. A miss is `404`, never `403`.

**`InternalSecretGuard`:**
- Compares the `X-Inbound-Secret` header with `INBOUND_MAIL_SHARED_SECRET` using
  `crypto.timingSafeEqual`. An unset secret means every request is rejected.
- **Also** rejects any request carrying `X-Forwarded-For`/`X-Real-IP`. The container calls the API
  directly; nginx always adds these headers. This is defence in depth on top of the nginx `404`
  block. Devops confirms the headers are set in the api server block.

**Rate limits** live in the API, through `CacheService.incrementWindow`, which **fails closed**:
Redis down → `503` → SMTP `451`.
- Bad RCPT: `inmail:badrcpt:{ip}`, 10 per 10 min. Above that the `rcpt` endpoint answers `unknown`
  for every token from that IP for 1 h, which kills token guessing.
- Accepted messages per token: `inmail:tok:{token}:h` at 20 per hour and `inmail:tok:{token}:d` at
  60 per day. Counted on `messages`; checked on `rcpt`.
- Push throttle: `inmail:push:{userId}`, one batched push per 10 min, through `setIfAbsent`.

Devops must review this new Redis key-space.

### Processing state machine (`InboundReceiptProcessor.process(id)`)

The ingest endpoint persists the row as `received` and answers `202`. It then runs the steps below
as a fire-and-forget call (`logFireAndForget`).

1. Status → `processing`, `attempts++`.
2. `forwarding_verification` → status `pending` and an immediate push. The push is NOT throttled:
   "Gmail confirmation code: 123456789". No AI. Stop.
3. **Dedup, no AI:**
   - `contentHash` equal to a non-dismissed `InboundReceipt` of the same user;
   - or equal to an `Expense.receiptFingerprint` in the account (`findByFingerprint`).

   Either → status `duplicate`. No push. Stop.

   (A repeat of the same Message-ID is caught earlier by `@@unique([userId, messageIdHash])` →
   `409`.)
4. **Not-a-receipt pre-filter, no AI:** a text-only document with no amount+currency pattern
   (PLN/zł/EUR/€/USD/$/GBP/£/UAH/₴ near a number) → `not_a_receipt`. This keeps a careless "forward
   everything" rule from burning quota.
5. `trackAiUsage(userId, 'ocr', 2.0, accountId)`. A `ForbiddenException` → `quota_exceeded`, plus at
   most one push per day. Stop.
6. Extraction by document kind:
   - `pdf` → `OcrService.parseReceiptPdf`;
   - `image` → `parseReceipt`;
   - `text` → a new `OcrService.parseReceiptText`. Extract the text branch of `parseReceiptPdf` into
     it, so the PDF-text path and the e-mail path share one prompt.

   `userPrompt` carries only a neutral hint: "Source: forwarded e-mail from <sender domain>". The
   subject is NOT passed — it is attacker-controlled text.
7. `extraction` → stored without `possibleDuplicate`. A result with no total or a zero total →
   `not_a_receipt`. Otherwise → `pending`, plus the throttled push "N new e-receipts to confirm"
   with data `{ type: 'inbound_receipt', inboundReceiptId }`.
8. Any error → `failed`, with `errorCode`.

### Cron (`inbound-mail.cron.ts`, `@nestjs/schedule` in the API)

- **Every 10 min:** re-run rows stuck in `received`/`processing` for > 10 min with `attempts < 3`.
  This covers an API restart mid-processing. At 3 attempts → `failed`.
- **Daily at 03:30:** `paginateById` over `expiresAt < now` → hard-delete.

### Encryption-tier hook

When `EncryptionService` raises an account to tier 2, it disables every `InboundMailAddress` with
that `targetAccountId` and deletes that account's non-terminal `InboundReceipt` rows.

## Mobile flow

**Storage:** in-memory only (`inboundReceiptStore`). The inbox is **online-only**: the items are
server-born, and the document must be downloaded to confirm. Say so in the empty and offline
states. No SQLite, no MMKV, no sync queue — the db-engineer skips the mobile schema.

**Settings → "E-mail receipts"** (`app/settings/email-receipts.tsx`, a thin `SettingsRoute` over
`src/components/settings/email-receipts/EmailReceiptsSettings.tsx`, plus an entry in
`src/features/settings/settingsRegistry.ts` so the desktop two-pane shell lists it). The screen
needs a header: title and back. It shows:
- when the flag is off, the entry is hidden;
- a "Create my address" button for owners and editors (`canEdit`);
- the address with a copy button (`expo-clipboard`);
- the target account picker;
- Rotate, with a confirm dialog warning that the forwarding rule must be updated;
- Disable;
- a **pending Gmail verification code card** (large code, copy button, polled while the screen is
  focused);
- the E2EE disclosure;
- the guide, which is an accordion (Gmail and Outlook) and also a section in user_docs:
  - **Gmail:**
    1. Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address.
    2. The code appears here.
    3. Then create a **filter** (from: the shop's address, or the subject "paragon"/"zamówienie")
       with "Forward it to". The guide must not recommend forwarding all mail, for privacy and
       quota.
  - **Outlook:** Settings → Mail → Rules → Forward to. Note that Outlook.com and Microsoft 365
    tenants may block automatic external forwarding. The fallback is to forward manually.

**Inbox** (`app/inbox/email-receipts.tsx`, which needs a header) is a list of `pending` items: sender
domain, subject, extracted total, date, and a duplicate badge. A "Handled" segment shows
duplicate, not-a-receipt, quota-exceeded and failed items, with Retry where it applies. Tapping an
item:
1. `GET /inbound-receipts/:id` and `/document`.
2. Open the **existing** `ReceiptExpenseView` confirm card, seeded from `extraction`, through a new
   `useReceiptScanner` entry point (`seedFromInbound(detail, documentUri)`) instead of a scan. This
   gives the duplicate banner and the ABA-630 "Merge into one expense" box (`mergeWithExpenseId`)
   for free.
3. Save → the normal `expenseStore.addExpense`: `source: 'ocr'`, `receiptFingerprint =
   extraction.fingerprint`, and the receipt file attached the same way share-to-capture attaches a
   PDF or image. The engineer verifies how `useReceiptSave` attaches a PDF; a text-body item gets no
   attachment in the MVP.
4. Then `POST /inbound-receipts/:id/confirm { expenseId: clientId }`.

Dismiss is available on every row. Viewers see no confirm or dismiss actions.

**Notification:**
- A new push type `inbound_receipt` in `src/hooks/useNotificationDeepLink.ts` opens the inbox. A
  single-item push opens the item.
- It respects the existing cold-start gate for navigation.
- A compact banner at the top of the Expenses tab, shown when `GET /inbound-receipts/count > 0`,
  links to the inbox. It is fetched on tab focus.
- No new home `WidgetKey` in the MVP.

**Web:**
- The settings entry and the inbox work through the registry and the existing phone layouts.
- Desktop dialog polish is Phase 2 (`aba-web-designer` → `aba-web-engineer`).

**i18n:** a new `emailReceipts` namespace with about 45 keys (settings, guide, inbox, states,
errors, disclosure) × 9 locales. The server push copy (receipts, verification code, quota) is in all
9 languages and pinned by a spec, like `notification-i18n.spec.ts`.

## Build order

1. **`aba-backend-engineer`, `packages/shared-types`:** add `entities/inboundMail.ts`
   (`InboundMailAddressResponse`, `InboundReceiptListItem`, `InboundReceiptDetail`,
   `InboundReceiptStatus`, `InboundReceiptKind`) and the handoff payload type. Nothing goes in
   `dto/sync.ts`.
2. **`aba-db-engineer`:** the Prisma models plus the `add_inbound_mail` migration, in one commit.
3. **`aba-backend-engineer`:**
   - the `inbound-mail` module;
   - extract `OcrService.parseReceiptText`;
   - the tier-2 hook in `EncryptionService`;
   - exclusion from the account backup;
   - flag `INBOUND_MAIL_ENABLED` (default off).
4. **`aba-devops-engineer` with `aba-backend-engineer`, in parallel with 3 once 1 is done:**
   - the `apps/inbound-mail` workspace and Dockerfile;
   - the compose service and network;
   - the `deploy.sh`, `deploy.yml` path filter and `infra-check.sh` changes;
   - the nginx `internal` block;
   - `docs/ops/inbound-mail.md`.
5. **`aba-designer`:** the settings screen, inbox, verification-code card and Expenses-tab banner.
6. **`aba-mobile-engineer`:**
   - `inboundReceiptStore`;
   - the `api.ts` methods;
   - the settings route and registry entry;
   - the inbox route;
   - the `seedFromInbound` scanner entry;
   - the push deep link;
   - the banner.
7. **`aba-mobile-engineer`:** i18n in all 9 locales.
8. **Docs:**
   - extend `user_docs/*/04-voice-and-receipt.md` × 9 (an existing section, so no registration) and
     run `npm run generate:help`;
   - wiki page `docs/wiki/features/inbound-e-receipts.md` plus a `log.md` line;
   - in CLAUDE.md: the module list and the env vars (`INBOUND_MAIL_ENABLED`, `INBOUND_MAIL_DOMAIN`,
     `INBOUND_MAIL_HOSTNAME`, `INBOUND_MAIL_SHARED_SECRET`).
9. **`aba-security`:** the audit (below), before merge.
10. **Activation, the user's hands:** the ops steps below → set the env vars and force-recreate
    `api` + `inbound-mail` → run the swaks tests → flip `INBOUND_MAIL_ENABLED=true`.

Steps 3–8 ship dark behind the flag. Code can merge before DNS exists.

## Ops steps that need the user (hands or approval)

1. **Port 25 check on the VPS:** `ss -ltnp 'sport = :25'`. If anything already listens (another
   project's MTA), stop — this needs a re-plan (a second IP).
2. **DNS at microhost.pl** (dns1/dns2.microhost.pl). There is no apex MX change.
   - `mail-in.ai-budget.pl.  A   46.225.23.232`. No AAAA — Docker does not publish port 25 on
     IPv6 here.
   - `in.ai-budget.pl.       MX  10 mail-in.ai-budget.pl.`
   - `in.ai-budget.pl.       TXT "v=spf1 -all"` — we never send from this subdomain.
   - `_dmarc.in.ai-budget.pl. TXT "v=DMARC1; p=reject; adkim=s; aspf=s"` — nobody can spoof our
     receiving domain.
   - Check first that no wildcard record on `*.ai-budget.pl` conflicts:
     `dig in.ai-budget.pl ANY`, `dig mail-in.ai-budget.pl`.
3. **Hetzner:** if a Cloud Firewall is attached, allow inbound TCP 25 from `0.0.0.0/0`. Hetzner
   blocks *outbound* 25 on new projects; this design never sends, so that is irrelevant. Inbound is
   not blocked.
4. **TLS:** expand the `ai-budget.pl` certificate with the SAN `mail-in.ai-budget.pl` using the
   existing certbot method, after the A record propagates.
5. **Secret:** generate `INBOUND_MAIL_SHARED_SECRET` with `openssl rand -hex 32`. Put it in
   `.env.production`, **and in the offline copy of `.env.production`** (disaster recovery).
6. **nginx:** approve the `location ^~ /api/v1/internal/ { return 404; }` edit on `shared-nginx`
   (graceful reload).
7. **Approvals:**
   - approve the ~192 MB memory addition on the shared box;
   - decide free-within-quota versus Pro;
   - after go-live, run an external open-relay test (mxtoolbox) and one real Gmail forwarding setup.

## `docs/ops/inbound-mail.md` (runbook outline)

1. **Architecture and the "no outbound, no relay" guarantee.** The container list and networks.
2. **First activation:** the DNS records, firewall, cert SAN, secret, flag, and verification
   commands (`dig MX in.ai-budget.pl`; `swaks --to <token>@in.ai-budget.pl --server
   mail-in.ai-budget.pl --tls --attach receipt.pdf`; `swaks --to x@gmail.com …` must get `550`).
3. **Certificate renewal:** how hot reload works, and how to check it
   (`openssl s_client -starttls smtp`).
4. **Debugging a "my e-mail didn't arrive" report:**
   - container logs (log a token hash prefix, never the full address, subject or body);
   - the `InboundReceipt` row by user;
   - the 451/452/550 codes and what each means;
   - Gmail's "delivery delayed" behaviour.
5. **Abuse response:**
   - rotate a user's token;
   - block an IP (penalty-box key);
   - lower the caps through env vars.
6. **Disable switch:** `INBOUND_MAIL_ENABLED=false` (the API refuses every RCPT with `550`), or stop
   the container. MX senders then retry or bounce, and nothing is lost on our side.
7. **Disk and memory:** documents are bounded by the 30-day expiry. Query for the row count and the
   `document` byte total.
8. **Rollback:** remove the service; the MX can stay. Senders get connection refused and bounce
   after their retry window.

## Threat table

| Threat | Mitigation |
|---|---|
| Open relay or outbound abuse | `smtp-server` is receive-only and has no outbound code. RCPT for any domain other than `in.ai-budget.pl` → `550`. AUTH is disabled. Tested with swaks + mxtoolbox. |
| Token enumeration | 80-bit token. Unknown RCPT → `550`. Per-IP bad-RCPT penalty box (10 per 10 min → 1 h). Tokens never appear in logs (hash prefix only). |
| Spoofed sender injecting fake receipts | SPF/DKIM/DMARC/ARC via `mailauth`. Reject on DMARC fail with p=reject/quarantine, or when nothing authenticates. Even a passing spoof only creates a **pending** item the user must confirm. |
| Spam to a valid token burns the victim's AI quota | Per-token caps (20/h, 60/day). The no-AI dedup and not-a-receipt pre-filter. Rotate and disable in Settings. |
| Zip, decompression or archive bombs | Archives are never opened; only PDF and images are allowed, by magic bytes. 15 MB message cap enforced on the stream. One level of `message/rfc822` only. |
| PDF bomb or parser DoS | 10 MB PDF cap. The existing `renderToPngs` page cap (4). Processing runs off the SMTP path, so a slow parse never holds a connection. API memory as today. |
| Huge or hostile HTML | 2 MB HTML input cap and 100 k-char text cap. `html-to-text` with no remote fetch. Links and images are dropped. |
| Prompt injection in an e-mail body | The OCR path has no tools. The subject is not passed to the model. Output is a proposal shown with amounts, which the user confirms. |
| Tracking pixels or links revealing the user | Nothing is fetched during the deterministic pre-check. (Whether the LLM path also strips URLs is the unverified point under decision 10.) |
| Internal endpoint reached from the internet | nginx `404` on `/api/v1/internal/`. Secret compared in constant time. Forwarded headers rejected. The container shares only `inbound-mail-net` with the API. |
| Internet-facing container compromise | Non-root. No DB, Redis or OpenAI credentials — only the shared secret. 192 MB limit. Separate network. |
| Cross-account or cross-user leak | Items are scoped to `userId` + `accountId`, and a miss is `404`. The target account must be editor+ at create, RCPT and confirm. Shared-account co-members never see another member's items. |
| Viewer writes | `ViewerBlockGuard` on every POST/PATCH/DELETE above. The RCPT check refuses a target where the user has been demoted to viewer. |
| E2EE breach | Tier 2 is refused at create and at RCPT, and disabled on upgrade. Tier 1: the expense is encrypted client-side at confirm; pending plaintext expires in 7 days; the user sees a disclosure. |
| Backscatter | Rejections happen in-session (`5xx`). We never generate a bounce. |
| Privacy and retention (GDPR) | The raw message is never stored. One document, nulled on confirm or dismiss, with 30-day (7-day at tier 1) and 24 h expiry. Rows cascade on user or account deletion. |
| SMTP smuggling | No relay, so it has no impact. Keep `smtp-server` current. |

## Edge cases

- **Gmail sends the verification code before the user opens the app.** The code is stored for 24 h
  and pushed. If the push token is missing, Settings shows it on next open.
- **The same e-receipt is forwarded twice:**
  - an auto-forward with the same Message-ID → `409` (accepted, ignored);
  - a manual re-forward with a new Message-ID → `contentHash` → `duplicate`, at no AI cost.
- **An e-receipt arrives after the bank push for the same purchase was already captured.** At open,
  `possibleDuplicate` is recomputed and offers the ABA-630 merge box. If the box is left unticked,
  the post-save `possible_merge` alert still catches the pair.
- **An e-receipt arrives first, and the bank push later:** existing push↔`ocr` pairing, since the
  confirmed expense is `source: 'ocr'`.
- **Order confirmation before shipment, then an invoice later:** two items. The second shows a
  duplicate banner through `findLikely`, and the user decides.
- **Currency not in the `Currency` union** (CHF, CZK): the extraction behaves exactly like a scanned
  receipt today.
- **The user changes the target account while items are pending:** existing items keep their
  `accountId`. The inbox shows the current account's items. The count badge is per account.
- **The user is removed from the target account:** the RCPT is refused, and existing items are
  hidden by the membership check at read time.
- **The API redeploys mid-SMTP:** `451`, and the sender retries.
- **The API restarts mid-processing:** the 10-minute cron re-runs the row.
- **Redis is down:** rate checks fail closed → `451` (mail is delayed, not lost). The push throttle
  skips the push.
- **The message has only an e-paragon link and no attachment:** the text pre-filter likely sees no
  amount → `not_a_receipt`. The Handled list explains "receipt is behind a link". Link fetching is
  Phase 2.
- **Infra:**
  - a new public port, a new container (192 MB) and a new Redis key-space (`inmail:*`);
  - bounded new `Bytes` rows in the DB dump;
  - an API cron;
  - a `shared-nginx` config edit;
  - a certificate SAN.

## Testing

**`apps/inbound-mail` (jest, pure functions plus fixture `.eml` files):**
- recipient parsing (case, `+subaddress`, wrong domain, bad token shape);
- `pickDocument` priority and filename heuristics;
- magic-byte sniffing, including a PDF disguised as `image/jpeg` and an `.exe` named `.pdf`;
- the size-cap stream counter;
- the Gmail verification extractor (EN and PL fixtures, a spoofed `forwarding-noreply` without
  google DKIM → not treated as verification);
- the auth policy table: Gmail auto-forward with ARC, a manual forward, DMARC p=reject fail, and
  nothing passing;
- the API response → SMTP code mapping.

**API (jest):**
- `InternalSecretGuard`: missing secret, wrong secret, unset env var, and a forwarded header present;
- `rcpt` across every state: unknown, disabled, tier 2, viewer, limited, and Redis down → `503`;
- ingest: `messageIdHash` conflict → `409`;
- processor:
  - duplicate by `contentHash`, both against a pending row and against `Expense.receiptFingerprint`;
  - the not-a-receipt pre-filter;
  - `quota_exceeded`;
  - the verification-code path makes no AI call;
  - an extraction with no total → `not_a_receipt`;
- confirm: idempotent, resolves a client id, another user's id → `404`, viewer → `403`;
- the tier-2 upgrade hook;
- cron purge and the requeue cap;
- push copy in all 9 languages.

**Mobile (jest):**
- the store reducers;
- `seedFromInbound` maps a detail to scanner state, carrying `fingerprint` and `possibleDuplicate`;
- the push deep-link routing.

**Manual and staging, before the flag flips:**
- swaks with a PDF, an image and HTML;
- the relay-denied test;
- an oversize message → `552`;
- an unknown token → `550`;
- a real Gmail forwarding setup end to end (code appears in the app, filter forwards an e-paragon,
  confirm creates an expense, re-forward → duplicate);
- an Outlook rule;
- a manual forward from a phone;
- `infra-check.sh` passes, and the TLS check passes.

## Required pre-merge reviews

- **`aba-security` audit — required.** The feature adds:
  - a new internet-facing listener (port 25) and an inbound webhook-equivalent internal endpoint
    with a shared secret;
  - file uploads from untrusted senders (PDF, images, HTML);
  - E2EE tier behaviour;
  - untrusted text entering an LLM prompt;
  - token-based addressing.
- **`aba-devops-engineer` review — required.** The feature adds:
  - a new compose service, a public port on the shared Docker host, and a new Docker network;
  - a certificate SAN and a `shared-nginx` edit;
  - a new Redis key-space and a new API cron;
  - in-DB `Bytes` growth in the backup dump;
  - changes to `deploy.sh`, the `deploy.yml` path filter and `infra-check.sh`;
  - memory headroom on the 4 GB box.

## Follow-ups (Phase 2)

- Several receipts per message (each PDF its own pending item).
- E-paragon links: fetch only from an allow-listed set of Polish e-paragon portals, with SSRF
  hardening.
- Render HTML-body receipts to an image so they can be attached to the expense.
- A per-user sender allow-list, plus an optional "trusted sender" fast path (still confirm-only).
- DNSBL via Spamhaus DQS; MTA-STS / TLS-RPT for `in.ai-budget.pl`.
- Desktop-web inbox dialog (`aba-web-designer` → `aba-web-engineer`).
- Admin metrics (messages per day, rejection reasons, AI spend from e-mail).
- A bot notification ("new e-receipt") on Telegram, WhatsApp and Slack, with parity.
- Refunds and income e-mails → pending income.

## Out of scope

- Any outbound mail from `in.ai-budget.pl`, or any change to the apex `ai-budget.pl` mail or MX.
- Third-party inbound providers (ruled out by the user).
- Auto-saving any expense, under any condition.
- IMAP or Gmail-API pull from the user's mailbox.
- Tier-2 E2EE accounts.
- Offline inbox and SQLite mirroring.
- Bot-side handling of forwarded e-mails.
