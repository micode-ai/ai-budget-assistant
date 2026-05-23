# Polish Bank Import — Design Spec

**Date**: 2026-05-23
**Status**: Approved (brainstorming)
**Source plan**: `docs/plans/8a1fc962-06de-4b1e-86fe-0668b4c635a2.md` (feasibility study)
**Branch**: `development`

## Goal

Enable mobile users to import transactions from CSV exports of Poland's 5 most popular retail banks (mBank, PKO BP, ING Bank Śląski, Bank Millennium, Pekao SA), with a universal column-mapping fallback for the long tail of other banks. Reuse the existing Wise-import preview/commit pattern, dedup mechanism (`externalRef` + `@@unique([accountId, externalRef])`), and 5-state mobile UI machine. Wise stays untouched at the code level but is presented in a unified entry point.

## Non-goals (Phase 1)

- MT940 / CAMT.053 / XML parsers (Phase 2)
- Open Banking / PSD2 / GoCardless / PolishAPI (Phase 3 — requires EU TPP license)
- Batch import of multiple CSV files in one operation
- AI/LLM-assisted column mapping
- Local SQLite cache for saved column mappings (import requires online)
- Bulk delete of imported transactions
- Progress bar during parsing (synchronous response; ≤5 MB files parse in seconds)
- Category hints for the universal parser (only bank-specific parsers carry merchant→category maps)

## Architecture — Approach A (Strategy registry, Wise untouched)

A new NestJS module `apps/api/src/modules/import-bank/` registers per-bank parsers behind a single strategy interface. The existing `import-wise` module stays as-is to avoid regression risk in working code. Mobile UI consolidates entry under a single "Import transactions" hub that links to either the existing Wise screen or the new bank-import flow.

### Module layout

```
apps/api/src/modules/import-bank/
├── import-bank.module.ts
├── import-bank.controller.ts          # 5 endpoints
├── import-bank.service.ts             # orchestrator
├── dto/index.ts
├── parsers/
│   ├── parser.interface.ts            # BankParser, ParserResult, ParserOptions
│   ├── registry.ts                    # parsers in detection order
│   ├── mbank.parser.ts
│   ├── pko.parser.ts
│   ├── ing.parser.ts
│   ├── millennium.parser.ts
│   ├── pekao.parser.ts
│   └── universal.parser.ts            # column-mapping driven
├── utils/
│   ├── encoding.ts                    # detect Win-1250 vs UTF-8 (iconv-lite)
│   ├── polish-amount.ts               # "1 500,00 PLN" → 1500
│   ├── polish-date.ts                 # DD.MM.YYYY | DD-MM-YYYY | YYYY-MM-DD → ISO
│   ├── header-fingerprint.ts          # sha256(sorted normalized headers)
│   └── fx-pairing.ts                  # universal FX detection heuristic
├── merchants/
│   └── merchants-pl.ts                # ~30-40 PL brand → category map
└── mapping/
    ├── mapping.service.ts             # CRUD for CsvImportMapping
    └── (controller endpoints folded into import-bank.controller.ts)
```

### Parser interface

```ts
interface BankParser {
  id: 'mbank' | 'pko' | 'ing' | 'millennium' | 'pekao' | 'universal';
  displayName: string;
  detect(headers: string[], sampleRows: string[][]): boolean;
  parse(text: string, opts?: { columnMapping?: ColumnMapping }): ParserResult;
}

interface ParserResult {
  rows: ImportRow[];               // normalized: date, signed amount, kind, description, currency
  detectedHeaders: string[];       // for "save mapping" flow
}
```

