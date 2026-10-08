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
- 2026-09-29 · [ABA-625](https://github.com/micode-ai/ai-budget-assistant/issues/653) — push ↔
  receipt pairs are matched loosely and offered as a merge; Tier 1 skipped for `ocr` (the ABA-568
  branch had been unreachable for pushes). → `features/bank-notification-capture.md`
- 2026-10-01 · [ABA-626](https://github.com/micode-ai/ai-budget-assistant/issues/654) — CLAUDE.md → wiki
  migration, three batches: expenses, home and mobile screens; AI chat, goals, Safe-to-Spend, Wrapped; auth,
  crons, backups, bots, admin, paywall. Every bullet re-verified against the code first — dozens of drifted
  claims corrected rather than copied (route files that are now thin wrappers, first-20 chat history, admin
  socket event names, restore that drops line items). 28 new pages + 11 extended; CLAUDE.md 19 750 → 13 356
  words. → see the pages listed under each hub in `index.md`.
- 2026-10-01 · [ABA-626](https://github.com/micode-ai/ai-budget-assistant/issues/654) — fixed the bugs the
  wiki migration surfaced: viewer-blocked and complete backup restore, Telegram webhook always secret,
  stop-recurring for the whole series, project link resolved by id|clientId on update, affordability
  refuses an unconvertible currency, pending chat actions expire, account-scoped device chat cache.
  → `features/account-backups.md`, `telegram-bot.md`, `features/recurring-expenses.md`,
  `features/expense-detail-editing.md`, `features/safe-to-spend.md`, `features/chat-architecture.md`
- 2026-10-01 · [ABA-629](https://github.com/micode-ai/ai-budget-assistant/issues/659) — wallet stayed on the previous account after a switch that bypassed AccountSwitcher; dashboard now reloads it via `walletLoadedFor()`. Also: the release-version guard never saw tags (1.32.0 shipped twice). → `features/account-switch-reload.md`

## Queries

- 2026-09-29 — why no merge suggestion for bank push + later receipt scan → `features/bank-notification-capture.md` (Known gaps; corrected a false claim)

## Lint passes

- 2026-09-22 · first pass, targets taken from `wiki-staleness.py`. Read `ai-features.md` and
  `offline-sync.md` against the code: 10 stale claims, all rewritten — worst was `offline-sync.md`
  describing the generic `/sync` queue as the mobile sync path when `pushChanges`/`pullChanges` have
  **zero call sites**. Three of the same errors were live in `CLAUDE.md` and were fixed there too.
  **Next target: `api.md`** (46 commits behind on `schema.prisma`), not yet read.
- 2026-10-01 · [ABA-626](https://github.com/micode-ai/ai-budget-assistant/issues/654) — prompt
  audit of `CLAUDE.md`, `.claude/` agents/skills/commands and the API's LLM prompts. Fixed stale
  facts in `CLAUDE.md` (alert secrets, assetlinks guard, paths, enums, locale count) and the agent
  files; found that a learning note with `name:` frontmatter under `.claude/agents/` registers as a
  subagent (28 did). App-prompt bugs left as follow-ups in the issue.
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
- 2026-09-25 [ABA-597](https://github.com/micode-ai/ai-budget-assistant/issues/621) — the other gap `categorize-uncategorized`'s Known gaps named: merchant rules weren't consulted at receipt-scan time. Fixed in the one funnel every scan path already shares (`ReceiptFinalizerService`), so mobile + all three bots got it in one change; a rule now wins over the OCR model's own category guess, even when the model answered `null`. Investigating the paired notification-capture gap found it wasn't actually a gap — `captureService.ts` already checks the rule store client-side, shipped with ABA-294/295 — so only the wiki was wrong there, not the code. Pages: `features/merchant-category-rules.md`, `features/bank-notification-capture.md`, `features/categorize-uncategorized.md`.
- 2026-09-25 [ABA-598](https://github.com/micode-ai/ai-budget-assistant/issues/622) — the seeding gap `categorize-uncategorized` (ABA-589) named: only a user's first, registration-time account got default categories — `AccountsService.create()` (every later personal/shared/business/trip account) left new accounts empty. Now seeds the same localized set for every new account except `investment` (portfolio-centric, no fit for a Groceries/Alcohol set), using the creating user's language, inside the same transaction as the account create. Going-forward only — no backfill. Pages: `features/default-category-seeding.md` (new), `features/categorize-uncategorized.md`, `index.md`.
- 2026-09-25 [ABA-599](https://github.com/micode-ai/ai-budget-assistant/issues/623) — a receipt confirmed in a bot or a bot's `/expense`/`/income` quick command couldn't be undone from chat: those write paths call `ExpensesService`/`IncomesService` directly and never touched `ChatActionLifecycleService.confirmAction`, so `findLastUndoableAction` had no `action_executed` row to find. New `ChatActionRecorderService.recordExternalWrite` writes that same row shape, fire-and-forget, from all 9 bot write call sites (photo/expense/income handlers × Telegram/WhatsApp/Slack); verified the undo guard's 5s `updatedAt`-vs-`createdAt` check doesn't false-positive on the OCR create path. Pages: `features/chat-undo-last-action.md`.
- 2026-09-26 [ABA-600](https://github.com/micode-ai/ai-budget-assistant/issues/624) — six defects from a manual web acceptance run of ABA-586..599: shortcuts live under the categorize dialog, web share reported as a create failure, guest toggle without PRG plus unstyled/unclickable rows, a raw `common.apply` label, income defaults seeded as expense, identical expense/income banners. Pages: `features/default-category-seeding.md`, `features/shopping-list.md`, `features/categorize-uncategorized.md`.
- 2026-09-26 [ABA-601](https://github.com/micode-ai/ai-budget-assistant/issues/625) — a supermarket receipt on an account without default categories was filed under an unrelated category: both the scan model and the split classifier forced the nearest name (a shared generic word). The split prompt now offers standard default names for proposals and forbids forced fits; new `reconcileReceiptCategory` makes the overall category agree with the split (rule > split > model guess). Pages: `features/receipt-category-split.md`.
- 2026-09-26 [ABA-601](https://github.com/micode-ai/ai-budget-assistant/issues/625) — one-time backfill migration seeds the default categories into pre-ABA-598 accounts (active, non-investment, <5 default names; never resurrects a soft-deleted name). Pages: `features/default-category-seeding.md`.
- 2026-09-26 [ABA-602](https://github.com/micode-ai/ai-budget-assistant/issues/626) — the ABA-601 symptom persisted because receipts scanned into the wrong account and then moved out had already taught it product rules, which are consulted before the model. `moveToAccount` now unlearns them via `ProductRulesService.forgetRules`. Pages: `features/receipt-category-split.md`.
- 2026-09-26 [ABA-603](https://github.com/micode-ai/ai-budget-assistant/issues/627) — duplicate-receipt warning in app and bots: a device-computed file fingerprint checked BEFORE OCR through a free endpoint (the AI usage guard charges before the handler runs, so the check cannot live in scan-receipt), plus a post-OCR payee/amount/date match. Pages: `features/receipt-duplicate-warning.md` (new), `index.md`.
- 2026-09-26 [ABA-604](https://github.com/micode-ai/ai-budget-assistant/issues/628) — transfers counted as income are the user's own money, so the income categorize pass and its banner skip them (server by the transfer link, device by the shared `transfer-income-` clientId). Pages: `features/categorize-uncategorized.md`.
- 2026-09-26 [ABA-605](https://github.com/micode-ai/ai-budget-assistant/issues/629) — chat answer rows had a real expense id sitting unused: `get_expenses` rows, and `get_deposit_total`/`get_discount_total`'s `data.recent`, were never wired to a tap handler. Wired both through to `/expense/:id`, reusing `SavingsDetailSheet.tsx`'s exact interaction (disabled/no chevron when a row has no id). Category/budget-aggregate rows descoped — no single resolvable expense id, and a filtered-Expenses-tab deep link would need new route-param infra that doesn't exist. Pages: `features/chat-spending-questions.md`, `features/deposit-and-discount-totals.md`.
- 2026-09-26 [ABA-606](https://github.com/micode-ai/ai-budget-assistant/issues/630) — the ~40-article in-app Help center had no search, just a fixed-order scroll. Added a pure `searchHelpSections` ranker (title > description > body, with a body-match snippet) over the already-in-memory `helpContent[lang]`, scoped to the current UI language only, plain substring not fuzzy. Empty state routes into AI chat. Public help center search explicitly deferred as a separate idea. Pages: `features/help-content-pipeline.md`.
- 2026-09-26 [ABA-607](https://github.com/micode-ai/ai-budget-assistant/issues/631) — Android "Share → AI Budget": shared images/PDFs are copied natively at once (temporary content:// grant) and queued onto the existing receipt confirm card. Learned the hard way in review: a share-started task replays its SEND intent after process death, the native module exists before JS listens (hold until getInitialShare), and every exit from a queued file must advance the queue. Pages: `features/share-to-capture.md` (new), `index.md`.
- 2026-09-27 [ABA-608](https://github.com/micode-ai/ai-budget-assistant/issues/633) — real-salary API: spend-weighted personal inflation from Eurostat HICP (`prc_hicp_minr`/`coicop18` — the older dataset froze at 2025-12) vs salary change. Learned in review: an account-only cache key leaks one shared-account member's salary answer to the others; salary must be measured in pay periods and in its own currency; the 12m price-history index is a half-year change. Pages: `features/real-salary.md` (new), `index.md`, `features/personal-inflation-index.md`.
- 2026-09-27 [ABA-609](https://github.com/micode-ai/ai-budget-assistant/issues/635) — real-salary mobile: the three screens (`index`/`setup`/`settings`), the Analytics-tab entry banner, and the in-app help center's new `43-real-salary` section (9 languages). Documented three things worth remembering: the screens are online-only by design (no SQLite mirror, no offline fallback); the share card is percentages-only, the same rule as Wrapped/Inflation Shield; and `parseMonthlyAmount` accepts the same European number formats (comma/dot decimal, dot/comma/space/apostrophe thousands) users actually type for last year's salary. Pages: `features/real-salary.md`.
- 2026-09-27 [ABA-610](https://github.com/micode-ai/ai-budget-assistant/issues/637) — voice digest API: an opt-in weekly voice note (Telegram/WhatsApp/Slack) over deterministic facts, narrated by a cheap model and number-checked against them, with a channel registry so the core module imports no bot module. Learned in review: a stale channel-link account id would have kept reading an account the user had left (now re-checked for membership every run); the WhatsApp "Listen" delivery needed an atomic `GETDEL` claim to stay exactly-once. Pages: `features/voice-digest.md` (new), `index.md`, `slack-bot.md` (extended).
- 2026-09-27 [ABA-611](https://github.com/micode-ai/ai-budget-assistant/issues/639) — real-salary breakdown rows: at phone width the source badge truncated the group name to one letter and the share of spend read as an unlabelled rate; now two lines with a labelled share. Pages: none changed (layout only).
- 2026-09-27 [ABA-612](https://github.com/micode-ai/ai-budget-assistant/issues/640) — real salary found no salary on a shared account the pay was transferred into; salary incomes now come from all of the caller's active accounts, spend still from the open one. Pages: `features/real-salary.md`.
- 2026-09-27 [ABA-614](https://github.com/micode-ai/ai-budget-assistant/issues/642) — voice digest compared a week against a mean inflated by monthly rent ("91% less"); now everyday spend only (no isRecurring, no CP04 housing) and a median usual week, clearer wording. Pages: `features/voice-digest.md`.
- 2026-09-27 [ABA-615](https://github.com/micode-ai/ai-budget-assistant/issues/643) — a recurring series can now also be started from the expense EDIT screen, not only the create form: extended `useRecurringExpenseFields`/`RecurringExpenseFields` into `ExpenseDetailsCard` (additive, create form unchanged), gated on the expense not already being recurring. Found and fixed a real gap while checking the offline path: `syncPendingExpenses` (the retry push for an edit made offline, which resends via `createExpense`'s upsert) dropped isRecurring/recurringId/recurringPeriod entirely, silently un-recurring a series the user just started once the device reconnected. Pages: none — recurring expenses is still described inline in CLAUDE.md, not yet moved to the wiki.
- 2026-09-27 [ABA-616](https://github.com/micode-ai/ai-budget-assistant/issues/644) — technical docs (docs/en, docs/ru: API, ARCHITECTURE, SETUP) had not moved since 09-07; re-derived from controllers, schema and .env.example rather than commit messages. Pages: none (docs/ only).
- 2026-09-27 [ABA-617](https://github.com/micode-ai/ai-budget-assistant/issues/645) — real-salary classifier put generic categories (entertainment etc.) in TOTAL, and a full 50-item batch overflowed its flat 400-token cap so the truncated JSON was re-asked forever; new prompt, `completionBudget(n)`, `Category.coicopSource` (seed/model/user) whose migration clears existing TOTALs for one re-ask, and the settings list shows each category's 12-month spend with TOTAL/unassigned first. Pages: `features/real-salary.md`.
- 2026-09-27 [ABA-618](https://github.com/micode-ai/ai-budget-assistant/issues/646) — receipt CP01 rate ~35 % vs single-digit official food: no unit bug (the '12m' index is a half-year % change and squaring it is right), but with ~12 products one pack-size break under the same name takes +2 % to +16 % a half-year; the receipt rate now replaces official CP01 only within 10 pp of it (±30 % with no official data). Pages: `features/real-salary.md`.
- 2026-09-28 [ABA-621](https://github.com/micode-ai/ai-budget-assistant/issues/649) — `ActionResultCard.tsx`'s 12 inline AI-chat result renderers (803 lines) split into `chat/results/`, mirroring the `HomeWidgetSwitch.tsx` split; genuinely shared styles factored into one file instead of duplicated per card. Pages: `mobile-app.md`.
- 2026-09-29 [ABA-622](https://github.com/micode-ai/ai-budget-assistant/issues/650) — shopping-list items gain a user-typed `unitPrice` (account currency, no conversion) with still-to-buy / whole-list totals, a receipt-history price hint that only ever suggests, and prices on the guest page; found the offline pending sweep silently dropped quantity edits to already-synced items (idempotent create applies nothing) — the follow-up update now carries them. Pages: `features/shopping-list.md`.
- 2026-09-29 [ABA-623](https://github.com/micode-ai/ai-budget-assistant/issues/651) — shopping list gains a shelf price-tag scan (`POST /ai/scan-price-tag`, own `PriceTagService`, 1.0 AI request) that fills name/price/note in one item sheet for create or edit, never saves on its own; a tag in another currency goes to the note, never `unitPrice`. Pages: `features/shopping-list.md`.
- 2026-09-29 (no issue, query ritual) — purchase-request bot voting is inbound-only: the Telegram/WhatsApp handlers accept `pr_approve`/`pr_reject` but no code sends the buttons ("deferred to Phase 2"), so the page and CLAUDE.md no longer say members vote from the bots. Pages: `features/purchase-requests.md`.
- 2026-09-29 [ABA-624](https://github.com/micode-ai/ai-budget-assistant/issues/652) — price-tag scans from Android web never reached the API: `<input capture>` opens the camera app, Chrome discarded the tab and reloaded it (page re-download + new telemetry session ~12 s after opening the camera); new `features/camera/capturePhoto` shoots inside the page via getUserMedia on web. Receipts still on the old path. Pages: `features/web-build-and-hosting.md`, `features/shopping-list.md`.
- 2026-10-01 [ABA-627](https://github.com/micode-ai/ai-budget-assistant/issues/655) — after an account switch the wallet/portfolio could keep the previous account's amounts: the hydrate/expenses/incomes re-entry guards handed the new account's call the old account's promise (which then aborted), and wallet/investment stores neither cleared on account change nor guarded late summary writes. New `accountScopedInflight.ts`. Pages: `features/account-switch-reload.md` (new), `features/web-data-loading.md`.
- 2026-10-01 [ABA-628](https://github.com/micode-ai/ai-budget-assistant/issues/657) — Polish debt reminders told borrowers "Pożyczyłeś…" (both ternary branches were the lender's text); fixed and pinned for all 9 locales. Polish debts help rewritten with diacritics and the app's real labels. Pages: `features/debt-reminders.md` (owner-only + lent/borrowed invariants), `features/debts.md` (new).
- 2026-10-02 [ABA-630](https://github.com/micode-ai/ai-budget-assistant/issues/660) — a receipt scanned for a purchase already recorded from the bank showed only a duplicate warning; the scan-time match now finds push/import copies loosely, names the origin, and offers a "merge into one expense" box (server merges via `mergeWithExpenseId` before the anomaly check). Pages: `features/receipt-duplicate-warning.md`, `features/bank-notification-capture.md`.
- 2026-10-03 [ABA-632](https://github.com/micode-ai/ai-budget-assistant/issues/662) — the `ad-film` skill gained a living `PITFALLS.md` (symptom → fix from five films and the HyperFrames pencil test), story rules (turn at 35–45 %, 3 s static poster, non-empty frame 0, magnifier for payoff UI states) and a second house style: pencil (10–15 s calculation ads, kit in `D:\Work\tools\pencil-film`, HyperFrames render). No wiki page: tooling outside the product.
- 2026-10-05 [ABA-633](https://github.com/micode-ai/ai-budget-assistant/issues/663) — the `ad-film` skill gained a third house style, anime (shōnen comedy with likeness-sheet caricatures, reference project `D:\Work\tools\films\paragon-anime`, J-rock OP score), and `PITFALLS.md` gained the `paragon-anime` lessons: drawing-clock tolerance `+0.05`, one-hand-holds/other-hand-taps, no crossed forearms, likeness in rounds, cue ducking, no alcohol with a child in frame. No wiki page: tooling outside the product.
- 2026-10-05 [ABA-634](https://github.com/micode-ai/ai-budget-assistant/issues/664) — the `ad-film` skill gained a fourth house style, noir (the anime cast in fedora/trench, black dress and veil; a B&W grading pass with blinds and rain, only the brand orange in colour; reference project `D:\Work\tools\films\sprawa-pieniedzy`, noir-jazz score), and `PITFALLS.md` gained a caption reading-time rule and a Noir grade section. No wiki page: tooling outside the product.
- 2026-10-06 [ABA-636](https://github.com/micode-ai/ai-budget-assistant/issues/666) — the `ad-film` skill gained a fifth house style, a 1930s rubber-hose cartoon (pie-cut eyes, rubber-hose limbs, white gloves, beat bounce, a sepia/grain/scratch pass; reference project `D:\Work\tools\films\na-glos`, swing score with instruments singing the lines), and `PITFALLS.md` gained a 1930s-cartoon section (glove mirroring, bow as squash, iris, sync false positives). No wiki page: tooling outside the product.
- 2026-10-07 [ABA-637](https://github.com/micode-ai/ai-budget-assistant/issues/667) — a real ten-year Monefy export did not import although the parser read every row: the commit's per-row `create` overran Prisma's 5 s interactive-transaction default (now chunked `createMany` with a 120 s timeout), identical rows in one file shared an `externalRef` and all but the first were dropped (now suffixed `#N` by source `idx`), and Monefy's `To '…'`/`From '…'`/`Initial balance '…'` bookkeeping rows imported as spending (now dropped). Pages: `features/bank-statement-import.md`, `features/competitor-app-migration.md`.
- 2026-10-07 · [ABA-635](https://github.com/micode-ai/ai-budget-assistant/issues/665) audit issue — lint
  already clean (its 12 dead citations were fixed after it was filed). Read `shared-utils.md` (10
  commits behind) and `features/shared-conversations.md` against the code. `shared-utils.md` was the
  untouched May bootstrap and claimed the API consumes its Zod schemas in validation pipes — the
  deploy guard makes any API runtime import impossible; rewritten around what the package really is
  (mobile formatting/constants plus the offline mirrors of API-canonical pure functions, now tabled
  with both paths). **Flagged, not fixed:** none of the Zod schemas in
  `packages/shared-utils/src/validation/index.ts` is imported anywhere — dead code.
  `shared-conversations.md`: entry points still pointed at `chat.service.ts` for sharing/presence/
  confirm, moved out by ABA-592; the `notifySharedActivity` gate is in `NotificationsService`.
  Glanced: `help-content-pipeline.md` (its commits are `content.ts` regenerations), `api.md` and
  `offline-sync.md` (cite `schema.prisma` only as the source of truth — false positives).
  **Next targets:** `features/directory-badges.md`, `features/acquisition-tracking.md` (generator
  commits), `features/receipt-price-check.md`.
- 2026-10-07 [ABA-638](https://github.com/micode-ai/ai-budget-assistant/issues/668) — SEO/GEO/AEO pass on ai-budget.pl: `llms.txt`/`featureList` had drifted in all 9 languages (stale model name, missing BYN and three bank parsers, E2EE stated as default) and were corrected against the wiki; articles now have a named `Person` author with a stable `@id`, per-article OG cards, in-article calculators (marker-rendered, not separate URLs), a real `.xlsx` template, and help pages emit FAQPage from question headings. Content: comparison pages vs four competitors on "vs" intent (topic 24 owns "alternative"), per-bank import guides, a tax-refund piece, AEO restructure of six topics. Pages: `features/marketing-site.md`.
- 2026-10-08 [ABA-639](https://github.com/micode-ai/ai-budget-assistant/issues/669) — the `ad-film` skill gained three more house styles in a new section 1d: an 8-bit RPG battle (`pix.js`: native 360x640 drawing, palette snap, thresholded pixel text with Polish diacritics; subscription tracker), kinetic typography (`typo.js`; bank import) and a 90s desktop-OS parody (`os95.js`, our own "AI Budżet 95"; anomaly alerts), each with a reference project under `D:\Work\tools\films`, and `PITFALLS.md` gained their lessons. No wiki page: tooling outside the product.
- 2026-10-08 [ABA-645](https://github.com/micode-ai/ai-budget-assistant/issues/675) — phase 1 of iPhone reach without a native app: the landing on iOS hides Google Play buttons, repoints inline Play links to the web app (`loc=ios`) and shows a dismissible Add-to-Home-Screen bar; the web dashboard shows an `IosInstallCard` (pure rules in `features/install/iosInstall.ts`, native no-op sibling, in-app-browser variant) reporting the new `ios_install` telemetry flow. Phase 2 (a native iOS app) is undecided. Pages: `features/web-build-and-hosting.md`, `features/web-telemetry.md`, `features/marketing-site.md`.
- 2026-10-08 [ABA-641](https://github.com/micode-ai/ai-budget-assistant/issues/671) — monthly Wrapped: `GET /insights/wrapped?year=&month=` builds a one-month deck with its own cards (vs last month, biggest purchase, priciest weekday, merchant habit from two visits; savings only with income), a 1st-of-month push per user for their default account that fires only for a deck with data (opt-out `notifyMonthlyWrapped`, migration `add_notify_monthly_wrapped`), and Month in review entries on the Analytics tab. `rankCategories` is now shared by both assemblers. Pages: `features/financial-wrapped.md`.
- 2026-10-08 [ABA-643](https://github.com/micode-ai/ai-budget-assistant/issues/673) — first run leads with "import your last 3 months"; a commit of 10+ expenses opens a post-import report (`GET /import/batches/:id/report`, pure `buildImportReport`): categories, top merchants, untracked subscriptions (two monthly charges suffice), possible duplicates (flagged only), budget suggestions for unbudgeted categories; one tap creates the checked budgets and subscriptions, with renewal dates rolled forward so the subscription manager cannot re-book an imported charge. `importStore.origin` lets an onboarding import end onboarding. New telemetry flow `import_report`. Pages: `features/bank-statement-import.md`, `features/first-run-onboarding.md`, `features/web-telemetry.md`.
- 2026-10-08 [ABA-640](https://github.com/micode-ai/ai-budget-assistant/issues/670) — shared expense groups by link: a standalone model (members are rows, NULL `userId` = guest; not an `AccountType`, no `Expense` rows), the trip calculators reused for shares/balances/`simplifyDebts` with settlements as synthetic entries, settle validated before write plus a CAS on `ledgerVersion`, and a script-free `g/` guest page (hashed path-scoped cookie, per-member CSRF, origin check on join/restore, fail-closed write ceilings, restore code in a POST body, rotation resets claims) with single-use guest-to-account link codes. Corrected the stale "`GuestController` is the only unauthenticated surface" claim (`s/`, `sl/`, `g/`), and recorded that `@Throttle` does nothing without a per-route `ThrottlerGuard`. Pages: `features/shared-groups.md`, `features/receipt-split.md`.
- 2026-10-09 [ABA-644](https://github.com/micode-ai/ai-budget-assistant/issues/674) — e-receipts by e-mail forwarding, shipped dark: a receive-only SMTP container (`apps/inbound-mail`, compose profile `inbound-mail`, off unless `INBOUND_MAIL_CONTAINER=true`) hands each message to an internal API guarded by nginx case-insensitive 404 + no-forwarded-headers + private-CIDR socket peer + 32-char shared secret, answering 250 only after persist and 451 when the API is down; messages land in an `InboundReceipt` staging table the user confirms from (never auto-saved), deduped on Message-ID+content hash, pre-filtered and refunded so non-receipts cost no quota, under atomic fail-closed per-address caps; nothing in a mail is fetched; Gmail forwarding codes need a single aligned google.com DKIM From, matching RCPT and a fresh Date, shown only in-app for 30 min; tier 2 E2EE refused everywhere, tier 1 kept 7 days. Activation (DNS, firewall, cert, secret) not done. Pages: `features/inbound-e-receipts.md`.
- 2026-10-09 [ABA-642](https://github.com/micode-ai/ai-budget-assistant/issues/672) — anti-Sybil layer for the Community Price Map: the server signs what its own OCR read (images and scanned PDFs only; never text-layer PDFs, plain text or e-mailed receipts), one contributor key per person, one physical receipt once, per-person limits failing closed, ≥5 clusters with ≥2 trusted plus persistence counted on ingest weeks, MAD filter, bucketed counts, consensus store pins; reads free on every tier but served only with read + correlation flags on. Existing data kept (user decision) and excluded via `attested`. Pages: `features/community-prices.md`, `features/receipt-price-check.md`.
