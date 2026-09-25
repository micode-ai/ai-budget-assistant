# Chat undo last action

*Hub: [ai-features](../ai-features.md) · related: [chat-conversation-management](chat-conversation-management.md)*

## What this is

Lets the user say "undo", "cancel that", "delete the last one" (in any language) in AI chat — mobile
or any of the three bots — to revert the single most recent write it confirmed in that conversation:
a just-created expense, income, or debt, a debt repayment, or a savings-goal balance update. Product
idea: `docs/product-ideas/chat-undo-last-action.md`. Plan/contracts:
`docs/plans/chat-undo-last-action-plan.md`, `docs/contracts/chat-undo-last-action.md`.

## Entry points

- `apps/api/src/modules/ai/services/ai-tools.service.ts` — `undo_last_action` tool schema,
  dispatches to `AiUndoToolsService`
- `apps/api/src/modules/ai/services/ai-undo-tools.service.ts` — `executeUndoLastAction`/
  `resolveUndoEntity`/`revertEntityCreate`/`revertGoalBalance` (split out of `ai-tools.service.ts`,
  tech-debt `ai-tools-service-god-file`)
- `apps/api/src/modules/ai/services/chat-action-lifecycle.service.ts` — `findLastUndoableAction`
  (private), `handleUndoLastActionRequest`, the `confirmAction()` special-case for undo's confirm
  text and the `undoneAt` stamp (split out of `chat.service.ts`, same tech-debt)
- `apps/api/src/modules/ai/services/chat-action-recorder.service.ts` — `ChatActionRecorderService
  .recordExternalWrite` (ABA-599) — writes the same `action_executed` ChatMessage row shape
  `confirmAction` writes, for a write that never went through it
- `apps/api/src/modules/ai/services/goal-planner.service.ts` — `revertGoalUpdate`
- `apps/api/src/modules/ai/services/prompt-builder.service.ts` — the `undo_last_action` branch of
  `buildActionSummary`, `getUndoConfirmText`, `getUndoUnavailableText`
- `packages/shared-types/src/dto/ai.ts` — `'undo_last_action'` in `ChatActionType`,
  `UndoLastActionData`
- Mobile: `src/components/chat/ActionConfirmationCard.tsx` (icon), `ActionResultCard.tsx`
  (`UndoResult`)

## Key concepts

**No schema migration — "last write" is read off `ChatMessage`.** Every confirmed write already
persists a `role: 'action_executed'` message whose `content` JSON holds the original `actionType`,
args, and `ChatActionResult`. `findLastUndoableAction` reads the single most recent one in the
conversation; there is nothing else to track. A successful undo stamps `undoneAt: <ISO>` back onto
that same message, which is what stops a second "undo" from re-firing it — `findLastUndoableAction`
treats a stamped row as nothing-to-undo and deliberately does **not** look further back for an
earlier undoable write (only the single most recent write is ever undoable).

**It's a write action too — full confirm/reject round-trip, no shortcut.** `undo_last_action` is in
`AiToolsService.isWriteAction()`, so it goes through the exact same pending-action → confirm/reject
pipeline as `create_expense` etc.: viewer-blocked, needs a tap to confirm, shows an
`ActionConfirmationCard`. This was a deliberate choice over executing immediately (the way the
shopping-list add/remove tools do) — reverting bookkeeping the user may have already relied on
(a debt repayment, a goal contribution) warranted the same friction as making it in the first place,
and reusing the existing pipeline meant zero new endpoints and the bots getting it for free (their
`ChatHandler`s render `displaySummary` + generic confirm/reject buttons, blind to the specific
`actionType`).

