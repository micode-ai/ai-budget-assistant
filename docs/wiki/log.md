# Wiki log

Append-only, three kinds of entry, **one line each**. This is a search target ("did we look at this
before?"), not a second wiki: a line that retells the work defeats the purpose. The detail belongs
on the page, the reasoning in the ABA issue.

- **Ingests** — a task changed something and the wiki absorbed it (`finish-aba-task`).
- **Queries** — a question was answered and the answer was filed back, whether or not code
  changed (`wiki-query`). These are the entries the pattern lives on and the easiest to skip.
- **Lint passes** — a reading audit happened (`wiki-audit`), so the next one knows where to start.

Newest last within each section.

---

## Ingests

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
- 2026-09-22 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — second batch:
  five single features, no clusters this time. → `features/ai-statement-import.md`,
  `features/web-telemetry.md`, `features/chat-conversation-management.md`,
  `features/account-transfers.md`, `features/shopping-list.md` (all new).
  CLAUDE.md 59 394 → 52 484 words; the twelve heaviest bullets are now all drained.
- 2026-09-22 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — third batch:
  five features. → `features/expense-location-and-map.md`, `features/restore-credentials.md`,
  `features/receipt-price-check.md`, `features/settings-desktop-shell.md`,
  `features/report-periods.md` (all new). CLAUDE.md 52 484 → 47 758 words.
- 2026-09-22 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — fourth batch.
  → `features/anomaly-alerts.md`, `features/desktop-transactions-screen.md`,
  `features/trip-wallet.md`, `features/first-run-onboarding.md`, `features/inflation-shield.md`
  (all new). CLAUDE.md 47 758 → 44 053 words; 44 pages.

## Queries

_None yet. The first entry here is the point at which the wiki starts accumulating from questions
and not only from changes — see the `wiki-query` skill._

## Lint passes

- 2026-09-22 · first pass, targets taken from `wiki-staleness.py`. Read `ai-features.md` and
  `offline-sync.md` against the code: 10 stale claims, all rewritten — worst was `offline-sync.md`
  describing the generic `/sync` queue as the mobile sync path when `pushChanges`/`pullChanges` have
  **zero call sites**. Three of the same errors were live in `CLAUDE.md` and were fixed there too.
  **Next target: `api.md`** (46 commits behind on `schema.prisma`), not yet read.
- 2026-09-22 · second pass: `api.md`. Four wrong claims — module count (35 vs 48, deleted),
  `AccountContextGuard` called middleware (it is a guard in a file named `*.middleware.ts`, and
  `AccountContextMiddleware` does not exist), `ViewerBlockGuard` absent although 20 controllers
  use it, and the prefix-exclusion list given as WhatsApp+Slack when it also covers Stripe,
  Telegram, Slack OAuth and the whole guest subtree. The naming error was live in `CLAUDE.md`
  too, in two places. **Next target: `mobile-app.md`** (38 commits behind on `_layout.tsx`).
