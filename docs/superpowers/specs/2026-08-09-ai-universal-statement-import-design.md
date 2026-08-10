# AI Universal Statement Import — Design (v1)

Import a bank statement from **any** bank, in any of the 9 supported markets,
without anyone writing a parser for it first.

Source idea: `docs/product-ideas/ai-universal-statement-import.md`.

## Why this is worth building

Import is the highest-leverage moment in the funnel — a user with six months
of history sees real analytics, a real inflation index, a real Wrapped, and
converts. Today that moment is gated on whether *we* wrote a parser: 8 banks
out of hundreds, and the fallback is a manual column mapper the average user
will not finish.

The pain is already measured in the codebase. `POST /import/bank/request-bank`
exists solely to forward an unsupported statement to an ops Telegram channel —
i.e. "my bank isn't supported" is a recurring support ticket we built tooling
for. One LLM call replaces every future parser: the marginal cost of
supporting bank #9 through #900 drops to zero, in all 9 languages, without us
ever seeing a sample file.

## Locked decisions (from brainstorming)

1. **Scope:** CSV + XLSX (mapping inference) **and** PDF (row extraction).
2. **Consent:** automatic trigger when detection fails, behind a one-time
   per-account consent screen. Manual mapper stays as "I'll map it myself".
3. **Tier:** mapping inference is **free** and does **not** consume the
   monthly AI limit — burning a new user's 50 free requests on onboarding is
   self-defeating. PDF extraction is **Pro** and is tracked.
4. **Cache:** a **global** signature dictionary keyed on `headerFingerprint`,
   with the existing per-account `csv_import_mappings` as the override.
5. **Architecture:** self-contained inside `import-bank`, own OpenAI client.
   No dependency on `AiModule`.

### Non-goals for v1

- No image/screenshot statements (PDF text only — `extractPdfText`, not vision).
- No account/IBAN detection, no multi-account statements.
- No admin UI over the signature dictionary (self-quarantine instead — see
  below). Deferred, not rejected.
- Nothing changes for a statement that an existing parser already detects.

## Architecture

```
import-bank/
  ai/
    statement-ai.service.ts    own OpenAI client (repo convention)
    statement-ai.prompt.ts     pure prompt builders — unit-testable
    signature.service.ts       Prisma-only leaf: the global dictionary
    ai-statement.parser.ts     BankParser, id 'ai', format 'pdf'
  utils/
    xlsx-to-csv.ts             pure: workbook buffer → CSV text
```

`ImportBankModule` additionally imports `SubscriptionsModule` — only for the
tier check and usage tracking on the PDF branch.

### Why not put this in `AiModule`

