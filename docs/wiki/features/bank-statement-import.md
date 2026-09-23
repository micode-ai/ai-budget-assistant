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

## Invariants

**Dedup keys are permanent.** `bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(desc)[0..8]>`
and `wise:<TransferWise ID>`, stored as `externalRef` under `@@unique([accountId, externalRef])` on
Expense, Income and CurrencyExchange (NULLs are distinct in Postgres). A parser id, once shipped, is
part of every key it produced.

**Two dedup layers in preview.** Exact `externalRef` match (re-importing the same file), then
`flagContentDuplicates` — `(date, signedAmountCents, currency)` against all of the account's
expenses and incomes regardless of source, greedy one-to-one, FX excluded. Matches are marked
`alreadyImported` and unchecked. `Expense.date`/`Income.date` are `@db.Date`, so the date match is
exact.

**Drop duplicates BEFORE opening the transaction (ABA-313).** Postgres aborts the whole
transaction on the first unique violation (later statements fail with `25P02`), so the old
catch-P2002-and-continue crashed the entire import. `dropDuplicateRows` removes refs already in the
DB and intra-batch repeats first, and the per-row `catch` rethrows everything — a poisoned
transaction cannot continue. This covers what `alreadyImported` misses: repeats within one file and
rows imported between preview and commit.

**Every commit writes an `ImportBatch` in the same transaction** and stamps its rows with
`importBatchId`. Rollback (`DELETE /import/batches/:id`, within 30 days of a committed batch) sets
`isDeleted` **and nulls `externalRef`**, so the same file can be imported again.

**Keep `ImportBankService` an orchestrator.** It was split from 1 188 lines into the dedup, AI
preview, AI PDF and category-util pieces; a new concern extends one of those, not the orchestrator.
The controller's `POST /import/bank/ai-consent` injects `ImportBankAiPreviewService` directly.

## Known gaps

- ING, Millennium and Pekao are unvalidated against real exports.

## History

Wise import · ABA-126 (Polish banks) · ABA-116 (Revolut) · ABA-130 (batch history) · ABA-254
(merchant normalization) · ABA-313 (commit dedup crash) · the service split.
