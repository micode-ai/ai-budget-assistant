# Learning Note — seo-specialist
**Date:** 2026-05-14
**Agent file:** `.claude/agents/seo-specialist.md`

---

## Role

Audits websites for search-engine visibility and produces concrete, file-level fixes (not generic advice) — covering crawlability, metadata, structured data, semantic HTML, Core Web Vitals, and E-E-A-T signals.

---

## Watchlist

If this agent is invoked in this repo, look for:

1. **Mismatched use case** — the only web surface is `apps/admin` (Next.js 16 App Router, port 3001), which is an authenticated internal admin dashboard, not a public-facing site. The right SEO answer here is likely `Disallow: /` + `noindex`, not OG tags or schema markup. Confirm intent before auditing.

2. **Missing robots.txt / sitemap** — `apps/admin/public/` contains only decorative SVGs; no `robots.txt`, no `sitemap.xml`, no `favicon.ico`. For a public site this is P0; for an internal tool the absence of `Disallow: /` is the actual risk.

3. **Bare root metadata** — `apps/admin/src/app/layout.tsx:20` exports only `title` and `description`. No `metadataBase`, no Open Graph, no Twitter Cards, no `<link rel="canonical">`. If the admin panel ever gets a public URL, these are all gaps.

4. **No public marketing site in scope** — the mobile app (`apps/mobile`) is Expo/React Native; the API is NestJS. Neither has an HTML SEO surface. Any real SEO work for the product likely lives in an external marketing site not present in this repo.

5. **`docs/seo/` directory doesn't exist** — the agent writes audit output to `docs/seo/YYYY-MM-DD-audit.md`, but this path is absent from the repo. The directory will need to be created on first use (agent should handle this, but worth verifying it doesn't error silently).

---

## Clarifying question

**Before starting any audit:** "Is there a public-facing marketing website or landing page for AI Budget Assistant outside this repo? The only web surface here is an internal admin dashboard — if SEO is for that, should it be `noindex`'d rather than optimized?"

---

## Agent file issues

1. **No guard-rail for internal/private web surfaces.** Step 1 (stack detection) detects the framework but never checks whether the site is public-facing vs. behind authentication. Invoking a full 9-category public-SEO audit on an internal admin tool produces mostly misleading findings (e.g., "missing OG image" on a login-gated dashboard). The agent should branch early: if the site is internal/auth-gated, the correct mandate is `noindex` + `Disallow: /`, not SEO optimization.

2. **Audit output directory assumed to exist.** The agent writes to `docs/seo/` without any instruction to create it first. For repos where the path doesn't exist (like this one), a `Write` call will fail or behave unexpectedly. A one-liner `mkdir -p docs/seo` before writing would prevent silent failures.

3. **`rel="next"` / `rel="prev"` guidance is self-contradictory.** The checklist in section A says "Pagination uses `rel='next'` / `rel='prev'`" as an item to check, but the Constraints section correctly notes Google stopped using these as indexing signals in 2019. The checklist item should be removed or reframed as "pagination uses self-canonical" to avoid auditors flagging missing `rel=next/prev` as a bug.
