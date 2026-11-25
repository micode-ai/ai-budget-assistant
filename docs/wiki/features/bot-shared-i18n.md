# Shared bot i18n

*Hub: [telegram-bot](../telegram-bot.md) · [whatsapp-bot](../whatsapp-bot.md) · [slack-bot](../slack-bot.md)*

## What this is

One dictionary and one `t()` factory for the copy the three chat bots share, replacing three
copy-pasted implementations (tech-debt `bot-i18n-triplication`, closed).

## Entry points

- `apps/api/src/common/bot-i18n/shared-messages.ts`
- `apps/api/src/modules/{telegram,whatsapp,slack}/helpers/i18n.ts`

## Key concepts

**Shared bot i18n (ABA-462).** `common/bot-i18n/shared-messages.ts` holds the ~30-key, 11-language dictionary shared by all three bots (error messages, confirmations, menu labels, category-flow copy) plus a `createBotT(messages, { markup, defaultParams })` factory and the shared `buildCategorySplitLine`/`CategorySplitLineItem` — replaced three independently-copy-pasted `messages`/`t()` implementations (tech-debt `bot-i18n-triplication`, closed). Canonical markup is HTML (`<b>`, `<code>`, matching Telegram's own `parse_mode: HTML`); `createBotT(..., { markup: 'markdown' })` regex-converts those tags to WhatsApp/Slack's `*bold*`/`` `code` `` syntax at read time. `defaultParams` (e.g. `{ platform: 'Telegram' }`) is merged under any caller-supplied params, letting a "same template, only the brand word differs" message (`notLinked`) live once with a `{{platform}}` placeholder — no call-site changes needed. Each bot's own `modules/{telegram,whatsapp,slack}/helpers/i18n.ts` is now `{ ...sharedMessages, ...platformMessages }` → `createBotT(...)`, holding only genuinely platform-specific copy: `linkFirst`/`welcomeNew`/`unlinkSuccess`/`helpText` (all three — telegram uses `/slash` commands + HTML-entity escaping, whatsapp/slack don't), `welcomeBack`/`linkSuccess` (shared between whatsapp/slack only; telegram overrides both since it says "/help" not "help"), and Slack's own `thinking` placeholder key. **A new bot-facing string shared by 2+ platforms belongs in `shared-messages.ts`, not copy-pasted into each `helpers/i18n.ts`.**

## Invariants

**A new bot-facing string shared by two or more platforms belongs in `shared-messages.ts`**, never
copy-pasted into each `helpers/i18n.ts`. Canonical markup is HTML; the markdown bots get it
converted at read time by `createBotT(..., { markup: 'markdown' })`.

## History

ABA-462.
