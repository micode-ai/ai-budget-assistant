# Contact the developer

*Hub: [api](../api.md) · see also [telegram-bot](../telegram-bot.md), [admin-dashboard](../admin-dashboard.md)*

## What this is

A one-thread-per-user support chat from the app to the developer. The user writes in any language;
the developer reads and answers in his own (`SUPPORT_DEVELOPER_LANGUAGE`, default `ru`), either in
the admin dashboard or by replying to a card in a **separate** Telegram support bot. Each side sees
the other's text translated, with the original one tap away. Replies arrive as a push.

## Entry points

- `apps/api/src/modules/support/` — `support.controller.ts` (user routes), `support-admin.controller.ts`,
  `support-telegram.controller.ts` (webhook), `support.service.ts`, `support-admin.service.ts`,
  `support-telegram.service.ts`, `support-translation.service.ts`, `support-unread.ts`,
  `support-forwarder.ts` (the `SUPPORT_FORWARDER` token), `support-i18n.ts`, `dto/index.ts`
- Migration `20261127100000_support_threads` — `SupportThread` (unique `userId`, `status`, `muted`,
  `autoTranslate`, unread counters) and `SupportMessage` (`author`, `body`, `bodyLang`,
  `translatedBody`, `context`, unique `telegramMessageId`, `readAt`)
- Admin: `apps/admin/src/app/support/page.tsx`; realtime event `admin:support-unread` in `admin.gateway.ts`
- App: `apps/mobile/app/support.tsx`, `src/components/support/` (phone + desktop web),
  `src/features/support/` (`useSupportThread`, `collectSupportContext`, `supportPolling`, `openSupport`),
  entry row in Settings (`SettingsHubMobile.tsx`) with an unread marker
- Ops: `docs/ops/support-bot.md`

## Key concepts

**Routes.** User: `GET /support/thread`, `POST /support/messages`, `POST /support/thread/read`,
`PATCH /support/thread` (auto-translate). Admin (`JwtAuthGuard` + `AdminGuard`):
`GET /admin/support/unread-count`, `GET /admin/support/threads`, `GET /admin/support/threads/:id`,
`POST /admin/support/threads/:id/reply`, `PATCH /admin/support/threads/:id` (status, muted),
`POST /admin/support/messages/:id/translate`. Webhook: `POST /support-telegram/webhook`
(no `/api/v1` prefix).

**Forwarding.** `SupportService` calls a `SupportForwarder` (optional injection, resolves to
`SupportTelegramService`) after the message is stored. The card's Telegram `message_id` is saved on
the `SupportMessage`; that id is the only way a Telegram reply finds its thread.

**Send limit.** 10 messages per user per 24 hours (Redis window); a Redis outage logs a warning and
lets the message through.

**Context.** Every send carries a `SupportContext` (app version, platform, locale, tier, account
type, source route) shown on the developer's card.

## Invariants

**The thread is user-scoped.** The controller is `JwtAuthGuard` only — never `AccountContextGuard` —
and every query filters by `userId`. The app client therefore sends `skipAccountScope`, so a demo
account and a stale `X-Account-Id` header cannot block a user from reaching the developer.

**Never guess the recipient of a Telegram reply.** The thread is resolved ONLY from
`reply_to_message.message_id` → `SupportMessage.telegramMessageId`. A plain message or an unknown
reply gets a "reply to a card" hint; there is no "last active thread" fallback, which would send one
user's answer to another. Only the configured `SUPPORT_TELEGRAM_CHAT_ID` is listened to.

**A shadow mute stays invisible to the user.** A muted thread stores the message but sets no
`readAt`, bumps no unread counter, sends no Telegram card, and returns the same response as an
unmuted one. Do not add any user-visible difference.

**The original is always reachable.** Translation is stored next to `body`, never replaces it; the
app can always show the original.

**Translation never counts against the AI limit.** It is logged with `logUsageWithoutLimit` as the
`support_translation` feature, so cost shows up in admin but a user cannot be refused a reply
because of their quota.

**Deactivation hard-deletes the thread.** A deactivated user must leave no support text behind
(`SupportThread` also cascades from `User`). A reply to an inactive user answers the developer with
an "inactive" notice instead of sending.

**The support bot never touches `OPS_TELEGRAM_*`.** It has its own token, chat id and webhook; ops
alerts and support cards must never share a bot or a chat.

**`/support-telegram/webhook` stays in `SMALL_BODY_PATHS`** (`common/http/small-body-limit.ts`) and in
`global-prefix-exclusions.ts`. Dropping it from the first loses the body cap on a public route;
dropping it from the second moves the URL under `/api/v1` and Telegram gets 404s. The webhook secret
is checked with `timingSafeEqual`; an unset secret falls back to a random per-process one, registered with setWebhook, so calls are never unauthenticated. The controller ACKs 200 first, then handles the update, deduplicating on `update_id` (`support-tg:update:<id>`, 24 h, fail open on a Redis error) so a Telegram redelivery cannot send the developer's reply twice.

**The context DTO is `forbidNonWhitelisted`.** The app must send exactly the `SupportContext` keys
(`appVersion`, `buildSha`, `platform`, `osVersion`, `locale`, `tier`, `accountType`, `fromRoute`) —
an extra key is a 400 and the user cannot send at all.

**Admin realtime: `admin:support-unread` must not invalidate the open thread query.** Doing so
re-fetched the thread, which emitted again — a refetch loop. `getThread` emits only when the unread
count actually changed.

## Known gaps

- The developer language is one env value, not per admin.
- Text only (4000 characters); no attachments.

## History

- 2026-11-27 — [ABA-856](https://github.com/micode-ai/ai-budget-assistant/issues/894): module, admin page, app screen, separate support bot. Concept chosen from three (thread inbox / AI-chat escalation / per-screen feedback); Telegram replies go through a dedicated bot because the ops bot is shared with other projects and Telegram allows one webhook per bot. Design: `docs/superpowers/specs/2026-11-27-contact-developer-design.md`.
