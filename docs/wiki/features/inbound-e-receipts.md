# Inbound e-receipts (forwarding receipts by e-mail)

## What this is
Polish chains and online shops e-mail e-paragony and order confirmations. A user creates a private
address (`<token>@in.ai-budget.pl`), points one mailbox forwarding rule at it, and every forwarded
message becomes a **pending** item in an in-app inbox. The user confirms it on the existing receipt
confirm card; nothing is saved without that tap. We receive the mail ourselves, with a small
receive-only SMTP container on the shared VPS. Third-party inbound providers were ruled out.
Spec: [`docs/superpowers/specs/2026-10-09-inbound-e-receipts-design.md`](../../superpowers/specs/2026-10-09-inbound-e-receipts-design.md).
Ops runbook: [`docs/ops/inbound-mail.md`](../../ops/inbound-mail.md). Where the code and the spec
disagree, this page follows the code. The spec's own values that changed are listed under History.

**It ships dark.** `INBOUND_MAIL_ENABLED` defaults off, and the container's compose profile is off
unless `INBOUND_MAIL_CONTAINER=true`. See *Known gaps → Not activated*.

## Entry points
- **SMTP container** (`apps/inbound-mail/`, its own workspace and its own standalone lock):
  `src/server.ts` (the `SMTPServer` wiring), `src/handlers.ts` (RCPT and DATA decisions),
  `src/policy.ts` (pure: recipient parsing, API status → SMTP reply, auth policy, in-memory penalty
  box), `src/extract.ts` + `src/extractInWorker.ts`/`src/extractWorker.ts` (MIME parsing in a
  terminable worker), `src/pickDocument.ts`, `src/sniff.ts`, `src/gmailVerification.ts`,
  `src/headers.ts` (raw duplicate-header scan), `src/dataReader.ts`, `src/budget.ts` (global
  in-flight byte budget), `src/apiClient.ts`, `src/config.ts`.
- **Image and compose**: `docker/Dockerfile.inbound-mail`; service `inbound-mail` in
  `docker-compose.prod.yml` (profile `inbound-mail`, network `inbound-mail-net`);
  `scripts/inbound-mail-cert-hook.sh` (certbot deploy hook); `docker/nginx/api-internal-block.conf`
  (applied by hand on `shared-nginx`); the `INBOUND_MAIL_CONTAINER` toggle in `scripts/deploy.sh`
  and `scripts/infra-check.sh`; `.github/workflows/inbound-mail-audit.yml`.
- **API module** `apps/api/src/modules/inbound-mail/`:
  - `inbound-mail-internal.controller.ts` + `guards/internal-secret.guard.ts`: the two routes the
    container calls;
  - `inbound-mail.controller.ts` + `guards/inbound-mail-enabled.guard.ts`: the user-facing
    routes;
  - `inbound-mail-address.service.ts`: the address and the RCPT decision;
  - `inbound-receipt.service.ts`: ingest, the inbox, confirm, dismiss, retry;
  - `inbound-receipt-processor.service.ts`: dedup, pre-filter, quota, extraction;
  - `inbound-mail.cron.ts`, `inbound-mail.config.ts` (every limit and retention value),
    `inbound-mail.util.ts`, `inbound-mail-push.ts` (9-language push copy), `dto/index.ts`
    (API-local Zod).
- **Touched elsewhere in the API**: `OcrService.parseReceiptText` in
  `apps/api/src/modules/ai/services/ocr.service.ts`; the tier-2 hook in
  `apps/api/src/modules/encryption/encryption.service.ts`; the backup exclusion in
  `apps/api/src/modules/backups/backups.service.ts`; `SubscriptionsService.refundAiUsage`.
- **Schema**: `InboundMailAddress` and `InboundReceipt` in `apps/api/prisma/schema.prisma`,
  migration `apps/api/prisma/migrations/20261010000000_add_inbound_mail/`. Types:
  `packages/shared-types/src/entities/inboundMail.ts`.
- **App**: `app/settings/email-receipts.tsx` →
  `src/components/settings/email-receipts/EmailReceiptsSettings.tsx` (with
  `ForwardingGuide.tsx` and `VerificationCodeCard.tsx`); `app/inbox/email-receipts.tsx` →
  `src/components/inboundMail/EmailReceiptsInbox.tsx`; `app/inbox/email-receipt.tsx` →
  `src/components/inboundMail/EmailReceiptConfirm.tsx`; `src/components/inboundMail/InboundReceiptsBanner.tsx`
  on the Expenses tab; `src/stores/inboundReceiptStore.ts`; `src/services/inboundMail.api.ts`;
  `src/features/inboundMail/` (`inboundMail.ts`, `seedFromInbound.ts`, `documentUri.ts`); the
  `inbound_receipt` push case in `src/services/notifications.ts`. All paths are under
  `apps/mobile/`. The copy is the `emailReceipts` i18n namespace.
