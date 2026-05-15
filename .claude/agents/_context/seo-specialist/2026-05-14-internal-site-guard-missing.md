---
agent: seo-specialist
title: 'Add guard-rail for internal/auth-gated web surfaces before auditing'
status: proposed
conflict: false
created_at: 2026-05-14
---

## What's wrong

Step 1 of the agent's workflow (`.claude/agents/seo-specialist.md`, lines 23–34) detects the frontend framework (Next.js, Nuxt, etc.) but never checks whether the site is public-facing or behind authentication. If the agent is invoked on a repo like this one — where the only Next.js app is an authenticated admin dashboard (`apps/admin`, port 3001) — it will proceed to run a full 9-category public-SEO audit and produce findings like "missing OG image" or "no sitemap" that are irrelevant or actively wrong for an internal tool. The correct mandate for an internal/auth-gated site is to confirm `noindex` is set and `robots.txt` has `Disallow: /`, not to add Twitter Cards.

## Proposed change

- After Step 1 (stack detection), insert a **Step 1b — Visibility check** before running the checklist.
- In Step 1b, look for signals that the site is not publicly indexed: `noindex` in `<meta>` or `robots.txt`, authentication guards on all routes, or an explicit admin/internal label in `package.json` `name` or `README`.
- If the site appears to be internal/private, **pause and ask**: "This looks like an internal/auth-gated tool. Should I verify `noindex` + `Disallow: /` are in place, or is there a public surface I should audit instead?"
- Add a bullet to the **When to push back** section: "If the target is an admin panel or internal tool → confirm it's `noindex`'d before auditing; a full SEO audit is not warranted."
- Update the agent `description` frontmatter to mention: "For internal tools, confirms `noindex` is set rather than running a full audit."

## Rationale

Without this guard, the agent wastes audit effort on irrelevant findings and may actively mislead — a developer reading "missing OG tags on admin dashboard" might add them to a page that should never appear in search results. The fix is cheap (one extra check + one clarifying question) and prevents the most common misuse of this agent in monorepos that have both internal dashboards and public surfaces.
