---
agent: seo-specialist
title: 'Remove contradictory rel=next/prev pagination checklist item'
status: applied
conflict: false
created_at: 2026-05-14
orchestration_run: 0466acc7-04c8-4beb-98fa-9255ee4b2f4f
---

## What's wrong

The agent's checklist (`.claude/agents/seo-specialist.md`, line 46) includes:
> Pagination uses `rel="next"` / `rel="prev"` or self-canonical (post-2019 Google guidance)

But the Constraints section (line 211) correctly states:
> Don't recommend deprecated practices: … `rel="next"`/`rel="prev"` for indexing (Google stopped using as indexing signal in 2019 — still fine for accessibility)

An auditor following the checklist would flag missing `rel=next/prev` as `⚠ partial` and suggest adding them. The Constraints section says they are deprecated for SEO. These two instructions directly contradict each other.

## Proposed change

- **Remove** `rel="next"` / `rel="prev"` from the checklist item in section A (line 46).
- **Replace** with: `Pagination: each page uses `<link rel="canonical">` pointing to itself (not the first page); infinite scroll or JS-rendered pagination is crawlable.`
- Keep the existing Constraints bullet as-is since it's correct.
- Optionally add a footnote: "`rel=next/prev` is still fine for assistive tech but has no Google indexing benefit since 2019."

## Rationale

Today, an agent following both instructions is in conflict: the checklist says "check for rel=next/prev" but the constraints say "don't recommend them." A future agent will either produce a false-positive audit finding (flagging absence of a deprecated attribute) or silently ignore the checklist item (inconsistent behavior). Removing the contradiction makes the checklist unambiguous and avoids recommending a 2013-era practice to developers.