- **User docs**: `user_docs/*/04-voice-and-receipt.md`, section *Forwarding e-receipts by e-mail*.

## Key concepts

**The path of one message.**
```
sender MTA ──SMTP :25──▶ budget-inbound-mail-prod (inbound-mail-net only)
   RCPT TO   → POST /api/v1/internal/inbound-mail/rcpt      { token, remoteIp } → accept | unknown | limited
   DATA      → byte caps → mailauth (SPF/DKIM/DMARC/ARC) → worker: mailparser + html-to-text
             → pick ONE document → POST /api/v1/internal/inbound-mail/messages
   reply     → 250 only after the API answered 202 (persisted), 409 (already stored) or 422 (recorded as unsupported)
             → 451 on API down, 5xx or timeout; 452 on a per-address cap; 550 on unknown token / auth fail
budget-api-prod → InboundReceipt(status=received) → 202 → fire-and-forget process(id)
App → push / Expenses-tab banner → inbox → existing receipt confirm card → normal expense create
    → POST /inbound-receipts/:id/confirm { expenseId }
```
The container has **no spool**. The API is the only state. A sender MTA retries a `451` for days,
so an API redeploy loses no mail.

**The internal API is protected three ways.** Each layer is independent of the others:
1. `shared-nginx` answers `404` to `location ~* ^/api/v1/internal/` on the public vhost. The match
   is a **case-insensitive regex** because Express routing is case-insensitive:
   `/api/v1/INTERNAL/…` reaches the same handler, and a prefix location would be bypassed by
   changing one letter.
2. `InternalSecretGuard`, on the controller class:
   - refuses any request carrying `X-Forwarded-For` or `X-Real-IP`, because nginx adds both to
     every proxied request;
   - requires the TCP peer (`req.socket.remoteAddress`, never a header) to be inside
     `INBOUND_MAIL_INTERNAL_CIDR`, which defaults to RFC1918;
   - compares `X-Inbound-Secret` against `INBOUND_MAIL_SHARED_SECRET` with `timingSafeEqual`. A
     secret shorter than 32 characters refuses every request.
3. The container shares only `inbound-mail-net` with `api`. It is not on `budget-network`, so it
   has no route to Postgres or Redis.

**The SMTP side.**
- `smtp-server` is a receive-only library with no outbound path, and AUTH is disabled.
- A recipient on any domain other than `INBOUND_MAIL_DOMAIN` is answered `550 5.7.1` before the API
  is asked. A `+subaddress` is stripped, and the local part must be `[a-z2-7]{16}` (80 random bits).
- **Authentication policy:** a message is rejected when DMARC fails with `p=reject`/`quarantine`
  and there is no ARC pass from a trusted sealer (Google, Outlook/Microsoft). It is also rejected
  when neither SPF nor any DKIM signature passes.
- **Document choice:** files are identified by magic bytes, never by `Content-Type`. Allowed: PDF
  ≤ 10 MB, JPEG/PNG/WebP/HEIC ≤ 8 MB, and inline images under 4 KB are dropped as tracking
  pixels. Archives are never opened. One level of `message/rfc822` is re-parsed (Outlook's
  "forward as attachment"). One document per message: a receipt-named PDF, else the first PDF,
  else the first image, else the text body.
- **Bounds:** 15 MB per message, enforced on the stream; 64 MB of raw DATA across all sessions;
  60 s per DATA upload; a 25 s deadline on authenticate + parse; at most 2 messages parsed at once.
- **Logs** carry an 8-character token hash and the sender domain, never the address, subject or
  body.

**The staging table, and "AI proposes, the user confirms".** A message becomes an `InboundReceipt`
row, never an `Expense` row. Statuses:
`received → processing → pending → confirmed | dismissed`, or one of the terminal outcomes
`duplicate`, `not_a_receipt`, `quota_exceeded`, `unsupported` and `failed`. Only the client creates
the expense, through the normal offline-first create path, with `source: 'ocr'`. Then it calls
`/confirm`, which resolves the expense by `OR:[{id},{clientId}]` inside the account. One expense
backs at most one inbound receipt. `seedFromInbound` maps the stored extraction onto
`useReceiptScanner`'s state, so the duplicate banner and the ABA-630 "Merge into one expense" box
come along for free. `possibleDuplicate` is **recomputed at read time** in `detail()`; it is never
read from the stored JSON.

