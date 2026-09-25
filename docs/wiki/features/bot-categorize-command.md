# Bot `/categorize` command

*Hub: [ai-features](../ai-features.md) · [slack-bot](../slack-bot.md) · [categorize-uncategorized](categorize-uncategorized.md)*

## What this is

ABA-594. A bot-facing variant of the app's [categorize-uncategorized](categorize-uncategorized.md)
review, reachable from Telegram (`/categorize`), WhatsApp and Slack (`categorize`, no leading
slash — same convention as `category`/`categories` there). Written because that feature's rich
batched-review UI (per-row target picking, collapsible groups, an Apply step) was explicitly out of
scope for a chat interface, but bot-only users — the reason the three bots exist — are the users
most likely to accumulate uncategorized expenses (OCR/voice capture) and least likely to ever see
the in-app nudge banner.

## Entry points

- `apps/api/src/modules/ai/services/categorize-bot.service.ts` — `CategorizeBotService.buildPlan`
  / `.applyStep`, the one place all three bots call into
- `apps/api/src/modules/ai/utils/categorize-bot-plan.util.ts` — `buildBotSteps`, the pure reshape
- `apps/api/src/modules/telegram/handlers/categorize.handler.ts`,
  `apps/api/src/modules/whatsapp/handlers/categorize.handler.ts`,
  `apps/api/src/modules/slack/handlers/categorize.handler.ts` — one per bot, presentation only
- `apps/api/src/common/bot-i18n/shared-messages.ts` — the `categorize*` keys (identical across all
  three bots post markup-conversion, per the ABA-462 bot-i18n convention)

Design: `docs/plans/bot-categorize-command-plan.md`,
`docs/contracts/bot-categorize-command.md`.

## Key concepts

**Reuses the app's engine unchanged.** `CategorizeBotService.buildPlan` calls
`CategorizeSuggestionsService.suggest(accountId)` directly — same `AI_CATEGORIZE_MAX_PER_DAY`
daily ceiling, same 30-minute result cache, same free merchant-rule path. A bot-triggered pass
spends the exact same per-account budget the app does; there is no separate bot quota.

**Sequential, not batched.** The app's review shows every group at once with editable targets;
the bot instead reshapes the same `CategorizeSuggestionsResponse` into a flat, largest-group-first
list (`buildBotSteps`) and walks it one group at a time — reply Yes (file it), Skip, or Stop
(bail out, leaving the rest for a later pass or the app). No per-row edit, no new-category naming
UI beyond what the model already proposed — a plain name string is exactly what
`/category <name>` (all three bots' `CategoryHandler`) already turns into a category with no new
UI, so new-category proposals are included, not skipped.

**Session state is per-user, not per-message, TTL 1800s** — reissuing the command mid-flow
replaces the old session outright:

| Bot | Key | Client |
|---|---|---|
| Telegram | `telegram:catz:{telegramUserId}` | `CacheService` |
| WhatsApp | `wa:catz:{waPhoneNumber}` | raw `WA_REDIS` |
| Slack | `slack:catz:{slackUserId}` | raw `SLACK_REDIS` |

Each bot's own existing convention, unchanged (mirrors `telegram:pa:*` / `wa:pa:*` / `slack:pa:*`).

**Button ids carry the step index**, guarding against a stale tap on an old message: `catz_y:{n}`
/ `catz_n:{n}` / `catz_s:{n}` (Telegram, Slack — `:`-split callback ids) or `catz_y--{n}` (WhatsApp
— `--`-split, since its ids elsewhere embed UUIDs that contain single `-`). A tap whose `n` no
longer matches the session's current `cursor` gets `categorizeAlreadyHandled`, no state change.

**Applying a step always uses the resolved category id/name, never the raw proposal.** For a new
step, `CategorizeBotService.applyStep` calls `CategoriesService.create` first and uses THAT row's
own `id`/`name` for the bulk update — `CategoriesService.create` is idempotent on `(accountId,
name, type)` and may hand back an existing row with different casing than what was proposed. Same
resolved-PK rule as [client-id-resolution](client-id-resolution.md) (ABA-419's tag-service class of
bug): never write with the raw incoming value once a lookup has resolved the real one.

## Invariants

- **No new endpoint, no new DTO.** The bot plan shape (`BotCategorizeStep`) is server-internal —
  it is never sent to a client, so it lives in `apps/api/src/modules/ai/utils/`, not
  `packages/shared-types`.
- **Viewers are blocked before a session is even created** — `accountRole === 'viewer'` short-
  circuits to `viewerRestricted`, mirroring every other bot write handler
  (`CategoryHandler.handle`).
- **A new proposal's category is created before its expenses are bulk-updated**, and the create
  happens only once Yes is tapped for that step — never speculatively while building the plan.

## Known gaps

Out of scope for v1, matching the plan's stated boundaries:

- No per-line amount or FX total in the group prompt — count + name only.
- `skippedEncrypted` (E2EE expenses the server can't read) is not mentioned in the bot's copy;
  the app surfaces it, the bot doesn't yet.
- No proactive nudge — reactive command only, matching the placement discipline for other nudges
  (referral invite, store-rating prompt).
- No handler-level unit tests for the three `CategorizeHandler` classes — the pure plan builder
  (`categorize-bot-plan.util.spec.ts`) and the orchestrating service
  (`categorize-bot.service.spec.ts`) are unit-tested instead; the per-bot presentation layer is
  exercised only by the existing broader bot-service test suites (which cover routing, not this
  flow specifically).

## History

ABA-594 — the feature, shipped for all three bots in one pass (the source idea's own cost
estimate assumed Telegram first, WhatsApp/Slack as follow-ups; the three handlers turned out
small enough, once `CategorizeBotService` existed, to ship together).
