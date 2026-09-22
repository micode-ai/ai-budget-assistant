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
transaction's own currency wins). Money Manager writes every amount unsigned, so its
`Income/Expense` column is the only source of direction; Category and Subcategory are joined
(`"Food / Groceries"`).

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

- **The parsers were written without real export files.** Money Manager's was modelled on
  Realbyte's *import* template, and a real export did not match it (ABA-581). Expect corrections on
  first contact with each format, most likely in the date: a slash date is read day-first and the
  month is never validated, while Money Manager is documented to write `mm/dd/yyyy`.
- The picked-parser fallback exists on the CSV/XLSX path only, not on `parsePdfPreview`.
- `importSourceLabel` must search both `IMPORT_ENTRIES` and `MIGRATION_ENTRIES`, or a past
  migration import renders its raw parser id.

## History

- ABA-401 — the three parsers, category creation before the transaction, the migration card.
- ABA-581 — a real Money Manager export produced an empty preview; picked-parser fallback, commit
  DTO derived from the registry, commit records the detected parser.