**Dedup.** The row is unique on `(userId, messageIdHash)`. For a message with a document, the
stored `messageIdHash` is `inboundDedupKey(messageIdHash, contentHash)`, a hash of both. A sender
who reuses one Message-ID with a different body therefore cannot suppress a later, genuinely
different receipt. An exact repeat is a `409`, and the container answers `250`.
- **Content hash:**
  - a file: `receiptFingerprint(base64)`, the ABA-603 rule, so a mailed PDF and the same PDF
    shared to the app fingerprint identically;
  - text: `sha256` of the whitespace-collapsed, lowercased text.
- The API **recomputes** the kind, the byte caps and the content hash from the payload. It does
  not trust the internet-facing container's claims.

**Processing (`InboundReceiptProcessorService.process`).**
1. **Claim the row.** A `processing` row is re-claimable only after `STUCK_AFTER_MS` of silence, so
   the requeue cron cannot re-run, and re-charge, a row still being worked on.
2. **Target at tier 2?** The target account may have moved to tier 2 since the mail was accepted.
   If so, the row ends as `failed`/`E2EE_UNSUPPORTED` and its document is cleared.
3. **A forwarding verification** goes to `pending` with an immediate push, no AI and no throttle.
4. **Dedup, no AI:** the content hash equals a `pending`/`confirmed` row of the same user, or an
   `Expense.receiptFingerprint` in the account. Either one → `duplicate`.
5. **Pre-filter, no AI:** a text-only document with no amount next to a currency → `not_a_receipt`.
6. **Charge one receipt scan:** `trackAiUsage(userId, 'ocr', 2.0, accountId)` on the address owner.
   A `ForbiddenException` → `quota_exceeded`, plus at most one quota push per day.
7. **Extract:** `parseReceiptPdf`, `parseReceipt` or `parseReceiptText`, with only the neutral hint
   "Source: forwarded e-mail from <sender domain>". **The subject is never passed** to the model.
8. **No total, or a zero total** → `not_a_receipt`, and the charge is **refunded** through
   `refundAiUsage`.
9. **Otherwise** → `pending`, plus one batched push per 10 minutes (`setIfAbsent`).

Every final write is guarded on `status = 'processing'`. A row the user dismissed, or the purge
deleted, while the model was running is never brought back.

**Per-address caps (20 per hour, 60 per day).**
- **RCPT only peeks** at the counters.
- **Ingest reserves atomically:** it calls `incrementWindow` first, then compares, so concurrent
  messages cannot all pass a peek. A count over the cap is a `429` → SMTP `452`.
- **Every Redis call on this path fails closed.** An outage is a `503` → SMTP `451`, so mail is
  delayed, not accepted unmetered.
- **Bad recipients have two penalty boxes:** 10 bad RCPTs from one IP in 10 minutes make every
  token read `unknown` from that IP for an hour. One box is in Redis on the API (durable). The
  other is in the container's memory and resets on restart.

**Nothing in a mail is fetched.**
- `html-to-text` drops links and images, so a tracking pixel never fires.
- `parseReceiptText` sends exactly one text message, with no `image_url` and no `file` part, and
  replaces every `http(s)://`/`www.` URL with a placeholder before the text reaches the prompt.
- Image and PDF documents go to the model as their own bytes.
- E-paragon links ("view your receipt at …") are not followed, so such a mail ends as
  `not_a_receipt`.

**Gmail forwarding verification.** Gmail confirms a new forwarding address by mailing it a code.
The container treats a message as a verification only when **all** of these hold, in
`src/extract.ts` and `src/gmailVerification.ts`:
- From, Subject and Date each appear exactly once (`headers.ts`);
- mailauth saw exactly one header From, and it equals `forwarding-noreply@google.com`;
- a DKIM pass for `d=google.com` (or a subdomain) that mailauth reports as aligned with that From;
- the mail is addressed to the very RCPT token it arrived on;
- its Date is within 30 minutes of now.

Anything else is handled as an ordinary message. The code is stored with a **30-minute** expiry
(`VERIFICATION_RETENTION_MS`), and only the newest one per user is kept. **The push never carries
the code.** It only says "open the app". The code is shown only in Settings → E-mail receipts,
which polls while focused.

