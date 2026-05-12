---
agent: aba-code-reviewer
title: 'Document AdminGuard as a valid guard pattern alongside AccountContextGuard'
status: proposed
conflict: false
created_at: 2026-05-12
---

## What's wrong

`apps/api/src/modules/admin/admin.controller.ts` uses `@UseGuards(JwtAuthGuard, AdminGuard)` — no `AccountContextGuard`. The current agent text says:

> every controller has `@UseGuards(JwtAuthGuard, AccountContextGuard)` unless it's an explicit public endpoint (e.g., `GET /app-versions/check`, `GET /health`)

Admin routes are neither "public" endpoints nor do they carry an `X-Account-Id` context — they're global-scope operations. A reviewer applying the current rule would flag every admin controller endpoint as a critical finding when it is intentionally and correctly guarded.

## Proposed change

- In the "Backend (apps/api) checks → Auth guards" bullet, add a third legitimate exception after the public-endpoint examples:
  `Admin routes use @UseGuards(JwtAuthGuard, AdminGuard) — no AccountContextGuard, since they operate outside the per-account scope. Don't flag these.`
- Optionally add a short note: "A new admin endpoint missing AdminGuard *is* a critical finding; a new admin endpoint missing AccountContextGuard is *not*."
- Verify the carve-out applies only to controllers inside `modules/admin/`; new feature modules should still require AccountContextGuard.

## Rationale

Today any agent invocation that touches `modules/admin/` will produce at least one spurious critical finding per endpoint. That trains the team to ignore "critical" severity noise, which erodes the signal value of the review report. Adding the carve-out costs two lines in the agent file and eliminates a whole class of false positives.
