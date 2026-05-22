---
agent: aba-backend-engineer
title: 'Fix guards location — they live in module folders, not common/'
status: applied
conflict: false
created_at: 2026-05-12
applied_at: 2026-05-22
orchestration_run: cc1b4e0e-2d79-472a-ad69-972cf576b233
---

## What's wrong

The scope section in `.claude/agents/aba-backend-engineer.md` lists:

> `apps/api/src/common/` — guards, middlewares, types.

But no guards exist in `common/`. The actual locations are:
- `JwtAuthGuard` → `modules/auth/guards/jwt-auth.guard.ts`
- `AccountRoleGuard` → `modules/accounts/guards/account-role.guard.ts`
- `AdminGuard` → `modules/admin/admin.guard.ts`
- Subscription guards → `modules/subscriptions/guards/` (3 files)

`common/` only holds `middleware/account-context.middleware.ts`, `types/index.ts`, and `cache/`.

## Proposed change

- In the **scope** section, change the `common/` bullet to:
  `apps/api/src/common/` — middleware, cache utilities, shared types (not guards).
- Add a new bullet or note:
  Guards live in their owning module's `guards/` subfolder: `auth/guards/jwt-auth.guard.ts` (JwtAuthGuard), `accounts/guards/account-role.guard.ts` (AccountRoleGuard), `admin/admin.guard.ts` (AdminGuard), `subscriptions/guards/` (subscription/usage guards).
- Update the "Controller" example import comment (or add a code comment) to show where to import `JwtAuthGuard` from.

## Rationale

An agent that searches `common/guards/` will find nothing and either create a duplicate guard or fail. The correct import paths are non-obvious because guards are co-located with the modules that own them. This fix prevents the agent from placing new guards in `common/` and from not finding existing ones.
