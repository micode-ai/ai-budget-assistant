# Wiki log

Append-only. **One line per task** — date, ABA link, what was learned or changed, pages touched.

This is a search target ("did we look at this before?"), not a second wiki. A line that retells
the work defeats the purpose; the detail belongs on the page, the reasoning in the ABA issue.

Newest last.

---

- 2026-09-22 · [ABA-575](https://github.com/micode-ai/ai-budget-assistant/issues/598) — the
  without-category filter found nothing on a device whose category ids had diverged from the
  server; the convergence code existed but its only caller was gated on an empty local table.
  → `features/category-id-resolution.md` (new)
- 2026-09-22 · [ABA-577](https://github.com/micode-ai/ai-budget-assistant/issues/600) — the mobile
  suite leaked a 1s widget-refresh timer across test files, charging the failure to whichever
  suite was running. Fixed at the file boundary via `setupFilesAfterEnv`.
  → `features/mobile-test-infrastructure.md` (new)
- 2026-09-22 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — adopted the
  LLM-wiki pattern: `index.md`, `log.md`, page template, `finish-aba-task` rewritten
  to ingest here, `scripts/wiki-lint.py`. First migration out of `CLAUDE.md`: receipt splitting.
  The scheme itself is declared at the top of `CLAUDE.md` — without that pointer a fresh session
  never learns the wiki exists and keeps appending to `CLAUDE.md`.
  → `features/receipt-split.md`, `features/receipt-split-item-shares.md` (both new)
- 2026-09-22 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — first real
  migration batch out of `CLAUDE.md`: the four heaviest remaining bullets. Two of them were
  clusters, not features — Offline-first alone carried five unrelated subjects.
  → `features/receipt-category-split.md`, `features/offline-first-sync.md`,
  `features/client-id-resolution.md`, `features/help-content-pipeline.md`,
  `features/mobile-test-infrastructure.md` (all new). CLAUDE.md 77 100 → 63 916 words.
- 2026-09-22 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — drained the
  single heaviest bullet, Platforms (4 629 words), which was four subjects wearing one heading.
  → `features/web-build-and-hosting.md`, `features/marketing-site.md`,
  `features/acquisition-tracking.md`, `features/directory-badges.md` (all new).
  CLAUDE.md 63 916 → 59 394 words.
