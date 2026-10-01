# Chat architecture

*Hub: [ai-features](../ai-features.md) · related: [shared-conversations](shared-conversations.md),
[chat-conversation-management](chat-conversation-management.md),
[chat-undo-last-action](chat-undo-last-action.md), [safe-to-spend](safe-to-spend.md),
[goals](goals.md)*

## What this is

The AI chat: a user asks a financial question or gives a command in natural language ("add 40 for
groceries", "how much did I spend on fuel in May", "Anna paid me back 50"), and the API answers from
the account's data or proposes a write for the user to confirm. One pipeline serves the mobile app,
the web app and all three bots (Telegram, WhatsApp, Slack) — they all call the same `ChatService`.

## Entry points

- `apps/api/src/modules/ai/ai.controller.ts` — the `chat/*` routes (class-level
  `JwtAuthGuard + AccountContextGuard`)
- `apps/api/src/modules/ai/services/chat.service.ts` — `ChatService.chat()`, the orchestrator; every
  other public method is a one-line delegation
- `apps/api/src/modules/ai/services/chat-action-lifecycle.service.ts` — pending write → confirm /
  reject, the undo request, `detectConversationLanguage`
- `apps/api/src/modules/ai/services/chat-conversation.service.ts` — Redis presence and all
  conversation CRUD (list, messages, poll, share, rename, delete, pin)
- `apps/api/src/modules/ai/services/ai-tools.service.ts` — the tool dispatcher: `getToolDefinitions`,
  `isWriteAction`, `executeAction`, `executeWithCache`, `buildToolCacheKey`
- `apps/api/src/modules/ai/services/ai-tool-schemas.ts` — data-only tool schemas and
  `AI_WRITE_ACTION_TYPES`
- Domain handlers: `apps/api/src/modules/ai/services/ai-expense-tools.service.ts`,
  `apps/api/src/modules/ai/services/ai-budget-tools.service.ts`,
  `apps/api/src/modules/ai/services/ai-debt-goal-tools.service.ts`,
  `apps/api/src/modules/ai/services/ai-shopping-tools.service.ts`,
  `apps/api/src/modules/ai/services/ai-undo-tools.service.ts`
- `apps/api/src/modules/ai/services/user-context-builder.service.ts` — `UserContextBuilder`, `ucKey`
- `apps/api/src/modules/ai/services/prompt-builder.service.ts` — system prompt, language detection,
  action summaries
- `apps/api/src/modules/ai/services/model-resolver.ts` — `resolveAiModel` (the user's `aiModel`
  preference) and `resolveCheapModel`
- Mobile: `apps/mobile/app/(tabs)/chat.tsx`, `apps/mobile/src/stores/chatStore.ts`,
  `apps/mobile/src/db/chatRepository.ts`, `apps/mobile/src/components/chat/` (`ActionConfirmationCard`,
  `ActionResultCard`, `ChatHistorySheet`)

## Key concepts

### Service boundaries

`ChatService` owns only the orchestration of one turn. Its helpers are `AiModule` providers, none
exported:

| Provider | Owns |
|---|---|
| `UserContextBuilder` | the `UserContext` snapshot of the account (totals, budgets, goals with ids, active debts with ids, …) |
| `PromptBuilder` | system prompt, `detectLanguage`/`detectUserLanguage`, `buildActionSummary` and the localized result texts |
| `AiToolsService` | tool schemas, read/write classification, dispatch, the read cache |
| `ChatActionLifecycleService` | pending write → confirm / reject, undo request |
| `ChatConversationService` | presence, conversation list and messages, poll, share, rename, delete, pin |

The tool handlers are split by domain behind `AiToolsService`; the dispatcher's switch is the only
place a tool name maps to a handler. **The tool list is the count** — `CLAUDE.md` carries it, and
`AI_TOOL_DEFINITIONS` in `ai-tool-schemas.ts` is the source.

### One turn of `chat()`

1. **Full E2EE refuses up front.** An account at `encryptionTier >= 2` gets a fixed "unavailable"
   reply with `encryptionRestricted: true` and no model call — the amounts are ciphertext on the
   server.
2. **Resolve the conversation** with the access predicate `id + accountId AND (isShared OR userId =
   me)`; if none matches, a new conversation is created (title = the message's first 100 chars).
3. **Persist the user message** (`senderUserId`, `mentionedUserIds`). In a shared conversation, a
   message that mentions co-members stops here — no AI reply, a push to absent mentionees (see
   [shared-conversations](shared-conversations.md)).
4. **Build context** (`UserContextBuilder.build`, cached) and the system prompt, then call the model
   with every tool, `tool_choice: 'auto'` and `parallel_tool_calls: false` — only the first tool call
   is handled, so without that flag a compound request would silently drop its second half.
5. **Route the tool call**:
   - `add_to_shopping_list` / `remove_from_shopping_list` — execute immediately, own branches, BEFORE
     the write check ([shopping-list](shopping-list.md#from-the-ai-chat)).
   - a write (`isWriteAction`) — a viewer gets a localized refusal; `undo_last_action` goes to
     `handleUndoLastActionRequest`; everything else to `handleWriteActionRequest`.
   - anything else is a read — `handleReadAction`, through `executeWithCache`, then a narration
     call on the cheap model.
6. No tool call → the model's text is the reply.

The main reasoning call uses the model the user chose (`User.aiModel` via `resolveAiModel`);
narration and other short formatting calls use `resolveCheapModel()`. Specific model ids live only
in `model-resolver.ts`.

### The confirmation flow

A write never executes on the turn that proposed it. `handleWriteActionRequest` stores a
**`ChatMessage` with `role: 'pending_action'`** whose JSON content is the `ChatPendingAction`
(`id`, `actionType`, `data` = the model's arguments, `displaySummary`) plus the `accountId`, with
`senderUserId` = the proposer. The client renders `ActionConfirmationCard`; bots render the summary
with generic confirm/cancel buttons.

`POST /ai/chat/confirm {conversationId, actionId}` (`ChatActionLifecycleService.confirmAction`):

1. conversation must pass the same access predicate;
2. it loads the **newest** `pending_action` row in that conversation **from this caller**
   (`senderUserId = me`) and requires its `id` to equal `actionId`;
3. executes through `AiToolsService.executeAction` under the account stored in the pending row;
4. rewrites that same row to `role: 'action_executed'` with `status: 'executed'` and the
   `ChatActionResult` — this row is what [undo](chat-undo-last-action.md) later reads;
5. writes an assistant message with the localized result.

`reject` mirrors it, rewriting the row to `role: 'action_rejected'`. Because the row changes role,
a second confirm of the same card finds nothing and 404s.

Which tools are writes is `AI_WRITE_ACTION_TYPES`: the `create_*` tools, `record_debt_repayment`,
`create_debt`, `update_goal_balance`, `undo_last_action`. `check_affordability` is deliberately a
read. The two shopping-list writes are deliberately neither — they never queue.

### Read actions and their cache

`executeWithCache` keys a read on `chat:{actionType}:{accountId}:{baseCurrency}:{sorted-args JSON}`
with a 10-minute TTL. `baseCurrency` is the caller's `user.currencyCode`: two members of one
account with different display currencies would otherwise share a wrongly converted answer.
Expense writes bust these keys through `invalidateExpenseChatCache` (`expense-cache.util.ts`),
whose bust list is **per tool** — a new cached read tool must be added there.

### Debts and goals from chat

- `create_debt(contactName, amount, currencyCode, direction, dueDate?)` → `DebtsService.createDebt`:
  a **lent** debt is an `Expense`, a **borrowed** one an `Income`, both with `isDebt = true`.
- `record_debt_repayment(debtId, amount, date?)` → `DebtsService.recordRepayment`, which resolves
  `debtId` by `id` OR `clientId` and books the repayment as the opposite kind of row.
- `get_debt_summary()` is a cached read.
- `update_goal_balance(goalId, newAmount)` → see [goals](goals.md).

The model never searches for a debt or goal: `UserContext.activeDebts` and `savingsGoals` carry the
ids, so the model picks one from context, and an ambiguous name is the model's cue to ask.

### UserContext caching

`UserContextBuilder.build()` caches under `uc:{accountId}` (`ucKey`) for 60 s. Expense writes
(`invalidateExpenseChatCache`) and income writes (`IncomesService` create/update/remove,
`IncomeBulkService`) delete it so the next turn sees the write. `context.monthlyBudget` sums
**every** active monthly budget, category-allocated ones included — excluding those once made the
model tell users with only allocated budgets that they had no budget.

### Language

`PromptBuilder.detectUserLanguage(message, history, uiLanguage)` resolves the reply language in
three tiers:

1. the **current message** (`detectLanguage`) when it is unambiguous;
2. the user's **app UI locale** (`user.language` → `localeToLanguageName`) for plain-ASCII or
   ambiguous text;
3. recent assistant replies — a legacy fallback for clients that never sent a locale.

`detectLanguage` decides on letters unique to a language:

- **Cyrillic** (ratio above 0.3): `ў` → Belarusian first; then `ї/є/ґ` → Ukrainian; then `і` →
  Belarusian if `ы`/`э` also appear (Ukrainian lacks them), else Ukrainian; otherwise Russian.
- `äöüß` → German; Polish diacritics → Polish.
- **French vs Spanish** on unique letters only — the shared `é` decides nothing. Ambiguous Latin
  text returns English so tier 2 can resolve it.
- Dutch by a small function-word list.

Confirm and reject do not get the turn's message, so `detectConversationLanguage` runs the same
three tiers over the conversation's recent user messages **with the UI locale** — a confirmation
answers in the user's language even when their messages were plain ASCII.

### Currency in the conversation

The system prompt maps currency symbols to ISO codes (`₴`, `$`, `€`, `zł`, `£`, `₽`, `Br`) so the
model can fill `currencyCode` from "50 zł". Every amount in tool results carries its own
`currencyCode`; the prompt passes the caller's display currency only as the default for a total
that has none. Server-side conversion of totals is on
[display-currency-conversion](display-currency-conversion.md).

### Endpoints

All under `JwtAuthGuard + AccountContextGuard`:

| Route | Notes |
|---|---|
| `POST /ai/chat` | `AiUsageGuard`, metered as `chat` |
| `POST /ai/chat/confirm` | `AccountRoleGuard` + `@RequireRole('editor')` + `AiUsageGuard`, metered at half a chat request |
| `POST /ai/chat/reject` | no metering |
| `GET /ai/chat/conversations` | pinned (unbounded) + most recent 20, merged |
| `GET /ai/chat/conversations/:id/messages` | `user`/`assistant` roles only, sender names resolved |
| `GET /ai/chat/conversations/:id/poll?since=` | newer messages, refreshes presence |
| `PATCH /ai/chat/conversations/:id/shared` | creator only |
| `PATCH …/:id/title`, `DELETE …/:id`, `PUT …/:id/pin` | [chat-conversation-management](chat-conversation-management.md) |

### History on the device

`ChatConversation` (`accountId`, `isShared`, `title`) and `ChatMessage` (`role`, `content`,
`senderUserId` — a soft reference with no FK so shared history survives a deleted author —
`mentionedUserIds`, `tokensUsed`) live on the server. `role` is one of `user`, `assistant`,
`system`, `pending_action`, `action_executed`, `action_rejected`; only the first three ever reach
the model, and only `user`/`assistant` reach the client. Mobile caches conversations in SQLite
(`chatRepository.ts`) and loads them with `chatStore.loadConversations()` /
`loadConversation(id)`; the chat tab's history sheet is `ChatHistorySheet`.

## Invariants

- **A write only ever executes from `confirmAction`**, never on the turn that proposed it. The
  exceptions are named and few — the two shopping-list tools — and each has its own branch BEFORE
  the `isWriteAction` check; a new immediate write must do the same, or it falls through to the
  read path, gets cached and costs a narration call.
- **Confirm/reject are scoped to the proposer** (`senderUserId = me` on the pending row), not only
  to the conversation. In a shared conversation any member can see a card, and without this one
  member could execute another's write.
- **Viewers are refused twice**: in `chat()` before a pending row is ever written, and by
  `@RequireRole('editor')` on confirm. Undo is a write and is refused the same way.
- **Every read-tool cache key carries `baseCurrency`** — the account is shared, the display currency
  is not.
- **An account at `encryptionTier >= 2` never reaches the model.** Its data is ciphertext; a model
  answer over it would be invented.
- **Every conversation query carries the access predicate** `accountId AND (isShared OR userId =
  me)` — list, messages, poll, chat, confirm, reject.
- **New code goes to the provider that owns it**: a tool handler on its domain service, conversation
  management on `ChatConversationService`, confirmation/undo on `ChatActionLifecycleService` —
  never inline in `chat()`. Both splits below happened because it regrew.
- **Language detection decides on letters unique to a language.** A letter two languages share
  (`é`, Cyrillic `і`) must not decide between them on its own.

- **History is the conversation's tail.** `chat()` reads the last 20 messages newest-first and
  reverses them; `getConversationMessages` returns the last 50 (or, with `since`, the next 50 after
  it). Both once read `asc` + `take` and froze long conversations at their first messages (ABA-626).
- **A pending action expires after `PENDING_ACTION_TTL_SEC` (30 min)**, the same lifetime the bots
  give theirs; confirming a stale one is a 404, rejecting it still works.
- **The device cache applies the server's predicate** — `account_id = current AND (is_shared OR
  user_id = me)`, and `loadConversations` stamps each cached row with the account it was fetched
  for. Rows cached before that carry no account and stay hidden until the next fetch re-stamps them.

## Known gaps

- Goal and debt writes do not delete `uc:{accountId}`; the 60 s TTL is what refreshes them.
- The invalidators type `` `uc:${accountId}` `` by hand instead of importing `ucKey`.
- There is no knowledge base: the chat answers from `UserContext` plus tools and cannot answer
  questions about the app itself.

## History

- ABA-119 — `chat.service.ts` split into an orchestrator plus `UserContextBuilder`,
  `AiToolsService`, `PromptBuilder`.
- ABA-151 — `uc:{accountId}` context cache and its invalidation on writes.
- ABA-264 — the three-tier language rule; the bug was a French UI getting Spanish replies because the
  shared `é` read as Spanish, after which history locked the wrong language in.
- ABA-344 — `monthlyBudget` counts category-allocated budgets.
- ABA-591 — `ai-tools.service.ts` split: schemas to `ai-tool-schemas.ts`, handlers to five domain
  providers (tech-debt `ai-tools-service-god-file`).
- ABA-592 — `chat.service.ts` regrew to roughly its pre-ABA-119 size and was split again into
  `ChatConversationService` and `ChatActionLifecycleService` (tech-debt
  `chat-service-regrowth-after-split`). `detectConversationLanguage` went to the lifecycle service
  because its only callers are confirm and reject.
- 2026-10 — Belarusian/Ukrainian detection fixed (`ў` first, `і` alone no longer means Ukrainian);
  confirmations use the UI-locale tier.