**End-to-end encryption.**
- **Tier 2 is unsupported.** Creating or retargeting an address onto a tier-2 account is
  `400 E2EE_UNSUPPORTED`. `resolveActive` refuses a tier-2 target at RCPT time, so the sender gets
  `550`. Raising an account to tier 2 disables every address that targets it and deletes its
  non-terminal rows, in the same transaction as the tier change.
- **Tier 1 is allowed**, with a disclosure in Settings. The expense is encrypted client-side at
  confirm through the normal create path, and the readable pending copy expires in **7 days**
  instead of 30.

**Retention and purge.**
- Receipt rows expire after 30 days (7 at tier 1), and verification rows after 30 minutes.
- `document` and `documentText` are nulled at confirm, dismiss, `duplicate` and `not_a_receipt`.
- The raw e-mail is never stored: no headers beyond sender, subject and auth verdicts, and no body
  other than the chosen document.
- **Crons:**
  - every 10 minutes, rows stuck in `received`/`processing` are re-run, and become `failed` after
    3 attempts;
  - daily at 03:30, `paginateById` hard-deletes rows past `expiresAt`. This purge runs **even
    with the flag off**.
- Rows cascade on user and account deletion. They are excluded from account backups.

**Addresses.** One address per user, with a target account the user picks (owner or editor
only):
- A mailbox belongs to a person, so co-members of a shared account never see each other's
  forwarded mail.
- Moving receipts to another account is a settings change, not a new Gmail rule.
- **Rotate** issues a new token. The old one stops resolving in the same write, with no grace
  period.
- **Disable** sets `disabledAt`, and creating the address again issues a fresh token.

**The flag and the container toggle are two separate switches.**
- `INBOUND_MAIL_ENABLED`, read by the API:
  - anything but `true` makes every user-facing route `404` (`InboundMailEnabledGuard`);
  - `rcpt` answers `unknown` and `ingest` answers `404`, so the container returns `550`;
  - processing and the requeue cron no-op.
  - The app treats a `404` on the gate routes as "feature unavailable" and hides the Settings
    entry, the registry pane and the banner.
- `INBOUND_MAIL_CONTAINER`, read only by `scripts/deploy.sh` and `scripts/infra-check.sh`:
  - unless it is `true`, the `inbound-mail` profile is never built or started, and host port 25
    stays closed;
  - with it on, `deploy.sh` runs `up -d` with no `--force-recreate`, so an unrelated deploy does
    not drop SMTP sessions;
  - `api` always joins `inbound-mail-net`, so turning the container on never needs an API
    recreate.

## Invariants
- **Never auto-save an expense from mail, under any condition.** An e-mail is attacker-writable.
  Even one that passes SPF/DKIM only becomes a pending proposal, and the user's confirm is the
  security boundary. It is also what makes tier-1 encryption work, because the client encrypts on
  create.
- **The SMTP reply is `250` only after the API persisted the message.** The container has no queue.
  A `250` sent earlier would lose the mail on an API restart, while a `451` costs nothing because
  the sender retries.
- **Never bounce.** Every rejection happens in-session (`5xx`), and an unusable message is accepted
  and recorded as `unsupported`. A generated bounce would be backscatter to a forged sender.
- **The nginx block must stay a case-insensitive regex**, placed above any other regex location
  that matches `/api/v1/`. A prefix `location ^~` is bypassed by `/api/v1/INTERNAL/`, because
  Express does not care about case.
- **`InternalSecretGuard` reads the peer address from the socket, never from a header.** It stays
  class-level on the internal controller, so no route or casing reaches a handler without it.
- **The container gets no `env_file`, no `budget-network`, and never all of `/etc/letsencrypt`.**
  It is an internet-facing parser:
  - its only secret is the shared one;
  - it mounts only the mail-in certificate pair, which the certbot hook copies to
    `/opt/ai-budget/inbound-mail-tls`. Mounting `/etc/letsencrypt` would hand it the private keys
    of `api.`, `admin.` and the apex.
- **Per-address caps reserve with `incrementWindow` before comparing, and fail closed.** A peek
  would let concurrent messages all pass. Swallowing a Redis error would turn an outage into
  unmetered AI spend on a victim's quota.
- **No AI request before the dedup check and the text pre-filter, and a "not a receipt" result is
  refunded.** A careless "forward everything" rule must not burn the user's quota on mail they
  never chose to scan.
- **Nothing named in a mail is ever fetched, and the subject never reaches the model.** Fetching
  would tell the merchant the mail was opened and is an SSRF path. The subject is
  attacker-controlled text.