The obvious alternative — a `POST /ai/parse-statement` endpoint in `AiModule` —
was rejected. Its main argument ("all AI lives in one module, and that's where
`@TrackAiUsage` works") does not survive checking: the decorator and
`AiUsageGuard` live in `subscriptions/`, not in `AiModule`, so cost tracking
and the Pro gate are reachable from `import-bank` directly. What would have
remained is a fat dependency — `AiModule` itself imports 11 modules (Expenses,
Incomes, Budgets, Categories, Analytics, Debts, Accounts, CurrencyExchange,
Insights, ShoppingList, PriceHistory) — plus an import flow split across two
modules.

Every AI service in this repo constructs its own `new OpenAI(...)`
(`ocr`, `chat`, `whisper`, `categorization`, `embedding`, `goal-planner`,
`tag-suggestion`, `project-suggestion`, `split-suggestion`). There is no
shared OpenAI provider to reuse; a local client is the convention, not a
workaround.

## Hook point — one branch, everything downstream untouched

The insertion point is the `if (!parser)` branch of `parsePreview` /
`parsePdfPreview` — the one that today returns `needs_picker`.

Everything below it is untouched: `buildPreviewResponse` → `flagContentDuplicates`
→ `flagPossibleMerges` → `buildExternalRef` → commit → `dropDuplicateRows` →
`ImportBatch` rollback.

### Parser resolution order (new links in bold)

`mappingId` → `bankId` → per-account saved mapping → `detectParser` →
**global signature** → **AI inference**

A global-dictionary hit costs zero LLM calls and zero latency.

## Flow: CSV and XLSX

1. **XLSX normalization.** Detect XLSX by zip magic (`PK\x03\x04`) plus an
   `xl/` entry, and convert the first sheet with a plausible header row to CSV
   text via `exceljs` (already a dependency, used by
   `reports/generators/excel-generator.ts`). This happens immediately after
   `decodeCsvBuffer` and **before** `headerFingerprint`, so fingerprinting,
   `UniversalParser`, the mapping cache, and the manual mapper all work
   without knowing the file was a spreadsheet. One new step, zero new branches.
2. **Delimiter sniffing.** `peekHeaders`/`peekSampleRows` currently hardcode
   `delimiter: ';'`, so a comma-delimited export yields a single merged header
   cell. The model would be shown that merged cell and could not name a
   column, so a new pure `sniffDelimiter(text)` runs first and its result is
   passed to both peek helpers and on to `UniversalParser`. This also repairs
   `RevolutParser.detect()`, which needs `'started date'` as its own header
   cell and therefore never fires on auto-detect today.
3. Headers, sample rows and fingerprint as today, using the sniffed delimiter.
4. Resolution order above.
5. Global hit → `UniversalParser` with the stored mapping. Done, no LLM.
6. Miss, and no consent recorded → return the new status `needs_ai_consent`,
   carrying `headers` / `sampleRows` / `headerFingerprint` so the client can
   offer both "parse it with AI" and "I'll map it myself". (On the PDF path the
   same status carries the first 20 extracted lines instead, mirroring what
   `parsePdfPreview` already puts in `headers` for `needs_picker`.)
7. Consent present (or just granted, client re-requests with `useAi: true`) →
   one LLM call → validated mapping → `UniversalParser` → on ≥1 valid row,
   write the signature to the global dictionary → `parsed` response with
   `aiInferred: true` and the mapping echoed back for display/editing.

### The parser id stays `'universal'` on this path — deliberately

`buildExternalRef(parser.id, row)` puts the parser id into the dedup key
(`bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(desc).slice(0,8)>`).
Because the AI path hands off to the real `UniversalParser`, we keep
`parser.id === 'universal'`, which makes the `externalRef` of an AI-parsed
file **byte-identical** to that of the same file mapped by hand.

If we minted a distinct `'ai'` id here, a user who imported once via AI and
once via the manual mapper would fall through `externalRef` dedup entirely and
rely on `flagContentDuplicates` alone. That's a silent downgrade of the
strongest dedup layer, for no benefit.

## Flow: PDF

1. `detectPdfParser` fails → same consent gate.
2. **Tier check + usage tracking happen in the service, not as route
   decorators** — the gate depends on the *uploaded file type*, which a route
   decorator cannot see. The PDF branch checks the tier and calls
   `SubscriptionsService.trackAiUsage(userId, 'ocr', 2.0, accountId)` inline;
   that method is public and is exactly what `AiUsageGuard` itself calls.
3. Page-chunked extraction, one LLM call per page, capped at
   `AI_IMPORT_MAX_PDF_PAGES` (default **20**) with a **30 s** per-page timeout.
   Note this cap is deliberately *not* `renderPdfToPngs`'s `maxPages = 4` —
   that is a receipt cap; a 12-month statement is routinely 10–15 pages. Pages
   beyond the cap are dropped and reported in the response, never silently.
4. Rows → the same `ParserResult` shape → `buildPreviewResponse`.
5. Parser id here is `'ai'` — there is no deterministic equivalent to defer to.

### Balance reconciliation

Where the statement text carries opening/closing balances, verify
`Σ rows == closing − opening`. On mismatch, still show the preview, but with an
explicit "some rows may not have been recognised — check before importing"
banner. When no balance is present there is nothing to check against, so the
banner shows for **every** extraction-path import.

Never a silent partial import.

## Storage

```prisma
model BankStatementSignature {
  id                String   @id @default(uuid())
  headerFingerprint String   @unique @map("header_fingerprint")
  mapping           Json
  delimiter         String?
  amountFormat      String?  @map("amount_format")
  dateFormat        String?  @map("date_format")
  bankLabel         String?  @map("bank_label")   // model's guess, display only
  confirmedCount    Int      @default(0) @map("confirmed_count")
  correctedCount    Int      @default(0) @map("corrected_count")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@map("bank_statement_signatures")
}
```

No `accountId`, no `userId`, no statement rows — **column names only**, plus a
delimiter and two format hints. That is what makes a global row safe to share.

- Created at **preview** time, after a parse that produced ≥1 valid row, with
  `confirmedCount = 0`. It is servable immediately — a parse that yielded rows
  is already evidence the mapping works.
- `confirmedCount++` on a successful commit.
- `correctedCount++` when the user edits an AI-suggested mapping in the mapper.
  Their correction is written to their own `csv_import_mappings` and **never**
  overwrites the global row.
- **Self-quarantine:** when `correctedCount > confirmedCount`, the row stops
  being served. A bad inference degrades to "ask the AI again", not to a wrong
  mapping served to every future user of that bank. No manual moderation.

Consent: `Account.aiImportConsentAt DateTime?`. Granting it mutates account
state on behalf of every member, so the grant endpoint is **non-viewer only**
(`ViewerBlockGuard`); a viewer cannot import anyway. Independently of consent,
**tier-2 (fully E2EE) accounts are refused** — the server cannot read their
data at all.

Two migrations: `bank_statement_signatures` (new table) and
`accounts.ai_import_consent_at` (nullable column).

## Hallucination containment

The inference path cannot invent an amount, because the model never emits one.
It returns column *names*; amounts and dates are computed by the deterministic
`UniversalParser`.

The guard that makes this airtight: **validate the model's response against the
actual `headers` array**. If any returned name is not present in `headers`,
reject the whole response — no repair attempts, no fuzzy matching. A rejected
response is indistinguishable from an unavailable model, and both fall back to
the manual mapper.

The extraction path (PDF) *does* emit values and therefore *can* hallucinate.
That is precisely why it is gated behind balance reconciliation, an always-on
warning banner when no balance exists, and a Pro tier — it is the riskier of
the two paths and should not be the one a free user meets first.

## Failure behaviour

| Situation | Behaviour |
|---|---|
| OpenAI unavailable / timeout / invalid JSON | `needs_picker`, exactly as today. The manual mapper is a full fallback. Never a 5xx |
| Response references a column not in `headers` | Rejected wholesale → same as unavailable |
| Mapping valid but the parse yields 0 rows | Do **not** write the global signature; return `needs_mapping` with the AI mapping pre-filled, so the user corrects one column instead of mapping six |
| PDF: `Σ rows ≠ closing − opening` | Preview shown with the "may have missed rows" banner |
| PDF: no balance in the text | Banner shown regardless — nothing to reconcile against |
| Tier-2 E2EE account | Refused before any LLM call |

Budgets: **20 s** for inference; **30 s** per page and **20 pages** for
extraction; the inference payload is the header row plus **10** sample rows
with each cell truncated to **80** characters. The existing 5 MB upload limit
is unchanged.

## Abuse protection

Free and outside the monthly AI limit means the usual limiter does not apply,
so the inference path gets its own:

- `@Throttle` on the preview endpoint (precedent: `/users/search`, currently
  the only consumer of the configured `ThrottlerModule`).
- A per-account daily ceiling on inference calls:
  `AI_IMPORT_MAX_INFERENCES_PER_DAY`, default **20**. Exceeding it degrades to
  `needs_picker`, not to an error. The counter lives in **Redis**
  (`CacheService`, which is `@Global()`), deliberately **not** in `usage_logs`
  — that table's only writer is `trackAiUsage`, i.e. the monthly billing
  counter this path is specified to stay out of.
- The global dictionary absorbs most repeat traffic by construction — the
  second user of any given bank never reaches the model.

## Mobile and i18n

**Revised after the API was built — this is the as-built contract, not the
original sketch.** Three things changed during plan 1's review and the mobile
plan must follow the new shape, not this section's first draft:

- **There is no `useAi` request field.** It was removed because
  `POST /import/bank/preview` carries no `ViewerBlockGuard`, so an implicit
  consent write there let a *viewer* enable LLM processing for every member of
  the account. Consent is now written only by `POST /import/bank/ai-consent`
  (`ViewerBlockGuard` + throttled). The client flow is therefore three calls:
  `preview` → `needs_ai_consent` → `POST /ai-consent` → **re-request** `preview`.
  `importStore` already holds `fileAsset`, so the re-request costs the user
  nothing but a spinner.
- **`currencyAssumed?: string`** is set when the statement had no currency
  column and every row was stamped with the user's own display currency. This
  is the one place a silent, plausible-looking wrong import can still occur, so
  it must be visible on the preview screen and correctable — not a footnote.
- **`extractionWarning?: 'balance_mismatch' | 'no_balance' | 'pages_truncated'`**
  and **`droppedPages?: number`** ride on every PDF extraction response. They are
  present far more often than not — `no_balance` fires whenever the statement
  prints no opening/closing balance, which is common — so the copy must read as
  "check before importing", never as an error.

Unchanged from the original design:

- The `needs_ai_consent` screen states what leaves the device (headers + up to
  10 sample rows; on the PDF path, the first 20 extracted lines), where it goes,
  and offers "Parse automatically" / "I'll map it myself". Once per account.
- Preview screen, when `aiInferred: true`: an editable chip row —
  "Date → *Data operacji*, Amount → *Kwota*" — so one wrong column is fixed by
  a tap instead of re-mapping the file. Tapping opens the existing mapper
  pre-filled from `aiMapping`. `aiBankLabel` is display-only and must never
  drive logic.
- PDF without Pro → 403 with `code: 'TIER_REQUIRED'` → the existing
  `useUpgradeStore.show(..., 'pro')` path, same as `shoppingListStore`.
- New `bankImport.ai*` keys in all 9 locales.

**Deployment order is a hard constraint, not a preference.** `needs_ai_consent`
is a status the shipped app does not handle: `preview.tsx` tests only
`needs_picker` and `needs_mapping`, then falls through to the `parsed` branch
and renders `preview.rows ?? []` — an empty list with an Import button, where
the user used to get the bank picker. Until this plan ships, the API must not
be deployed, or must be deployed behind a default-off kill-switch.

Drive-by: `BankImportCommitBodyDto.bankId`'s `@IsIn([...])` list is missing
`'revolut'`. It is unreachable today (the client only sends `bankId` alongside
a `pendingMapping`, which only the universal path produces), but the list has
to grow for `'ai'` anyway — add `'revolut'` in the same edit.

## Testing

Pure units, no network — this is where the logic lives:

- `xlsxToCsv` (sheet selection, header row, quoting).
- Prompt builders.
- **Response validator** — a column name absent from `headers` rejects the
  whole response.
- Balance reconciliation.
- Self-quarantine rule (`correctedCount > confirmedCount`).

Service tests with a mocked OpenAI client:

- Parser resolution order, including that a global hit issues **no** LLM call.
- Inference failure → `needs_picker`.
- Zero parsed rows → no signature written.
- **`externalRef` after AI inference is byte-identical to `externalRef` after
  manual mapping of the same file** — the test that holds the dedup invariant.

Controller tests:

- `needs_ai_consent` returned without consent.
- PDF without Pro → 403 carrying `requiredTier`.

## Deploy notes

- Two migrations, both additive; no backfill.
- Reuses `OPENAI_API_KEY`. Two new optional env vars, both with working
  defaults so an unchanged `.env` behaves correctly:
  `AI_IMPORT_MAX_PDF_PAGES` (20) and `AI_IMPORT_MAX_INFERENCES_PER_DAY` (20).
  Add both to `.env.example`.
- Feature is inert for every statement an existing parser detects, so rollout
  risk is confined to files that today produce `needs_picker`.

## Follow-ups

- Admin view over the signature dictionary: what was inferred, where users
  corrected it, which banks earn a real parser.
- Promote high-`confirmedCount` signatures into hand-written parsers.
- Image/screenshot statements via the vision path.
- Seed the dictionary from the existing per-account `csv_import_mappings`
  rows, which already encode correct mappings for banks people mapped by hand.
