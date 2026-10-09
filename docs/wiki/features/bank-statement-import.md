# Bank statement import

*Hub: [api](../api.md) · related: [ai-statement-import](ai-statement-import.md),
[competitor-app-migration](competitor-app-migration.md)*

## What this is

Importing transactions from bank exports — CSV and PDF statements from Polish banks and Revolut
(`import-bank`), Wise CSVs (`import-wise`) — with preview, dedup, saved column mappings,
rollback, and a request-a-bank path for banks not yet supported.

## Entry points

- `apps/api/src/modules/import-bank/` — `import-bank.service.ts` (orchestrator),
  `import-bank-dedup.service.ts`, `ai-preview.service.ts`, `ai-pdf.service.ts`,
  `import-bank-category.util.ts`, `parsers/registry.ts` + `parsers/*.parser.ts`, `utils/`,
  `merchants/merchants-pl.ts`
- `apps/api/src/modules/import-wise/`
- `apps/api/src/modules/import-batches/` — history and rollback
- Mobile: `apps/mobile/app/settings/import/` (hub, preview, mapper, request-bank),
  `app/settings/wise-import.tsx`, `useImportStore`

## Key concepts

**A strategy registry of parsers.** Each implements `BankParser { id, displayName, detect(),
parse(), format? }`; `universal.detect()` always returns `false`, so it is only ever chosen. The
preview flow is `decodeCsvBuffer` (UTF-8 / Windows-1250 auto-detect) → dispatch (mappingId → bankId
→ saved fingerprint → auto-detect) → normalized rows → `pairFxRows` (same date, opposite sign,
different currency) → `buildExternalRef` → dedup. A `%PDF` header switches to text extraction and a
PDF parser (Erste, Alior), skipping CSV header/mapping/fingerprint logic. When nothing recognises
the file, see [ai-statement-import](ai-statement-import.md).

**Visible vs registered banks.** Wise, mBank, PKO, Revolut, Erste, Alior and Other are shown;
ING, Millennium and Pekao are registered but hidden in `BANKS` until validated against real
exports. mBank and PKO were rewritten against real exports (mBank has a metadata preamble before
`#Data operacji…#Kwota`; PKO is comma-delimited with one signed `Kwota`). Revolut imports only
`State=COMPLETED` rows, with per-row currency.

**Wise is its own module.** Rows classify as expense (Amount < 0), income (> 0) or `fx` — paired
conversion rows sharing reference, date and opposite sign, emitted as a `CurrencyExchange`, not an
`AccountTransfer`, since Wise FX is in-wallet. `Total fees` folds into the amount.

**Merchant names are normalized.** `normalizeMerchantPL` maps brand substrings to one canonical name
(`BIEDRONKA 1234 WARSZAWA` → `Biedronka`), longest key first, in preview and again at commit.
`NETTO` is deliberately **not** in the canonical map — it collides with the accounting term "kwota
netto" — and stays only in the category-hint map. Learned per-account rules override the static
hints (see `merchant-rules`, which is applied before the transaction opens).

**Saved mappings** (`csv_import_mappings`, unique on `[accountId, headerFingerprint]`) re-apply a
column mapping to the next file with the same header.

**Request a bank** forwards the file and name to the **ops** Telegram chat, never the user.

### The report after an import (ABA-643)

A commit that created at least `MIN_REPORT_EXPENSES` (10) expenses no longer ends on the
"imported N rows" alert: `preview.tsx` replaces itself with `settings/import/report?batchId=`,
which renders `ImportReportView` over `GET /import/batches/:id/report`. The endpoint is
`ImportReportService` (IO, kept out of `ImportBatchesService` so the import modules that inject
that service do not inherit an FX dependency) over the pure `buildImportReport`
(`import-batches/import-report.util.ts`). It reads only the batch's own rows, in the caller's
display currency, and returns: period and monthly average, categories (`rankCategories`, shared with
Wrapped), top merchants, **subscriptions** (same normalized payee + amount + currency at a monthly
or weekly cadence, not already tracked), **possible duplicates** (same payee + amount + currency
within a day, inside the batch), and **budget suggestions** (top categories without an active
budget allocation, monthly average rounded up by `niceBudget`).

One tap ("Set up selected") creates the checked budgets through `budgetStore.addBudget` and tracks
the checked subscriptions through `userSubscriptionStore.createSubscription`; nothing is created
before it. `exitImportFlow` (`features/import/importExit.ts`) decides where the flow ends: back to
settings, or — when `importStore.origin === 'onboarding'` — the end of onboarding.

## Invariants

**Dedup keys are permanent.** `bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(desc)[0..8]>`
and `wise:<TransferWise ID>`, stored as `externalRef` under `@@unique([accountId, externalRef])` on
Expense, Income and CurrencyExchange (NULLs are distinct in Postgres). A parser id, once shipped, is
part of every key it produced.

**Identical rows in one file are distinct transactions (ABA-637).** The key carries no time of day,
so buying the same thing twice in a day produces two equal keys, and `dropDuplicateRows` used to
keep only the first. `disambiguateRepeatedRefs` (in `build-external-ref.ts`, run by
`buildPreviewResponse` for every parser and the AI paths) suffixes the Nth repeat `#N`, numbered by
source `idx` — never by array position, since `pairFxRows` reorders — so re-importing the same file
reproduces the same keys. The first occurrence keeps the bare key, so files imported before the
change still dedup against what they created.