The **universal** parser is a special strategy: its `detect()` always returns `false` (it's never auto-selected). It is invoked explicitly via `mappingId`, via a saved `CsvImportMapping` whose `bankId === 'universal'`, or when the user picks "Other" in the mobile picker.

### Mobile entry handling for Wise (clarification)

Server code for Wise (`apps/api/src/modules/import-wise/`) is unchanged. The mobile change is limited to the Settings hub:
- The standalone "Wise CSV import" Settings row is removed.
- The new "Import transactions" hub lists Wise as one entry; tapping it routes to the existing `app/settings/wise-import.tsx` screen as-is. No refactor of that screen.

### Orchestration in `ImportBankService`

1. Detect encoding → decode to UTF-8 string
2. Papa-parse CSV (delimiter auto: prefer `;`, fallback `,`)
3. If `mappingId` provided → load mapping → run `universal.parser` directly
4. If `bankId` provided → run that parser
5. Otherwise: look up `CsvImportMapping` by `(accountId, headerFingerprint)`; apply if found
6. Otherwise: walk `registry` in order (`mbank → pko → ing → millennium → pekao`); first `detect() === true` wins
7. If nothing matched → respond `{ status: 'needs_picker', headers, sampleRows, headerFingerprint }`
8. Post-process: FX-pairing → dedup-check against existing `externalRef`s → preview response

## Types & Dedup Contract

### Reused types

The existing `WiseImportRow` / `WiseImportPreviewResponse` already model expense/income/fx rows with `externalRef`, `alreadyImported`, `suggestedCategoryName`. In `packages/shared-types`:
- Rename `WiseImportRow` → `ImportRow` (neutral)
- Rename `WiseImportPreviewResponse` → `ImportPreviewResponse`
- Add legacy aliases: `export type WiseImportRow = ImportRow;` etc. — zero risk for existing Wise code
- New types: `BankParserDescriptor { id, displayName }`, `ColumnMapping`, `BankImportPreviewResponse`, `BankImportCommitResponse`

### Composite dedup key

```
externalRef = `bank:${bankId}:${isoDate}:${signedAmountCents}:${descHash8}`
descHash8   = sha256(normalize(description)).slice(0, 8)
normalize() = lowercase, trim, collapse-whitespace, strip-diacritics
```

Examples:
- `bank:mbank:2026-01-15:-15000:a1b2c3d4` — 150 PLN expense at Lidl
- `bank:pko:2026-01-15:150000:f7e8d9c0` — 1500 PLN income

**Why signed amount + description hash**: signed amount distinguishes mirror income/expense for the same value on the same day; description hash distinguishes two identical-amount purchases at the same store on the same day when their descriptions differ by terminal ID or reference. Real collision case (two truly identical small purchases) appears in preview as `alreadyImported: true` — user can manually re-enable.

### FX detection heuristic (universal post-process)

Applies to `ImportRow[]` emitted by any parser. Parser tags rows as `expense`/`income` by sign. The FX-pairing step:

1. Group rows by `date`
2. Within a date, find pairs with:
   - opposite signs (`expense` ↔ `income`), AND
   - **either** different `currencyCode` **or** description containing an FX keyword: `wymiana`, `przewalutowanie`, `konwersja`, `exchange`, `fx`, `kantor`
3. Paired rows collapse into one FX entry: `externalRef = bank:${bankId}:fx:${date}:${fromAmount}:${toAmount}:${hash}`
4. Unpaired rows remain as income/expense

**Edge case**: FX keyword present but currencies equal (PLN→PLN, can happen with wallet rebrands) — skip pairing, import as income/expense pair.

Paired FX rows become a `CurrencyExchange` record (same as Wise). Non-FX transfers between user's own accounts remain as income/expense — user reconciles manually.

## Database — New Table

### `CsvImportMapping` (Prisma model)

```prisma
model CsvImportMapping {
  id                 String   @id @default(uuid()) @db.Uuid
  accountId          String   @map("account_id") @db.Uuid
  name               String                                 // user-given, e.g. "Santander main"
  headerFingerprint  String   @map("header_fingerprint")    // sha256 of sorted normalized headers
  bankId             String?  @map("bank_id")               // 'universal' or null
  mapping            Json                                   // ColumnMapping shape
  delimiter          String   @default(";")
  encoding           String   @default("utf-8")
  amountFormat       String   @default("polish")            // 'polish' | 'standard'
  dateFormat         String   @default("auto")              // 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'auto'
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  account            Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, headerFingerprint])
  @@index([accountId])
  @@map("csv_import_mappings")
}
```

`Account` gets the reverse: `csvImportMappings CsvImportMapping[]`.

### `ColumnMapping` JSON shape

```ts
type ColumnMapping = {
  date: string;                                            // column header name
  amount: string | { debit: string; credit: string };     // single column OR debit/credit pair
  description: string;
  currency?: string;                                       // optional; default to account currency
  counterparty?: string;                                   // optional, fallback description / merchant hint
};
```

Two `amount` variants cover both patterns in Polish CSVs: single signed column (mBank, Pekao) **or** separate Obciążenia/Uznania columns (PKO, Millennium). When using debit/credit pair: non-empty `debit` → `expense` (negative sign), non-empty `credit` → `income` (positive sign), both empty → row dropped. Empty markers from the CSV (`-`, `0`, `0,00`) all count as empty.

### Migration

`npx prisma migrate dev --name add_csv_import_mappings` creates the table. No backfill — new feature. Mobile SQLite is **not** modified; mappings are a server-only entity (loading them locally would only enable offline mapper config, which is overkill since import itself needs online).

### Lifecycle

1. User maps columns in universal mapper → taps "Save mapping" with a name
2. Server persists `(accountId, fingerprint, mapping)`
3. Next CSV of same shape → fingerprint match → auto-apply, no remapping needed
4. Settings → Import → "Saved mappings" list with delete action

## API — Endpoints

All under `JwtAuthGuard + AccountContextGuard`.

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/import/bank/preview` | multipart `file` (≤5 MB) + optional `bankId`, `mappingId` | `BankImportPreviewResponse` |
| `POST` | `/import/bank/commit` | `{ rows: ImportRow[], saveMapping?: { name: string } }` | `BankImportCommitResponse` |
| `GET` | `/import/bank/mappings` | — | `CsvImportMapping[]` |
| `POST` | `/import/bank/mappings` | `{ name, headerFingerprint, mapping, delimiter?, encoding?, amountFormat?, dateFormat?, bankId? }` | `CsvImportMapping` |
| `DELETE` | `/import/bank/mappings/:id` | — | `204` |

### `BankImportPreviewResponse`

```ts
{
  status: 'parsed' | 'needs_mapping' | 'needs_picker';
  detectedBankId?: string;          // when parsed
  totalRows?: number;
  importable?: number;
  skipped?: number;
  parseErrors?: number;
  rows?: ImportRow[];
  // needs_mapping / needs_picker:
  headers?: string[];
  sampleRows?: string[][];           // first 3 data rows for UI preview
  headerFingerprint?: string;
  supportedBanks?: { id: string; displayName: string }[];
}
```

### `BankImportCommitResponse`

```ts
{
  createdExpenses: number;
  createdIncomes: number;
  createdExchanges: number;
  skippedDuplicates: number;
  parseErrors: number;
  savedMappingId?: string;           // when saveMapping was provided
}
```

### Multer config

5 MB limit, in-memory storage (parsed once). No file persistence.

## Mobile UI

### Settings entry

Replace the current "Wise CSV import" row with **"Import transactions"** in the Settings hub. Icon `cloud-download-outline`, color `theme.colors.primary`. The Wise row is removed; Wise is accessed through the hub.

### `app/settings/import/index.tsx` — hub

- **Section "Quick import"**: list of Wise, mBank, PKO, ING, Millennium, Pekao, Other (custom CSV)
  - Wise → routes to existing `app/settings/wise-import.tsx`
  - Others → file picker → preview with `bankId` set (or omitted for "auto-detect")
- **Section "Saved mappings"**: list of `CsvImportMapping[]` with name + delete action
  - Tap → file picker → preview with `mappingId` set

### `app/settings/import/preview.tsx` — unified preview

Receives `BankImportPreviewResponse` via lightweight Zustand `importStore`.

- **`status: 'parsed'`** → existing checklist FlatList (same UI as Wise preview) + Import button
- **`status: 'needs_picker'`** → list of 5 banks + Universal; tap re-runs preview with chosen `bankId`
- **`status: 'needs_mapping'`** → push to `mapper.tsx`

### `app/settings/import/mapper.tsx` — universal column mapper

- Header: "We couldn't detect your bank automatically. Map the columns:"
- 3-row sample preview from CSV
- Pickers for each required field (Date / Amount / Description, optional Currency, Counterparty). Native picker on iOS, Modal on Android
- Toggle "Split debit/credit columns" — switches Amount picker to a pair of pickers
- Settings drawer: delimiter (`; , \t`), encoding (`auto / utf-8 / windows-1250`), amount format (`polish / standard`), date format (`auto / DD.MM.YYYY / DD-MM-YYYY / YYYY-MM-DD`)
- "Continue" → re-run preview with inline mapping
- Checkbox "Save this mapping for next time" + name input
- On commit, server persists the mapping when `saveMapping` is provided

### `importStore` (new Zustand store)

```ts
{
  previewData: BankImportPreviewResponse | null;
  pickedBankId: string | null;
  pendingMapping: ColumnMapping | null;
  pendingMappingMeta: { delimiter, encoding, amountFormat, dateFormat };
  fileAsset: { uri, name, type } | null;
  setPreview, reset, requestPreview, commit
}
```

Shared between hub / preview / mapper screens so we don't pass large JSON via router params.

### i18n

All new strings in 8 locales (`en / de / es / fr / pl / ru / ua / be`) under namespace `bankImport.*`. Bank brand names not translated; subtitles, buttons, errors, picker labels translated.

## Encoding Detection

Library: **iconv-lite** (new dependency, ~100 KB, maintained).

Algorithm in `utils/encoding.ts`:
1. UTF-8 BOM (3 bytes `EF BB BF`) → decode as UTF-8
2. UTF-16 BOM (LE/BE) → convert via iconv-lite
3. Otherwise attempt strict UTF-8 decode. If `�` (replacement char) appears → fall back to `windows-1250`
4. User can override via `encoding` field in universal mapper

Test fixtures in both encodings (`__fixtures__/encoding-utf8.csv`, `__fixtures__/encoding-win1250.csv`) containing Polish chars `ąćęłńóśźż`.

## Error Handling

| State | Response |
|---|---|
| File > 5 MB | `413 Payload Too Large` (Multer limit) |
| Non-CSV extension | Not blocked; rely on parsing; log warning |
| Decode failed for all encodings | `400 { code: 'ENCODING_UNKNOWN' }` |
| 0 valid rows after parse | `200 { status: 'needs_mapping', ... }` (give user a chance to map manually) |
| Parser threw | `400 { code: 'PARSE_FAILED', message }` |
| Duplicate on commit (P2002) | `continue` (Wise pattern) — silently skip, increment `skippedDuplicates` |
| Invalid `mappingId` (not owned by accountId) | `404` |
| Invalid `bankId` | `400` |
| Invalid amount (NaN after parse) | Row dropped from `rows`, increment `parseErrors` |

Mobile UI: if `parseErrors > 0`, show an orange info banner "N rows skipped due to parse errors" with a tap-to-show details (list of indexes).

## Testing

### API — unit tests per parser

- `tests/parsers/mbank.parser.spec.ts` — fixture with 5-10 rows of real (sanitized) export; check `detect()` + `parse()` output
- Same for `pko`, `ing`, `millennium`, `pekao`, `universal`
- Fixtures in `apps/api/src/modules/import-bank/parsers/__fixtures__/`
- Utility unit tests separately:
  - `polish-amount.spec.ts` (`"1 500,00 PLN"` → `1500`, `"-50,99"` → `-50.99`, `"1,234.56"` → `1234.56`)
  - `polish-date.spec.ts` (all 3 formats normalize to ISO)
  - `encoding.spec.ts` (UTF-8 / Win-1250 / BOM detection)
  - `header-fingerprint.spec.ts` (stability across whitespace/case)
  - `fx-pairing.spec.ts` (pairs / non-pairs / FX keyword / same currency edge)

### API — integration on service

- `import-bank.service.spec.ts` — mock PrismaService; full pipeline for one bank (e.g., mBank): preview → commit → second preview returns `alreadyImported: true`
- Mapping CRUD tests

### API — e2e (Supertest)

- Happy path: upload mBank CSV → preview parsed → commit → assert `prisma.expense.count`
- needs-picker: bogus CSV → response `needs_picker`
- Mapping persistence: universal commit with `saveMapping` → next preview of same template returns `parsed` via saved mapping

### Mobile

No unit tests (consistent with current project policy — Wise import is also untested at the UI level).

## Changes by Package

```
packages/shared-types/                +ImportRow, ImportPreviewResponse, BankParserDescriptor,
                                       ColumnMapping, BankImportPreviewResponse, BankImportCommitResponse,
                                       legacy aliases for Wise types
apps/api/prisma/schema.prisma         +CsvImportMapping model + Account relation
apps/api/prisma/migrations/           +20260523_add_csv_import_mappings/
apps/api/src/modules/import-bank/     NEW module (~1500 LOC including tests)
apps/api/src/app.module.ts            +ImportBankModule registration
apps/api/package.json                 +iconv-lite (papaparse already present)
apps/mobile/app/settings/wise-import  No code change; row removed from settings hub list
apps/mobile/app/settings/import/      NEW: index.tsx, preview.tsx, mapper.tsx
apps/mobile/src/stores/importStore.ts NEW
apps/mobile/src/services/api.ts       +importBank* methods (preview, commit, mappings CRUD)
apps/mobile/src/i18n/locales/         All 8 files updated, namespace bankImport.*
```

## Open Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bank CSV format changes break parser | Fixture-driven tests catch regressions; users can always fall back to "Other" + manual mapping |
| Two distinct transactions hash-collide and get skipped | Acceptable — appears as "Already imported" in preview; user can manually re-include; documented in user-facing help |
| Universal mapper UX too complex for non-tech users | Bank auto-detection should cover 90%+ of users; mapper is the long-tail safety net |
| Multer file size limit hit by users with huge multi-year exports | 5 MB ≈ 30-50k rows; sufficient for individuals; document the limit; future enhancement: streaming parse |
| iconv-lite dependency bloat | ~100 KB acceptable; widely used in Node ecosystem |
| Wise duplication of dedup/commit logic | Accept ~80 LOC duplication in MVP; refactor to unified `import/` module is Phase 2 if needed |

## Rollout

1. API ships with all 5 parsers + universal + mapping CRUD endpoints (no feature flag — project convention is to ship by merging code)
2. Mobile ships matching version with hub UI in the same release
3. Help section added per `add-help-section` skill: new doc `user_docs/<lang>/NN-bank-import.md` × 8 langs, entry in `scripts/generate-help-content.js` SECTIONS, regenerated `content.ts`
4. ABA-{N} GitHub issue created at end of work per finishing-task convention
