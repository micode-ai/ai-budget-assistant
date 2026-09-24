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
  `executeUndoLastAction`/`resolveUndoEntity`/`revertEntityCreate`/`revertGoalBalance`
- `apps/api/src/modules/ai/services/chat.service.ts` — `findLastUndoableAction`,
  `handleUndoLastActionRequest`, the `confirmAction()` special-case for undo's confirm text and
  the `undoneAt` stamp
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
generic `getFailText` — no new i18n needed there.

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

## Known gaps (deliberately out of scope for v1)

- No UI affordance to trigger undo other than typing it — no swipe/long-press "undo" on the
  confirmation card itself.
- `ActionResultCard` still has no dedicated rendering for `record_debt_repayment`/`create_debt`/
  `update_goal_balance` themselves (pre-existing gap, unrelated to this feature — only the new
  `undo_last_action` result got a card).
- No cross-device/cross-user scoping (see "Key concepts" above).