**Two dedup layers in preview.** Exact `externalRef` match (re-importing the same file), then
`flagContentDuplicates` — `(date, signedAmountCents, currency)` against all of the account's
expenses and incomes regardless of source, greedy one-to-one, FX excluded. Matches are marked
`alreadyImported` and unchecked. `Expense.date`/`Income.date` are `@db.Date`, so the date match is
exact.

**Drop duplicates BEFORE opening the transaction (ABA-313).** Postgres aborts the whole
transaction on the first unique violation (later statements fail with `25P02`), so the old
catch-P2002-and-continue crashed the entire import. `dropDuplicateRows` removes refs already in the
DB and intra-batch repeats first; any failure inside the transaction aborts the whole import — a
poisoned transaction cannot continue. This covers what `alreadyImported` misses: repeats within one file and
rows imported between preview and commit.

**The commit inserts with chunked `createMany` under an explicit timeout (ABA-637).** One `create`
per row inside an interactive `$transaction` overran Prisma's 5 s default on a ~12k-row history and
rolled the whole import back. Rows are built first, then written 1000 per statement inside a
transaction with `timeout: 120_000`. Expense ids are generated in the service because `createMany`
returns no rows and `checkExpenseBatch` needs them. Do not reintroduce per-row writes there.

**Every commit writes an `ImportBatch` in the same transaction** and stamps its rows with
`importBatchId`. Rollback (`DELETE /import/batches/:id`, within 30 days of a committed batch) sets
`isDeleted` **and nulls `externalRef`**, so the same file can be imported again.

**Keep `ImportBankService` an orchestrator.** It was split from 1 188 lines into the dedup, AI
preview, AI PDF and category-util pieces; a new concern extends one of those, not the orchestrator.
The controller's `POST /import/bank/ai-consent` injects `ImportBankAiPreviewService` directly.

**A suggested subscription's renewal date is rolled forward to today or later before it is created**
(`rollForwardRenewal`). A statement is history, so its "next charge" is often already past, and the
subscription manager books a renewal as an expense once that date is due — a past date would re-book
a charge the import has just brought in.

**Duplicates are only flagged, never removed, and the copy says "worth checking".** Two identical
charges a day apart are usually two real purchases; the report cannot tell.

**The subscription detector is deliberately more lenient than the anomaly one** (two monthly-spaced
charges, not three): a three-month statement holds only two or three charges of a monthly
subscription, and the user confirms each one before anything is tracked.

## Desktop (the post-import report)

At ≥1024 px web, **ABA-646** gives the report (`/settings/import/report`) its own page. Nothing here is
rendered in CI; it is unverified until someone looks at the deployed build.

- **Decider.** `ImportReportScreen` (`apps/mobile/src/components/import/`): the native file renders
  `ImportReportView`; the `.web.tsx` renders `desktop/ImportReportDesktop` at ≥1024.
- **One hook for both.** `apps/mobile/src/hooks/useImportReport.ts` holds the load, the pick sets,
  `apply` and the `started` / `completed` telemetry; the phone view and the desktop page both read it.
  Its `status` is `loading | failed | insufficient | ready` (pure `resolveImportReportStatus`). **A
  failed load and "not enough data" are different states.** The import succeeded in both, but only a
  failure can be retried. The desktop page shows `importReport.loadFailed` with Retry and Done for the
  first and the existing `noReport` text for the second; the phone maps both to the screen it has
  always shown.
- **Layout.** A centred page capped at 1200px (a departure from fill-the-area, since a two-column
  report across 1900px is a void): three `SummaryTile`s and the `fxApproximate` footnote, then a main
  column ("where it went", top merchants) and a 380px side column (subscriptions, budgets,
  duplicates). Below 1440 the side column drops under the main one.
- **Sticky action bar.** `position: sticky; bottom: 0` inside the one page scroll: "Set up selected (N)"
  and Skip, or Done once applied. A plain in-flow footer is the fallback if it misbehaves.
- **Shared rows, not copies.** `ImportReportCategoryRows` and `PickRow` are exported from
  `ImportReportView.tsx` with a `desktop` flag (default false); the desktop page uses the same
  `createImportReportStyles`. No keyboard shortcuts are registered: it is a short one-time form.

## Known gaps

- ING, Millennium and Pekao are unvalidated against real exports.
- The desktop report's sticky action bar, and `Space` toggling a `role="checkbox"` row on
  react-native-web, are unverified in a browser.
- `AnomalyService.checkExpenseBatch` runs its detectors over every imported expense one by one; on
  a multi-year history that is a very long fire-and-forget pass and may raise alerts about old data.

## History

Wise import · ABA-126 (Polish banks) · ABA-116 (Revolut) · ABA-130 (batch history) · ABA-254
(merchant normalization) · ABA-313 (commit dedup crash) · the service split · ABA-637 (chunked
commit, repeated rows in one file) · ABA-643 (the post-import report).