**Two independent gates, checked at different times.** Request time (when "undo" is said):
`findLastUndoableAction` checks the write succeeded, is one of the 5 supported types, isn't already
undone, and is younger than the 15-minute window (top of the product idea's "10-15 minutes" range).
Confirm/execute time: `revertEntityCreate` refuses if the entity's `updatedAt` is more than 5s past
its `createdAt` (edited since creation — Prisma sets both together at insert, so any gap means a
later write touched it) or if it's already gone; `revertGoalBalance` refuses if the goal's CURRENT
`currentAmount` no longer equals the `newAmount` the write set (something else changed it since).
Both failure paths return a normal `{success:false, errorMessage}`, narrated through the existing
generic `getFailText` — no new i18n needed there. Verified (ABA-599) that this 5s guard doesn't
false-positive on a receipt-scanned expense: neither `ExpensesService.create()`'s transaction nor
`ExpenseCreatedHooksService.onExpenseCreated()`'s post-create fire-and-forget chain ever
`prisma.expense.update()`s the row the OCR path just inserted — the one `expense.update` in that
chain (`reconcileNotificationStub`) targets a *different*, pre-existing `source:'notification'` stub
row. The only thing that legitimately bumps a fresh expense's `updatedAt` outside an explicit user
edit is `MerchantRulesService.reapply()` (retroactive rule application, `merchant-category-rules.md`)
— an unrelated, user-triggered action, and refusing undo on a row it just touched is the guard
working as intended, not a bug.

**The entity table for `create_debt`/`record_debt_repayment` depends on direction, not the action
name.** `debts.service.ts` puts a "lent" debt/repayment on `Expense` and a "borrowed" one on
`Income` (or the reverse for the repayment) — see `resolveUndoEntity`'s table in
`docs/contracts/chat-undo-last-action.md`. Getting this backwards would soft-delete the wrong kind
of row.

**Scope is exactly 5 action types, per-conversation, not per-device/user.** `create_budget` and
`create_category` are excluded — no clean single-row revert in v1. Undo isn't scoped to who
confirmed the original write; anyone who can act in the conversation can undo the last write in it,
mirroring how shared conversations already work. This is a deliberate v1 tradeoff, not an oversight
— a family member undoing another member's just-confirmed write is a real edge case, left open.

**A write is undoable exactly when it left an `action_executed` ChatMessage row — and since ABA-599,
that's no longer only chat's own confirmed writes.** Undoable: a chat-confirmed
`create_expense`/`create_income`/`create_debt`/`record_debt_repayment`/`update_goal_balance`
(always was); a bot's receipt-scan confirm button and its `/expense`/`/income` quick commands
(Telegram/WhatsApp/Slack — ABA-599, via `ChatActionRecorderService.recordExternalWrite`, fired
fire-and-forget right after the create succeeds, never blocking or altering the bot's own success
reply). Still NOT undoable: `/categorize`'s per-item accept/skip steps (a bulk review loop, not one
write with a single row to revert) and anything created from the mobile/web app's own screens
(manual entry, in-app receipt scan, voice capture) — none of those ever touch a `ChatConversation` at
all, so there is no row for "undo" to find.

**Confirm text and pre-confirm summary are deliberately two different code paths.**
`buildActionSummary`'s `undo_last_action` branch (used only to build the PRE-confirmation LLM
prompt) recursively re-describes the original write via its own existing per-type branch, prefixed
"undo the last action: …" — reused rather than duplicated. `getUndoConfirmText` (used for the
POST-confirm message) does NOT reuse that — "undo the last action: …" reads wrong in the past tense,
so it builds "↩️ Undone: …" straight from the `ChatActionResult.data` `executeUndoLastAction`
actually returned.

## Invariants

**Only the single most recent write is ever undoable.** Never search past an ineligible latest
`action_executed` row for an earlier one that would qualify.

**A `create_debt`/`record_debt_repayment` revert must resolve its table from BOTH the action type
AND the `type` ('lent'/'borrowed') field** — never assume expense-vs-income from the action name
alone.

**`revertGoalBalance` must re-check the goal's current amount against the snapshot's `newAmount`
before restoring** — the previousAmount snapshot is only valid immediately after the write it
belongs to; skipping this check would let a stale undo clobber a later, unrelated change.

**A successful undo must stamp `undoneAt` on its source message before returning**, or a second
"undo" (typed before the user sees the first confirmation) can revert the same write's effects
twice — for the two entity-revert paths this is caught anyway (the row is already gone, or the
goal's `currentAmount` no longer matches), but the stamp is what makes `findLastUndoableAction`
refuse it cleanly instead of relying on that downstream catch.

**A `ChatActionRecorderService`-written row must parse exactly like a `confirmAction`-written one**
(ABA-599) — same `{id, actionType, data, displaySummary, status:'executed', result:{actionType,
success, data}}` JSON shape, `role: 'action_executed'`. `findLastUndoableAction` doesn't care where a
row came from, only that it parses; a recorder that drifted from this shape would silently make every
bot-side write invisible to undo again, with no error anywhere to point at why.

## Known gaps (deliberately out of scope for v1)

- No UI affordance to trigger undo other than typing it — no swipe/long-press "undo" on the
  confirmation card itself.
- `ActionResultCard` still has no dedicated rendering for `record_debt_repayment`/`create_debt`/
  `update_goal_balance` themselves (pre-existing gap, unrelated to this feature — only the new
  `undo_last_action` result got a card).
- No cross-device/cross-user scoping (see "Key concepts" above).
- **Still not undoable from a bot (ABA-599 scoped to only 2 of the bots' several write paths):**
  `record_debt_repayment`/`create_debt`/`update_goal_balance` have no bot quick-command equivalent
  today, so this is a non-issue in practice; `/categorize`'s bulk accept/skip review; anything typed
  as free-form chat text that the AI itself turns into a write (those already go through
  `confirmAction` and were always undoable — only the bots' OWN direct-write handlers needed this).

## History

ABA-586 (the feature) · ABA-599 (bot receipt confirm and `/expense`/`/income` quick commands
recorded as undoable too — root cause: those write paths call `ExpensesService`/`IncomesService`
directly and never touched `ChatActionLifecycleService.confirmAction`, so `findLastUndoableAction`
had no row to find).
