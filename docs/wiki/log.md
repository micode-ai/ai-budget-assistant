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
- 2026-09-22 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — fifth batch.
  Eight bullets, six pages: the three desktop-dashboard bullets became ONE page, and receipt-scan
  reconciliation extended `features/shopping-list.md` rather than minting a page of its own.
  → `features/desktop-dashboard.md`, `features/desktop-chat-screen.md`,
  `features/exchange-rate-alerts.md`, `features/community-prices.md`,
  `features/whats-new-spotlight.md` (new) + `features/shopping-list.md` (extended).
  CLAUDE.md 44 053 → 39 234 words; 49 pages.
- 2026-09-23 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — sixth batch.
  Fourteen bullets, two new pages: six web data-loading bullets (ABA-498/506/518/519/520/522) are
  one subject — "a failed load must not look like an empty one" — and seven budget bullets became
  one page; ABA-521 extended `features/desktop-dashboard.md`, which already stated its rule.
  → `features/web-data-loading.md`, `features/budgets.md` (new) +
  `features/desktop-dashboard.md` (extended). CLAUDE.md 38 893 → 34 171 words; 52 pages.
- 2026-09-23 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — seventh batch.
  Seven bullets, four pages: the deposit tool, the discount tool and the Analytics drill-down are one
  mechanism (column → pure summary → FX), and split-aware categories + line-item search are the two
  halves of how `get_expenses` answers. Found while checking: `ALL_TIME_START` is not shared, it is
  defined twice. → `features/deposit-and-discount-totals.md`, `features/chat-spending-questions.md`,
  `features/desktop-keyboard-shortcuts.md`, `features/bot-receipt-editing.md` (all new).
  CLAUDE.md 34 171 → 31 243 words; 56 pages.
- 2026-09-23 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — eighth batch.
  Seven bullets, three new pages and one hub: four import bullets (Polish banks, Wise, batch history,
  the service split) became `features/bank-statement-import.md`; the Slack bullet was absorbed into
  the existing `slack-bot.md` hub, which gained an Invariants section and lost two stale claims
  (8 languages, a controller file name). Two CLAUDE.md errors found: Pro's yearly discount is 50%,
  not ~69%, and the "one file per price change" claim misses the hand-typed `MRR_MONTHLY_USD`.
  → `features/bank-statement-import.md`, `features/personal-inflation-index.md`,
  `features/subscription-pricing.md` (new) + `slack-bot.md` (extended). CLAUDE.md 31 243 → 29 100 words;
  59 pages.
- 2026-09-23 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — ninth batch.
  Six bullets, four pages; the three admin revenue bullets (comped tiers, investor metrics,
  acquisition) became one. The desktop-layout bullet was **stale**, not just long: it described a
  left sidebar that the ABA-499 → 514 work removed, a two-column home screen the desktop dashboard
  replaced, and `InteractiveLineChart` as a `useContentWidth` caller when it no longer is — the page
  describes the code, and says which history is unrecoverable from a squash merge.
  → `features/desktop-web-shell.md`, `features/wallet-currencies.md`,
  `features/receipt-image-memory.md`, `features/admin-revenue-metrics.md` (all new).
  CLAUDE.md 29 100 → 26 964 words; 63 pages.
- 2026-09-23 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — tenth batch,
  the inventories. Fourteen structural bullets (stores, repositories, services, screens, components,
  hooks, features, navigation, three store splits, the visibility factory, headers) into a rewritten
  `mobile-app.md` hub. Every list had rotted — ~20 stores missing, 18 repositories claimed vs 22, the
  hub itself saying 22 stores / 14 api modules / 8 locales — so the hub replaces enumerations with
  **naming conventions** and states "the directory is the list". Found: the comment above `header:`
  in `(tabs)/_layout.tsx` contradicts its own JSX (title is below the divider), and
  `analytics-insights.md` called Fat Finder client-side when it is a server LLM report — both fixed
  or recorded. → `mobile-app.md` (rewritten), `analytics-insights.md` (corrected).
  CLAUDE.md 26 964 → 24 971 words; 63 pages.
- 2026-09-24 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — eleventh batch.
  Eight bullets, three new pages, three extended: the three notification-capture bullets are one
  pipeline; referral link + invite nudge are one program. PWA and guest CTA were mostly on pages
  already, so they extended them. Found: the store-rating prompt is ABA-485, cited as ABA-492 in two
  places; the capture subscription moved into `useBankNotificationCapture`; three server paths
  (`reconcileNotificationStub`, `flagPossibleMerges`, `expensePayee`) had moved since the bullets.
  → `features/bank-notification-capture.md`, `features/referral-program.md`,
  `features/store-rating-prompt.md` (new) + `features/web-build-and-hosting.md`,
  `features/receipt-split.md`, `index.md` (extended). CLAUDE.md 24 971 → 22 751 words; 66 pages.
