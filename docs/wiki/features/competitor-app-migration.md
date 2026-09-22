# Competitor app migration

*Hub: [api](../api.md) · Related: [ai-statement-import](ai-statement-import.md)*

## What this is

Importing the export files of other budgeting apps — Monefy, Wallet by BudgetBakers, Money Manager
(and 1Money, whose shape is near-identical) — so a user switching to us keeps their history **and
the categories they built there**, instead of having them re-guessed from merchant names.

## Entry points

- `apps/api/src/modules/import-bank/parsers/monefy.parser.ts`, `wallet.parser.ts`,
  `moneymanager.parser.ts` — same `BankParser` interface and registry as the bank parsers
- `apps/api/src/modules/import-bank/parsers/registry.ts` — `PARSERS` order, `detectParser`
- `apps/api/src/modules/import-bank/import-bank.service.ts` — `parsePreview`, including the
  picked-parser fallback
- `apps/api/src/modules/import-bank/import-bank-category.util.ts` — `preloadCategories`
- `apps/mobile/src/features/import/importEntries.ts` — `MIGRATION_ENTRIES`, `importSourceLabel`
- `apps/mobile/app/settings/import/index.tsx` — the "Moving from another app?" card
- `apps/mobile/app/settings/import/preview.tsx` — commit, and the `bankId` it records

## Key concepts

**These files imported before the dedicated parsers existed**, through AI mapping. A dedicated
parser buys a model call not spent, the exporting app's own categories carried across, and a named
entry point.

**Per-format gotchas.** Monefy emits `currency` twice (raw and converted), so it is parsed in array
mode — a keyed parse silently collapses the pair. Wallet states Expense/Income explicitly, marks
`transfer` rows (dropped: not spending, and mapping them needs account mapping this import lacks),
and restates amounts in its own base currency via `refAmount`/`refCurrency` (ignored; the
transaction's own currency wins).

**"Money Manager" is two unrelated apps, and one parser reads both.** Users pick the same entry
for either. The *full* shape (Realbyte, and 1Money) is
`Date,Account,Category,Subcategory,Note,Amount,Income/Expense,Description,Currency,Account Type`;
Category and Subcategory are joined (`"Food / Groceries"`). The *simple* shape, from a real
user's export (ABA-582), is `ID,Date,Type,Title,Amount,Note`: UTF-8 BOM, a date with a time
(`dd/MM/yyyy - hh:mm AM`), a currency **symbol** inside the amount (`$ 10`) instead of a currency
column, `Title` as the category, and `Expenses` in the plural. Both write amounts unsigned, so the
direction column is the only source of direction. Columns are read by lower-cased name.

**Slash-date order is decided per file, from the data**: a first field above 12 means day-first,
a second above 12 means month-first, and an all-ambiguous file defaults to day-first. A month
outside 1..12 drops the row rather than producing an invalid ISO date.

**Categories are created before the transaction.** `preloadCategories` resolves every distinct
`(suggestedCategoryName, kind)` before the commit `$transaction` opens and creates the missing
ones there, for the same reason `dropDuplicateRows` runs there: a P2002 inside a Postgres
transaction poisons it. Matching is case-insensitive, keyed `` `${type}:${name.toLowerCase()}` ``.

**A picked parser that reads nothing falls back (ABA-581).** Picking an app sends `bankId`, which
skips `detect()` entirely. When that parser returns zero rows, `parsePreview` tries another
parser's `detect()` and then `tryAiMapping` — the path an unrecognised file takes — instead of
returning an empty preview.

**The recorded source is the parser that read the file.** Mobile commits with
`bankId: preview.detectedBankId`, not the picked id, since the server may have fallen back. That
value becomes `ImportBatch.source` (`bank:<id>`) and the "Past imports" label.

## Invariants

**Parser ids are permanent.** `buildExternalRef` embeds the parser id in the dedup key, so renaming
one makes every previously imported row importable again.

**The id union is declared twice** — `parsers/parser.interface.ts` and
`packages/shared-types/src/dto/import.ts` — and both must be extended together. The commit DTO's
validator derives from `PARSERS` and needs no edit; it used to be a hand-written list, which is how
the three competitor ids were rejected with a 400.

**Detection stays tight.** A parser that claims a foreign format produces plausible rows with the
wrong columns read, whereas an unclaimed file still imports via AI mapping. `registry.spec.ts`
asserts no competitor parser claims another's fixture.

**Do not reorder `PARSERS` around PKO and Pekao.** The Pekao detector also matches a PKO export;
PKO statements parse correctly only because `pko` sits before `pekao`.

**A forced parser must never end in a silent empty preview.** Zero rows with HTTP 201 and no error
leaves the user nowhere to go, and it leaves nothing in the API log either — the only trace was a
~205-byte response in the nginx access log.

## Known gaps

- **Monefy, Wallet and the full Money Manager shape are still unverified against real files.**
  The simple Money Manager shape is the only one checked against a real export (ABA-582). Monefy
  and Wallet still use the shared `parsePolishDate`, which reads a slash date day-first and never
  validates the month; the per-file order detection lives only in the Money Manager parser.
- An amount with no currency symbol falls back to `PLN`: `parsePreview` does not pass the
  user's display currency to a named parser (only the AI path resolves one).
- The picked-parser fallback exists on the CSV/XLSX path only, not on `parsePdfPreview`.
- `importSourceLabel` must search both `IMPORT_ENTRIES` and `MIGRATION_ENTRIES`, or a past
  migration import renders its raw parser id.

## History

- ABA-401 — the three parsers, category creation before the transaction, the migration card.
- ABA-581 — a real Money Manager export produced an empty preview; picked-parser fallback, commit
  DTO derived from the registry, commit records the detected parser.
- ABA-582 — the Money Manager parser reads the simple export shape, with per-file date order.