- **A forwarding code is trusted only under every check above, and is shown only in the app.** It
  is the one value this path writes on a user's behalf. A spoofed code planted in a victim's app
  could get the victim to confirm an attacker's forwarding address. A code in a push would sit on
  the lock screen.
- **The stored dedup key is the hash of Message-ID and content.** A Message-ID alone would let
  one reused header suppress every later receipt from that sender.
- **Tier 2 is refused at create, at RCPT and at processing, and the upgrade hook runs inside the
  tier-change transaction.** The server must never hold a readable pending expense for a tier-2
  account.
- **Every user-facing `:id` route filters on `id AND userId AND accountId`, and a miss is `404`.**
  A shared account's co-members must not be able to see, or probe, each other's forwarded mail.
- **The expiry purge must keep running with the flag off.** Turning the feature off must not leave
  stored documents past their retention.

## Known gaps
- **Not activated.** Every production step is manual and none has been run. They are, in order:
  1. check that port 25 is free on the VPS;
  2. the DNS records at microhost.pl (`mail-in` A, `in.` MX, SPF `-all`, DMARC `p=reject`);
  3. the Hetzner Cloud Firewall rule for inbound 25;
  4. the `shared-nginx` block;
  5. the dedicated `mail-in.ai-budget.pl` certificate and its deploy hook;
  6. `INBOUND_MAIL_SHARED_SECRET`, also in the offline copy of `.env.production`;
  7. the DOCKER-USER egress rules;
  8. `INBOUND_MAIL_CONTAINER=true`, then the swaks tests and a real Gmail and Outlook setup;
  9. only then `INBOUND_MAIL_ENABLED=true`.

  The order and the commands are in [`docs/ops/inbound-mail.md`](../../ops/inbound-mail.md).
- **The container image has never been built locally or against the internet.** The unit and
  socket-level integration tests pass. The Dockerfile, the cert hook and the egress rules are
  unexercised.
- **`mailauth` runs in-process and cannot be aborted.** The 25 s deadline frees the SMTP slot and
  answers `451`, but pathological DKIM/SPF work keeps running on the main thread until it finishes.
  Only the mailparser/html-to-text half runs in a terminable worker. The 2-message gate, the byte
  budget and the DATA timeout bound the damage. The next step, if it shows up in practice, is to
  move `mailauth` into the worker too.
- **The push carries no `accountId`.** The inbox lists only the current account's items, so a push
  for a receipt routed to another account opens an inbox that does not show it until the user
  switches accounts.
- **PDFs and text bodies are not attached to the saved expense.** `useReceiptSave` attaches only an
  image, as with share-to-capture. Only an image document is previewed and offered for storage.
- **The desktop web build reuses the phone layouts.** The settings pane comes through
  `settingsRegistry`, and the inbox and confirm screens are not redesigned for ≥1024 px. The desktop
  dialog is Phase 2 (`aba-web-designer` → `aba-web-engineer`).
- **The spec's other Phase 2 items are not built:**
  - more than one receipt per message;
  - following allow-listed e-paragon links;
  - rendering HTML bodies to an image;
  - a per-user sender allow-list;
  - DNSBL and MTA-STS (STARTTLS is opportunistic only);
  - admin metrics;
  - bot notifications;
  - income e-mails.
- **Pricing:** free on every tier within the AI quota. The spec left "Pro-only?" open, and the code
  ships it free.

## History
- [ABA-644](https://github.com/micode-ai/ai-budget-assistant/issues/674) — the whole feature:
  - the API module behind the flag;
  - the receive-only SMTP container, its compose profile and the ops runbook;
  - the app's settings screen, inbox and banner;
  - then two hardening passes after the `aba-security` audit, one for the API and one for the
    container.

  **What the audit changed relative to the spec:**
  - The `InternalSecretGuard` gained the private-CIDR socket check, and the secret now has a
    32-character floor.
  - The nginx block became a case-insensitive regex.
  - The per-address caps moved from peek-at-RCPT to an atomic reservation at ingest.
  - The dedup key folds in the content hash.
  - The not-a-receipt charge is refunded.
  - The forwarding-code checks gained the duplicate-header, single-From, alignment, addressed-to
    and freshness rules, and the code's retention dropped from 24 h to 30 minutes.
  - The container got a terminable parse worker, a global byte budget, `cap_drop: ALL`, a read-only
    rootfs, a dedicated certificate instead of the `/etc/letsencrypt` mount, a 384 MB limit (the
    spec planned 192 MB) and a weekly `npm audit` workflow.