- 2026-09-24 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — twelfth batch.
  Five bullets, five pages. Found: the approval rule is snapshotted per purchase request; members who
  never vote still count in the denominator (the bullet claimed otherwise); `familyFeed` is first in
  `WIDGET_KEYS`, not after `safeToSpend`; purchase requests listed "9 endpoints" but have 10 and
  "Family Feed integration" as deferred though it shipped; two stale widget counts and a
  `storeArrival` reference fixed elsewhere in CLAUDE.md. → `features/purchase-requests.md`,
  `features/family-feed.md`, `features/invite-by-search.md`, `features/subscription-manager.md`,
  `features/theme-customization.md` (all new). CLAUDE.md 22 751 → 21 032 words; 71 pages.
- 2026-09-24 · [ABA-578](https://github.com/micode-ai/ai-budget-assistant/issues/601) — thirteenth
  batch. Seven bullets, three new pages, one extended: chat currency labelling + Fat Finder + Spending
  Story are one rule; date pickers + the create-form date are one. Found two live violations of
  documented rules: `report-scheduler.service.ts` keeps a sixth private `convertAmount` that sums an
  unknown-rate amount raw, and `subscriptions/new.tsx` + `investment/transaction.tsx` still build
  default dates via `toISOString()`. Both recorded as gaps, not fixed here.
  → `features/shared-conversations.md`, `features/date-pickers.md`,
  `features/display-currency-conversion.md` (new) + `features/shopping-list.md` (extended).
  CLAUDE.md 21 032 → 19 390 words; 74 pages.

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
- 2026-09-22 [ABA-580](https://github.com/micode-ai/ai-budget-assistant/issues/603) — AlphaShot footer badge. The image is API-generated (live upvotes) and CORS-open, so it stays hotlinked; the second row measures 838px of 996. Pages: `features/directory-badges.md`.
- 2026-09-22 [ABA-581](https://github.com/micode-ai/ai-budget-assistant/issues/604) — a real Money Manager export gave an empty preview: a picked `bankId` skips `detect()` and never reaches AI mapping. Fallback added; the commit DTO's `bankId` list, hand-written and missing all three competitor ids, now derives from `PARSERS`. Moved the ABA-401 CLAUDE.md bullet to a new page. Pages: `features/competitor-app-migration.md` (new), `index.md`.
- 2026-09-22 [ABA-582](https://github.com/micode-ai/ai-budget-assistant/issues/605) — the real Money Manager export (`ID,Date,Type,Title,Amount,Note`, currency as a symbol in the amount) is a different app from the Realbyte shape the parser was written for; the parser now reads both, with slash-date order decided per file. Pages: `features/competitor-app-migration.md`.
- 2026-09-22 [ABA-583](https://github.com/micode-ai/ai-budget-assistant/issues/606) — Wallet's export header circulates in two spellings (`refAmount` vs `ref_currency_amount`), and its export is paid, so neither can be verified; detection now accepts both. Pages: `features/competitor-app-migration.md`.
- 2026-09-24 [ABA-584](https://github.com/micode-ai/ai-budget-assistant/issues/607) — the 90-day ABA-435/436 check. Retitling a competing article resolved FR cannibalization; adding vocabulary to one NL article did not. `/fr/` now ranks with zero clicks, so the next fix is its snippet. `cta_click` starred as a GA4 Key event; attribution works and native rows are no longer NULL since the Install Referrer. Pages: `features/marketing-site.md`, `features/acquisition-tracking.md`.
- 2026-09-24 [ABA-584](https://github.com/micode-ai/ai-budget-assistant/issues/607) — shipped the fix: FR/EN landing titles now open with the query they rank for; the NL import article (218 of 223 impressions for an 11-query cluster at 0 clicks) gained the rekeningafschrift/rekeninguittreksel/mutaties synonyms and NL/BE banks in place of Polish ones. Re-measure 2026-10-22. Pages: `features/marketing-site.md`.
- 2026-09-24 [ABA-584](https://github.com/micode-ai/ai-budget-assistant/issues/607) — index audit (nothing broken; 93 not-indexed explained), Organization/app `sameAs` split with the MiCode spelling and NIP, app-migration article retitled around "Monefy alternative" and its free-Wallet-export claim corrected in 9 languages. mi-code.pl sitemap had not been read since 2026-07-08; resubmitted. Pages: `features/marketing-site.md`.
- 2026-09-24 [ABA-586](https://github.com/micode-ai/ai-budget-assistant/issues/609) — added `undo_last_action`, the chat's first reversal of its own confirmed write. Resolved entirely from existing `action_executed` ChatMessage rows (no migration); reuses the confirm/reject pipeline and each entity's own soft-delete. New page: `features/chat-undo-last-action.md`.
- 2026-09-24 [ABA-587](https://github.com/micode-ai/ai-budget-assistant/issues/610) — a public guest link for one shopping list (read + check-off only, no expiry, one token on the list row), reusing receipt-split's `GuestController` isolation pattern under a new `sl/(.*)` prefix exclusion but with its own self-contained i18n/HTML helpers. `findUsableList` deliberately skips the two-query timing-oracle guard `GuestController` uses — no money, no other-party data on this surface, so there's nothing the timing difference could leak. Pages: `features/shopping-list.md`.
- 2026-09-24 [ABA-588](https://github.com/micode-ai/ai-budget-assistant/issues/611) — search a product's price history from Settings → Products; needed a new `getProductDetail` endpoint because `GET /price-history?period=X`'s `products[]` excludes any product without purchases on both sides of the period's base/current midpoint (a single first-time purchase can never qualify, for any period). Reused `ProductDetailSheet` unchanged via a new `SheetDialog` host. Pages: `features/personal-inflation-index.md`.
- 2026-09-25 [ABA-589](https://github.com/micode-ai/ai-budget-assistant/issues/612) — one batched model call now clusters an account's uncategorized expenses into a reviewed set of existing/new categories instead of classifying each in isolation, which is how near-duplicate categories were born; the receipt scan prompt may answer `null` instead of forcing a wrong pick; bulk recategorization now teaches merchant rules too. Moved the ABA-261 CLAUDE.md bullet to its own page. Pages: `features/categorize-uncategorized.md` (new), `features/merchant-category-rules.md` (new), `features/receipt-category-split.md`, `index.md`.
- 2026-09-25 [ABA-590](https://github.com/micode-ai/ai-budget-assistant/issues/614) — first live run of the categorize pass: one web open spent two model passes with two different answers, and a store variant stayed ungrouped. Cached the validated answer per input (30 min), `temperature: 0`, deterministic merchant top-up, shared in-flight request on the client. Pages: `features/categorize-uncategorized.md`.
- 2026-09-25 [ABA-591](https://github.com/micode-ai/ai-budget-assistant/issues/615) — resolved tech-debt `ai-tools-service-god-file`: `ai-tools.service.ts` (1,521 lines: 18 schemas + 18 handlers + undo logic) split into a data-only `ai-tool-schemas.ts` and five domain provider services, leaving a 138-line dispatcher with an unchanged public API — `chat.service.ts` needed zero changes. Pages: `ai-features.md`.
- 2026-09-25 [ABA-593](https://github.com/micode-ai/ai-budget-assistant/issues/617) — resolved tech-debt `products-settings-screen-regrowth`: `ProductsSettings.tsx` regrew past its ABA-478 split because the split moved only the modals' JSX, not their state. Extracted rename and merge state into `useProductRename`/`useProductMerge` hooks, destructured at the call site like the existing `useProductMultiSelect`. Pure refactor, no behavior change. Pages: `features/personal-inflation-index.md`.
- 2026-09-25 [ABA-594](https://github.com/micode-ai/ai-budget-assistant/issues/618) — a bot-facing, sequential Yes/Skip/Stop variant of the categorize-uncategorized review (ABA-589/590) for Telegram/WhatsApp/Slack, previously out of scope. `CategorizeBotService` wraps `CategorizeSuggestionsService.suggest()` unchanged (same daily ceiling, same cache) — no new endpoint, no new DTO, no migration. New-category proposals are included, not skipped, since a plain name is already what `/category <name>` turns into a category on all three bots. Pages: `features/bot-categorize-command.md` (new), `features/categorize-uncategorized.md`, `ai-features.md`, `index.md`.
- 2026-09-25 [ABA-595](https://github.com/micode-ai/ai-budget-assistant/issues/619) — extended the categorize-uncategorized review to incomes: forked the backend (`CategorizeIncomeSuggestionsService`, `POST /ai/categorize-uncategorized-income`, new `PATCH /incomes/bulk`) since Expense/Income are different Prisma shapes, but parametrized the client with one `entityType` prop threaded through `CategorizeReview`/`UncategorizedBanner`/`useCategorizeSuggestions`/`categoryStyle` — the reducer/apply/validator layer needed zero changes. Shares the expense pass's daily AI-quota counter; no merchant-rule pre-pass for income (no merchant field). Pages: `features/categorize-uncategorized.md`.
- 2026-09-25 [ABA-596](https://github.com/micode-ai/ai-budget-assistant/issues/620) — the gap categorize-uncategorized (ABA-589) named first among its own out-of-scope items: a merchant rule learned today never applied retroactively to that merchant's expenses already sitting in some other category. Added a per-rule "Reapply" action (Settings → Merchants → Category rules) that previews affected expenses grouped by their *current* category, lets the user uncheck groups they moved on purpose, then bulk-moves the rest via one plain `updateMany` (not `ExpenseBulkService`, to avoid a circular module import) — deterministic, no model call, no daily-limit interaction. Same E2EE/spend-eligibility exclusion set as the categorize pass, for the same reasons. No schema flag for "deliberate override" — the per-group checkbox is the whole mitigation. Pages: `features/merchant-category-rules.md`.
