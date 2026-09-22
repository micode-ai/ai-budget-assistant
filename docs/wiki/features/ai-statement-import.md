# AI universal statement import

*Hub: [ai-features](../ai-features.md) · [api](../api.md)*

## What this is

When no bank parser recognises an uploaded statement, an LLM either infers the CSV/XLSX **column
mapping** — which the existing deterministic `UniversalParser` then uses — or, for PDFs, extracts
the rows directly. Everything downstream (preview → dedup → commit → rollback) is untouched.

## Entry points

- `apps/api/src/modules/import-bank/ai/` — the AI path, with its **own** `new OpenAI(...)`
- `ai/statement-ai.validator.ts` — `validateMappingResponse`
- `ai/balance-check.ts` — the PDF reconciliation
- `apps/api/src/modules/import-bank/parsers/ai-statement.parser.ts` — `detect()` always false
- `apps/api/src/modules/import-bank/utils/delimiter.ts`, `utils/xlsx-to-csv.ts`
- `apps/mobile/app/settings/import/ai-consent.tsx`, `src/components/import/AiMappingChips.tsx`
- `apps/mobile/src/features/import/` — `resolveMapperInitialState`, `buildCommitMappingContext`,
  `previewNotices`

Migration: `20260809120000` (`bank_statement_signatures`).

## Key concepts

**Hook point** is the `if (!parser)` branch of `parsePreview` / `parsePdfPreview`. Resolution order
gains two links: `mappingId` → `bankId` → per-account saved mapping → `detectParser` → **global
signature** → **AI inference**.

**`AiModule` is deliberately not imported.** It pulls in eleven modules, and `@TrackAiUsage` /
`AiUsageGuard` live in `subscriptions/` anyway, so the fat dependency buys nothing. Only
`SubscriptionsModule` is added, for the PDF gate.

**A global signature dictionary.** `bank_statement_signatures` holds only column names, a delimiter
and two format hints — no accountId, no userId, no rows, which is what makes a global row safe. The
second user of any bank costs zero LLM calls.

**Tiering.** Inference is free and stays outside the monthly AI limit; its ceiling is a daily Redis
counter (`aiimp:{accountId}:{YYYY-MM-DD}`), deliberately not `usage_logs`, whose only writer is
`trackAiUsage`. PDF extraction is Pro, pre-checks remaining quota before spending money, and
increments only after success.

## Invariants

**The model never emits an amount or a date on the CSV path.** It returns column *names*, and each
is checked against the file's real header cells with exact matching — a `Set`, not an object map,
whose `Object.prototype` keys would be false positives. Any invented name rejects the whole
response, **including optional ones**: silently dropping an invented `currency` would produce a
plausible import in the wrong currency.

**`parser.id` stays `'universal'` on the CSV path.** `buildExternalRef` embeds the parser id in the
dedup key, so an AI-inferred and a hand-mapped import of the same file produce byte-identical
`externalRef`s. An invariant test pins this; do not weaken it. PDF uses `'ai'`, which is filtered
out of `detectPdfParser` and both `supportedBanks` lists.

**Self-quarantine must be able to trigger.** `find()` returns `null` once
`correctedCount > confirmedCount`, and a commit **either** confirms **or** corrects — never both,
or the counters could never diverge and quarantine would be dead code. The decision is structural:
compare the mapping that actually parsed the file against the dictionary's stored one. Keying it off
`dto.saveMapping` pinned `correctedCount` at zero, because no mobile UI ever sets that flag — the
very defect quarantine exists to prevent, one level down.

**There is no `useAi` field.** The flow is `preview` → `needs_ai_consent` → `POST /ai-consent` →
re-request `preview`. Consent is one-time per account and written only by that endpoint, which
carries `ViewerBlockGuard` — `POST /preview` is unguarded, so a viewer must not be able to enable
LLM processing account-wide.

**Never a 5xx from the AI path.** Every failure degrades to `needs_picker` or `needs_mapping`.

**Never silent completeness.** A PDF response carries `extractionWarning` unless the row sum
actually reconciles against closing − opening; absent balances yield `'no_balance'`, not `undefined`.

**Declining consent is not AI-prefilled.** `needs_ai_consent` never carries `aiMapping` — declining
happens before any inference has run — so the manual mapper falls back to positional guesses, the
same as for an unrecognised bank. It is the *result-shown* mapper entries that land prefilled.

**Echo the parse context on a successful AI preview** (`headers`, `sampleRows`, `delimiter`,
`amountFormat`, `dateFormat`). Without them the "Wrong? Tap to fix" chip opened a mapper with every
column picker empty, falling back to hardcoded defaults — which for a comma- or tab-delimited file
silently re-parsed to zero rows while `isValid` stayed `true`.

**Send the fingerprint on every commit that has one**, not only after a mapper visit. A plain
AI-accepted import used to send none, so neither counter ever moved for it.

## Known gaps

- A `mappingId`-selected or per-account fingerprint-matched **saved** mapping still receives only a
  client-supplied delimiter override, never the saved row's own `delimiter` column, so a genuinely
  comma- or tab-delimited saved mapping parses zero rows on those two paths.
- The PDF branch's echoed `headers` are raw extracted text lines, not column names.
- A statement with no currency column takes the user's currency and flags `currencyAssumed`.
- The `Currency` allow-list is API-local (runtime imports from `@budget/shared-types` are forbidden
  there) and must track `packages/shared-types/src/entities/primitives.ts` by hand.

## History

ABA-390 (the feature) and the 2026-08-10 fix wave (quarantine keyed structurally, parse context
echoed, commit bookkeeping, consent copy naming a third-party provider). Two pre-existing bugs were
fixed alongside: `peekHeaders` hardcoded `';'`, which is why **Revolut auto-detection never fired** —
its `detect()` needs `'started date'` as its own cell — and XLSX uploads are now normalised to CSV
*before* fingerprinting, so nothing downstream learns it was a spreadsheet.
