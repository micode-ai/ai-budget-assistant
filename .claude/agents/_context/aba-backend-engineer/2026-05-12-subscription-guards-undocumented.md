---
agent: aba-backend-engineer
title: 'Document subscription guards so agents use them instead of reimplementing limits'
status: applied
conflict: false
created_at: 2026-05-12
applied_at: 2026-05-22
orchestration_run: def3acf4-138b-4e5f-83bd-5a390f991303
---

## What's wrong

`apps/api/src/modules/subscriptions/guards/` contains three production-ready guards:

- `ai-usage.guard.ts` — enforces AI credit limits per user
- `account-limit.guard.ts` — caps entity counts (expenses, budgets, etc.) by subscription tier
- `subscription-tier.guard.ts` — gates endpoints by tier (free / pro / business)

None of these are mentioned in `.claude/agents/aba-backend-engineer.md`. An agent adding a new gated feature (e.g. a new AI endpoint, a new entity type with a free-tier cap) will not know these exist and will likely write inline tier-checking logic in the service layer instead.

## Proposed change

- Add a bullet to **Cross-cutting rules**:
  `**Subscription & usage guards** (`modules/subscriptions/guards/`): Use `AiUsageGuard` on AI endpoints, `AccountLimitGuard` on entity-creation endpoints that have free-tier caps, `SubscriptionTierGuard` on tier-gated features. Do not re-implement tier checks in service methods.`
- Reference the guards' import paths so the agent knows where to find them.
- Add them to the "What you DO NOT do" list: "Write inline tier/limit checks in service methods when a guard already exists."

## Rationale

Subscription limit enforcement scattered across service methods is both hard to test and easy to bypass. The existing guards centralise this logic. Documenting them in the agent file ensures the pattern is followed for every new endpoint, not just the ones an engineer happens to audit.
