# Savings goals

*Hub: [ai-features](../ai-features.md) · related: [chat-architecture](chat-architecture.md),
[chat-undo-last-action](chat-undo-last-action.md), [safe-to-spend](safe-to-spend.md)*

## What this is

A savings goal is a named target amount with a deadline, owned by an account. The user tracks how
much is saved so far, from the goal screen or by telling the chat ("put 200 into the holiday
goal"), and every increase is kept as a contribution so the goal has a history. Each goal also has
an AI-generated savings plan. The routes live under `/ai/goals` for historical reasons — the goal
planner started as an AI feature.

## Entry points

- `apps/api/src/modules/ai/services/goal-planner.service.ts` — `GoalPlannerService`: `createGoal`,
  `generatePlan`, `listGoals`, `getGoal`, `getProgress`, `updateGoal`, `revertGoalUpdate`,
  `getContributions`, `deleteGoal`
- `apps/api/src/modules/ai/services/goal-plan.util.ts` — plan computation helpers
- `apps/api/src/modules/ai/services/ai-debt-goal-tools.service.ts` — `executeUpdateGoalBalance`,
  the chat tool
- `apps/api/src/modules/ai/ai.controller.ts` — the `goals` routes
- `apps/api/prisma/schema.prisma` — `SavingsGoal` (`savings_goals`), `GoalContribution`
  (`goal_contributions`)
- Mobile: `apps/mobile/app/goals/index.tsx`, `apps/mobile/app/goals/new.tsx`,
  `apps/mobile/app/goals/[id].tsx`, `apps/mobile/src/stores/goalStore.ts`

## Key concepts

### Endpoints

| Route | Guards | Notes |
|---|---|---|
| `POST /ai/goals` | `ViewerBlockGuard`, `AiUsageGuard`, metered `goal_plan` | creates the goal, then generates its plan |
| `GET /ai/goals`, `GET /ai/goals/:id`, `GET /ai/goals/:id/progress` | — | reads |
| `PATCH /ai/goals/:id` | `ViewerBlockGuard` | name, target, deadline, `currentAmount`, status |
| `DELETE /ai/goals/:id` | `ViewerBlockGuard` | hard delete; contributions cascade |
| `GET /ai/goals/:id/contributions` | — | newest 20, newest first; `[]` for a goal not in this account |
| `POST /ai/goals/:id/regenerate-plan` | `ViewerBlockGuard`, `AiUsageGuard`, metered `goal_plan` | |

### `updateGoal` — one funnel for every balance change

`GoalPlannerService.updateGoal(accountId, goalId, dto, contributionMeta?)` is the only writer of
`currentAmount`, whether the change came from the goal screen (`PATCH`, which passes
`{ userId: req.user.id }`) or from chat (`update_goal_balance`, which passes
`{ userId, note: 'AI update' }`).

- **Auto-complete**: an `active` goal whose new `currentAmount` reaches the target (the new target,
  if the same call changes it) is set to `completed`.
- **Contribution log**: when `contributionMeta` is given AND the new amount is higher than the old,
  the delta is written as a `GoalContribution` (amount, the goal's `currencyCode`, `userId`, `note`)
  in the **same `$transaction`** as the goal update. A decrease records nothing.

### The chat tool

`update_goal_balance(goalId, newAmount)` is a write, so it is queued and confirmed like any other
([chat-architecture](chat-architecture.md#the-confirmation-flow)). The model takes `goalId` from
`UserContext.savingsGoals`, which carries the ids. `newAmount` is the new **total**, not an
increment. The handler snapshots the goal before the write and returns `previousAmount`,
`previousStatus` and the created `contributionId`, which is what lets
[undo](chat-undo-last-action.md) restore it through `revertGoalUpdate` (goal back to the snapshot,
that one contribution deleted, one transaction).

### Mobile

`goalStore.contributions` is an in-memory map keyed by goal id, filled by `loadContributions(id)`
when the detail screen opens; it is cleared for a deleted goal and on `reset()`. The detail screen
shows it as a contribution-history card under the progress bar. A failed load is swallowed — the
history is supplemental to the goal.

## Invariants

- **Every `currentAmount` change goes through `updateGoal`**, so auto-complete and the contribution
  log cannot be bypassed. A new caller that should log a contribution must pass `contributionMeta`.
- **The goal update and its contribution row are one transaction** — a balance increase with no
  history row (or the reverse) is the failure this prevents.
- **Contributions are increases only.** The log answers "when was money put in", so a correction
  downwards must not appear as a negative contribution.
- **Undo must check the goal still holds the amount the write set** before restoring the snapshot
  (`revertGoalBalance`), or a stale undo would overwrite a later change.

## Known gaps

- No backfill: goals that existed before the contribution log have no history before it.
- `executeUpdateGoalBalance` identifies the contribution it just created as the newest row from
  `getContributions` — a concurrent increase from another device in the same instant could be
  picked instead.
- Goals are not part of the offline sync queue; `goalStore` talks to the API directly.

## History

- ABA-262 — `goal_contributions` (migration `20260615100000_add_goal_contributions`), the
  `contributionMeta` parameter, the contributions endpoint and the history card.
- ABA-586 — undo of `update_goal_balance` (`revertGoalUpdate`, the before-snapshot in the tool
  result).
