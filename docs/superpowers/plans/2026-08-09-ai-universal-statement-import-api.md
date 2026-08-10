# AI Universal Statement Import — API Implementation Plan (plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import a bank statement from any bank — CSV, XLSX, or PDF — by having an LLM infer the column mapping (CSV/XLSX) or extract the rows (PDF), wired into the existing `import-bank` pipeline at the branch that today gives up and returns `needs_picker`.

**Architecture:** Self-contained inside `apps/api/src/modules/import-bank/`. A new `ai/` folder holds an OpenAI-backed service with its own client (the convention every AI service in this repo follows), pure prompt builders, a pure response validator, and a Prisma-only leaf service over a new global signature dictionary. The CSV/XLSX path hands the inferred mapping to the **existing** `UniversalParser`, so amounts and dates stay deterministic and `externalRef`s match a hand-mapped import byte for byte. Only the PDF path lets the model emit values, and it is Pro-gated and reconciled against the statement balance.

**Tech Stack:** NestJS 10, Prisma 5, `openai` ^4.24, `exceljs` ^4.4, `papaparse` ^5.5, `pdf-parse` ^2.4, Jest 29 + ts-jest.

**Spec:** `docs/superpowers/specs/2026-08-09-ai-universal-statement-import-design.md` — read it before starting.

**Plan 2 (mobile: consent screen, editable mapping chips, i18n × 9 locales) is a separate document and is NOT in scope here.** This plan ends with a fully working, fully tested API.

## Global Constraints

- **The model never emits an amount or a date on the CSV/XLSX path.** It returns column *names* only; `UniversalParser` computes values. Do not "improve" this by asking for parsed rows.
- **Validate every model response against the actual `headers` array.** If any returned column name is not present in `headers`, reject the whole response. No fuzzy matching, no repair, no partial acceptance.
- **On the CSV/XLSX path `parser.id` stays `'universal'`.** `buildExternalRef` embeds the parser id in the dedup key; changing it silently breaks `externalRef` dedup against hand-mapped imports.
- **Never a 5xx from the AI path.** Every failure degrades to `needs_picker` or `needs_mapping`.
- **Never a silent partial import.** Any doubt about completeness surfaces as a flag on the response.
- Tier-2 (fully E2EE) accounts are refused before any LLM call.
- All new code is account-scoped: every Prisma query filters by `accountId`, except `BankStatementSignature`, which is deliberately global and stores **no** account/user/transaction data.
- Timeouts and caps: inference 20 s; extraction 30 s per page; `AI_IMPORT_MAX_PDF_PAGES` default 20; `AI_IMPORT_MAX_INFERENCES_PER_DAY` default 20; inference payload = header row + 10 sample rows, each cell truncated to 80 chars.
- Tests run from `apps/api` with `npx jest <pattern>` (jest `rootDir` is `src`, `testRegex` is `.*\.spec\.ts$`).
- Commit messages in English.

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/dto/import.ts` (modify) | New preview status + AI response fields + `'ai'` parser id |
| `apps/api/src/modules/import-bank/utils/delimiter.ts` (create) | Sniff the CSV delimiter — pure |
| `apps/api/src/modules/import-bank/utils/xlsx-to-csv.ts` (create) | XLSX detection + workbook → CSV text — pure |
| `apps/api/src/modules/import-bank/ai/statement-ai.prompt.ts` (create) | Prompt builders — pure |
| `apps/api/src/modules/import-bank/ai/statement-ai.validator.ts` (create) | Validate model output against real headers — pure |
| `apps/api/src/modules/import-bank/ai/balance-check.ts` (create) | Reconcile Σ rows against statement balances — pure |
| `apps/api/src/modules/import-bank/ai/signature.service.ts` (create) | Prisma-only leaf over the global dictionary |
| `apps/api/src/modules/import-bank/ai/statement-ai.service.ts` (create) | OpenAI calls: `inferMapping`, `extractRows` |
| `apps/api/src/modules/import-bank/parsers/ai-statement.parser.ts` (create) | `BankParser` with id `'ai'`, format `'pdf'` |
| `apps/api/src/modules/import-bank/import-bank.service.ts` (modify) | Wire both AI paths into the two `!parser` branches |
| `apps/api/src/modules/import-bank/import-bank.controller.ts` (modify) | `useAi` flag, consent endpoint, throttle |
| `apps/api/prisma/schema.prisma` (modify) | `BankStatementSignature` + `Account.aiImportConsentAt` |

The validator lives in its own file rather than inside `statement-ai.service.ts` (a small deviation from the spec's file list) because it is the single most important correctness rule in the feature and must be unit-testable without an OpenAI mock.

---

### Task 1: Shared types for the AI import path

**Files:**
- Modify: `packages/shared-types/src/dto/import.ts:47-76`
- Modify: `apps/api/src/modules/import-bank/dto/index.ts:87`

**Interfaces:**
- Produces: `BankImportPreviewStatus` gains `'needs_ai_consent'`; `BankParserDescriptor['id']` gains `'ai'`; `BankImportPreviewResponse` gains `aiInferred?: boolean`, `aiMapping?: ColumnMapping`, `aiBankLabel?: string`, `extractionWarning?: ExtractionWarning`, `droppedPages?: number`; new exported type `ExtractionWarning = 'balance_mismatch' | 'no_balance' | 'pages_truncated'`.

There is no test for this task — it is a type-only change, and the compiler is the test. It comes first because every later task references these names.

- [ ] **Step 1: Widen the parser id union and the preview status**

In `packages/shared-types/src/dto/import.ts`, replace lines 47-50 and 62:

```ts
export interface BankParserDescriptor {
  id: 'mbank' | 'pko' | 'revolut' | 'ing' | 'millennium' | 'pekao' | 'erste' | 'alior' | 'universal' | 'ai';
  displayName: string;
}
```

```ts
export type BankImportPreviewStatus = 'parsed' | 'needs_mapping' | 'needs_picker' | 'needs_ai_consent';
```

- [ ] **Step 2: Add the AI response fields**

Replace the `BankImportPreviewResponse` interface (lines 64-76) with:

```ts
export type ExtractionWarning = 'balance_mismatch' | 'no_balance' | 'pages_truncated';

export interface BankImportPreviewResponse {
  status: BankImportPreviewStatus;
  detectedBankId?: BankParserDescriptor['id'];
  totalRows?: number;
  importable?: number;
  skipped?: number;
  parseErrors?: number;
  rows?: ImportRow[];
  headers?: string[];
  sampleRows?: string[][];
  headerFingerprint?: string;
  supportedBanks?: BankParserDescriptor[];
  /** True when the mapping came from LLM inference rather than a parser or a saved mapping. */
  aiInferred?: boolean;
  /** The inferred mapping, echoed back so the client can display and edit it. */
  aiMapping?: ColumnMapping;
  /** The model's guess at the bank name — display only, never used for logic. */
  aiBankLabel?: string;
  /** Set on the PDF extraction path when completeness could not be confirmed. */
  extractionWarning?: ExtractionWarning;
  /** Pages beyond AI_IMPORT_MAX_PDF_PAGES that were not read. */
  droppedPages?: number;
}
```

- [ ] **Step 3: Fix the commit DTO's bankId allow-list**

`apps/api/src/modules/import-bank/dto/index.ts:87` currently omits `'revolut'` (latent bug — unreachable today because the client only sends `bankId` alongside a `pendingMapping`) and needs `'ai'`. Replace that `@IsIn` line with:

```ts
  @IsOptional()
  @IsIn(['mbank', 'pko', 'revolut', 'ing', 'millennium', 'pekao', 'erste', 'alior', 'universal', 'ai'])
  bankId?: string;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `apps/mobile` errors on the widened union, that is expected only where a `switch` is exhaustive over `BankImportPreviewStatus` — fix by adding a `needs_ai_consent` branch that falls through to the existing `needs_picker` UI for now; plan 2 replaces it.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/dto/import.ts apps/api/src/modules/import-bank/dto/index.ts
git commit -m "feat(import): shared types for AI statement import"
```

---

### Task 2: Delimiter sniffing

**Files:**
- Create: `apps/api/src/modules/import-bank/utils/delimiter.ts`
- Create: `apps/api/src/modules/import-bank/utils/delimiter.spec.ts`
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts:583-601` (`peekHeaders`, `peekSampleRows`) and their two call sites at `:98-99`

**Interfaces:**
- Produces: `sniffDelimiter(text: string): string` — returns one of `;`, `,`, `\t`, `|`, defaulting to `;`.
- Produces: `peekHeaders(text: string, delimiter?: string): string[]` and `peekSampleRows(text: string, count: number, delimiter?: string): string[][]` — both now take an explicit delimiter.

**Why this task exists.** `peekHeaders` and `peekSampleRows` hardcode `delimiter: ';'`. For a comma-delimited export they return a single merged cell — e.g. the Revolut fixture's headers come back as one string `"Type,Product,Started Date,…"`. The AI would be shown that merged cell and could not name a column, so the whole feature would fail on most non-Polish banks. Fixing it also repairs `RevolutParser.detect()`, which needs `'started date'` as its own header cell and therefore never fires on auto-detect today.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/utils/delimiter.spec.ts`:

```ts
import { sniffDelimiter } from './delimiter';

describe('sniffDelimiter', () => {
  it('detects semicolon', () => {
    expect(sniffDelimiter('#Data operacji;#Kwota;#Opis\n2026-01-01;-12,00;Sklep')).toBe(';');
  });

  it('detects comma', () => {
    expect(
      sniffDelimiter('Type,Product,Started Date,Amount\nCARD_PAYMENT,Current,2026-01-15,-50.00'),
    ).toBe(',');
  });

  it('detects tab', () => {
    expect(sniffDelimiter('Date\tAmount\tDescription\n2026-01-01\t-12.00\tShop')).toBe('\t');
  });

  it('prefers the delimiter that yields a consistent column count', () => {
    // Commas appear inside quoted description cells; semicolon is the real delimiter.
    const text = 'Data;Kwota;Opis\n2026-01-01;-12,00;"Sklep, Warszawa"\n2026-01-02;-8,00;"Kawa, duza"';
    expect(sniffDelimiter(text)).toBe(';');
  });

  it('falls back to semicolon on a single-column file', () => {
    expect(sniffDelimiter('OnlyOneColumn\nvalue')).toBe(';');
  });

  it('falls back to semicolon on empty input', () => {
    expect(sniffDelimiter('')).toBe(';');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest delimiter.spec`
Expected: FAIL — `Cannot find module './delimiter'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/import-bank/utils/delimiter.ts`:

```ts
import * as Papa from 'papaparse';

const CANDIDATES = [';', ',', '\t', '|'];

/**
 * Pick the delimiter that parses the first few lines into the most columns
 * with a consistent column count. Papa's own auto-detection is not used
 * directly because it is not exposed as a standalone call and we need the
 * chosen value to pass on to UniversalParser.
 */
export function sniffDelimiter(text: string): string {
  if (!text.trim()) return ';';

  let best = ';';
  let bestScore = 0;

  for (const delimiter of CANDIDATES) {
    const result = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      delimiter,
      preview: 5,
    });
    const rows = result.data.filter((r) => Array.isArray(r));
    if (rows.length === 0) continue;

    const counts = rows.map((r) => r.length);
    const first = counts[0];
    if (first < 2) continue;
    // Every previewed row must agree on the column count, or this delimiter
    // is splitting inside quoted content.
    if (!counts.every((c) => c === first)) continue;

    if (first > bestScore) {
      bestScore = first;
      best = delimiter;
    }
  }

  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest delimiter.spec`
Expected: PASS (6 tests)

- [ ] **Step 5: Thread the delimiter through the peek helpers**

In `apps/api/src/modules/import-bank/import-bank.service.ts`, replace the two module-level helpers:

```ts
function peekHeaders(text: string, delimiter = ';'): string[] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter,
    preview: 1,
  });
  const first = result.data[0];
  return first ? first.map((h) => String(h).trim()) : [];
}

function peekSampleRows(text: string, count: number, delimiter = ';'): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter,
    preview: count + 1,
  });
  return result.data.slice(1).map((r) => r.map(String));
}
```

And at the call site (currently lines 98-99 of `parsePreview`):

```ts
    const delimiter = sniffDelimiter(text);
    const headers = peekHeaders(text, delimiter);
    const sampleRows = peekSampleRows(text, 3, delimiter);
```

Add the import at the top of the file:

```ts
import { sniffDelimiter } from './utils/delimiter';
```

- [ ] **Step 6: Add the Revolut auto-detection regression test**

Append to `apps/api/src/modules/import-bank/parsers/registry.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { sniffDelimiter } from '../utils/delimiter';
import * as Papa from 'papaparse';

describe('detectParser with sniffed delimiter', () => {
  const readFixture = (name: string) =>
    fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf-8');

  const headersOf = (text: string) => {
    const delimiter = sniffDelimiter(text);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter, preview: 1 });
    return (parsed.data[0] ?? []).map((h) => String(h).trim());
  };

  it('now detects Revolut, which a hardcoded semicolon delimiter never could', () => {
    expect(detectParser(headersOf(readFixture('revolut.csv')), [])?.id).toBe('revolut');
  });

  it.each([
    ['mbank.csv', 'mbank'],
    ['pko.csv', 'pko'],
    ['ing.csv', 'ing'],
    ['millennium.csv', 'millennium'],
    ['pekao.csv', 'pekao'],
  ])('still detects %s', (fixture, expectedId) => {
    expect(detectParser(headersOf(readFixture(fixture)), [])?.id).toBe(expectedId);
  });
});
```

- [ ] **Step 7: Run the import-bank suite**

Run: `cd apps/api && npx jest import-bank`
Expected: PASS. The Revolut case is newly green; the five others must stay green — if any regresses, `sniffDelimiter` picked the wrong delimiter for that fixture and needs a fix here, not a workaround at the call site.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/import-bank/utils/delimiter.ts apps/api/src/modules/import-bank/utils/delimiter.spec.ts apps/api/src/modules/import-bank/import-bank.service.ts apps/api/src/modules/import-bank/parsers/registry.spec.ts
git commit -m "fix(import): sniff CSV delimiter instead of assuming semicolon

Repairs Revolut auto-detection and unblocks AI mapping inference, which
needs real header cells rather than one merged string."
```

---

### Task 3: XLSX → CSV normalization

**Files:**
- Create: `apps/api/src/modules/import-bank/utils/xlsx-to-csv.ts`
- Create: `apps/api/src/modules/import-bank/utils/xlsx-to-csv.spec.ts`
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts:87-96` (`parsePreview` head)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isXlsxBuffer(buf: Buffer): boolean` and `xlsxToCsv(buf: Buffer): Promise<string>` — returns CSV text with `;` as the delimiter and CRLF-free line endings.

Converting before `headerFingerprint` means fingerprinting, `UniversalParser`, the mapping cache and the manual mapper never learn the file was a spreadsheet.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/utils/xlsx-to-csv.spec.ts`:

```ts
import * as ExcelJS from 'exceljs';
import { isXlsxBuffer, xlsxToCsv } from './xlsx-to-csv';

async function buildWorkbook(rows: (string | number)[][], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('isXlsxBuffer', () => {
  it('accepts a real workbook', async () => {
    expect(isXlsxBuffer(await buildWorkbook([['a']]))).toBe(true);
  });

  it('rejects CSV text', () => {
    expect(isXlsxBuffer(Buffer.from('Data;Kwota\n2026-01-01;-12,00'))).toBe(false);
  });

  it('rejects a PDF', () => {
    expect(isXlsxBuffer(Buffer.from('%PDF-1.7\n...'))).toBe(false);
  });

  it('rejects a truncated buffer', () => {
    expect(isXlsxBuffer(Buffer.from([0x50]))).toBe(false);
  });
});

describe('xlsxToCsv', () => {
  it('converts the first sheet to semicolon-delimited CSV', async () => {
    const buf = await buildWorkbook([
      ['Data operacji', 'Kwota', 'Opis'],
      ['2026-01-01', -12.5, 'Sklep'],
      ['2026-01-02', 40, 'Zwrot'],
    ]);
    const csv = await xlsxToCsv(buf);
    expect(csv.split('\n')[0]).toBe('Data operacji;Kwota;Opis');
    expect(csv.split('\n')[1]).toBe('2026-01-01;-12.5;Sklep');
  });

  it('quotes cells containing the delimiter', async () => {
    const buf = await buildWorkbook([['Opis'], ['Sklep; Warszawa']]);
    const csv = await xlsxToCsv(buf);
    expect(csv.split('\n')[1]).toBe('"Sklep; Warszawa"');
  });

  it('skips leading blank rows so the header row lands first', async () => {
    const buf = await buildWorkbook([[], [], ['Data', 'Kwota'], ['2026-01-01', -5]]);
    const csv = await xlsxToCsv(buf);
    expect(csv.split('\n')[0]).toBe('Data;Kwota');
  });

  it('throws a typed error on a workbook with no sheets', async () => {
    const wb = new ExcelJS.Workbook();
    const empty = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(xlsxToCsv(empty)).rejects.toThrow('XLSX_EMPTY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest xlsx-to-csv.spec`
Expected: FAIL — `Cannot find module './xlsx-to-csv'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/import-bank/utils/xlsx-to-csv.ts`:

```ts
import * as ExcelJS from 'exceljs';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

/**
 * An XLSX file is a zip archive. Checking the zip magic alone would also
 * accept .docx/.odt/.jar, so we additionally require the "xl/" path that
 * only a spreadsheet part contains. Reading the raw bytes for that marker is
 * enough — a full unzip happens later in xlsxToCsv.
 */
export function isXlsxBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 4) return false;
  for (let i = 0; i < ZIP_MAGIC.length; i++) {
    if (buf[i] !== ZIP_MAGIC[i]) return false;
  }
  return buf.includes('xl/', 0, 'latin1');
}

const escapeCell = (value: string): string =>
  /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const cellToString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // ExcelJS rich text / formula / hyperlink cells.
    const rich = value as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (Array.isArray(rich.richText)) return rich.richText.map((p) => p.text).join('');
    if (rich.result !== undefined) return cellToString(rich.result);
    if (rich.text !== undefined) return String(rich.text);
    return '';
  }
  return String(value);
};

/**
 * Convert the first worksheet to semicolon-delimited CSV text. Leading blank
 * rows are dropped so the header row is line 0, which is what peekHeaders and
 * every parser assume.
 */
export async function xlsxToCsv(buf: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('XLSX_EMPTY');

  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1); // ExcelJS is 1-indexed
    const cells = values.map((v) => escapeCell(cellToString(v)));
    if (cells.every((c) => c === '')) return;
    lines.push(cells.join(';'));
  });

  if (lines.length === 0) throw new Error('XLSX_EMPTY');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest xlsx-to-csv.spec`
Expected: PASS (9 tests)

- [ ] **Step 5: Wire it into `parsePreview`**

In `import-bank.service.ts`, add the import:

```ts
import { isXlsxBuffer, xlsxToCsv } from './utils/xlsx-to-csv';
```

And replace the decode block at the head of `parsePreview` (currently lines 91-96):

```ts
    let text: string;
    if (isXlsxBuffer(fileBuffer)) {
      try {
        text = await xlsxToCsv(fileBuffer);
      } catch {
        throw new BadRequestException({ code: 'PARSE_FAILED', message: 'Unreadable spreadsheet' });
      }
    } else {
      try {
        text = decodeCsvBuffer(fileBuffer, opts.encoding ?? 'auto');
      } catch {
        throw new BadRequestException({ code: 'ENCODING_UNKNOWN' });
      }
    }
```

- [ ] **Step 6: Run the import-bank suite**

Run: `cd apps/api && npx jest import-bank`
Expected: PASS — no existing test feeds an XLSX buffer, so behaviour for CSV and PDF is unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/import-bank/utils/xlsx-to-csv.ts apps/api/src/modules/import-bank/utils/xlsx-to-csv.spec.ts apps/api/src/modules/import-bank/import-bank.service.ts
git commit -m "feat(import): accept XLSX statements by normalising them to CSV"
```

---

### Task 4: Global signature dictionary

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (new model + one `Account` column)
- Create: `apps/api/prisma/migrations/<timestamp>_add_bank_statement_signatures/migration.sql`
- Create: `apps/api/src/modules/import-bank/ai/signature.service.ts`
- Create: `apps/api/src/modules/import-bank/ai/signature.service.spec.ts`
- Modify: `apps/api/src/modules/import-bank/import-bank.module.ts`

**Interfaces:**
- Consumes: `ColumnMapping` from `@budget/shared-types`.
- Produces: `SignatureService` with
  - `find(headerFingerprint: string): Promise<StoredSignature | null>` — returns `null` for a quarantined row
  - `record(input: { headerFingerprint: string; mapping: ColumnMapping; delimiter?: string; amountFormat?: string; dateFormat?: string; bankLabel?: string }): Promise<void>`
  - `confirm(headerFingerprint: string): Promise<void>`
  - `markCorrected(headerFingerprint: string): Promise<void>`
- Produces: exported type `StoredSignature = { mapping: ColumnMapping; delimiter?: string; amountFormat?: 'polish' | 'standard'; dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD'; bankLabel?: string }`
- Produces: exported pure predicate `isQuarantined(row: { confirmedCount: number; correctedCount: number }): boolean`

- [ ] **Step 1: Add the schema changes**

In `apps/api/prisma/schema.prisma`, add the model:

```prisma
model BankStatementSignature {
  id                String   @id @default(uuid())
  headerFingerprint String   @unique @map("header_fingerprint")
  mapping           Json
  delimiter         String?
  amountFormat      String?  @map("amount_format")
  dateFormat        String?  @map("date_format")
  bankLabel         String?  @map("bank_label")
  confirmedCount    Int      @default(0) @map("confirmed_count")
  correctedCount    Int      @default(0) @map("corrected_count")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@map("bank_statement_signatures")
}
```

And in `model Account`, directly after `monthAnchorDay` (line 294):

```prisma
  aiImportConsentAt    DateTime?    @map("ai_import_consent_at")
```

- [ ] **Step 2: Author the migration without a local database**

This repo runs migrations against prod via the deploy `migrator`. There is **no
local database and no `.env`** — no `DATABASE_URL`, no `SHADOW_DATABASE_URL`.
So `migrate dev` is out, and so is `migrate diff --from-migrations`, which
needs a shadow database to replay the existing migrations into.

The variant that is genuinely DB-free is a **schema-to-schema** diff: compare
the committed schema against your edited one. Run it AFTER Step 1's edits:

```bash
cd apps/api
git show HEAD:apps/api/prisma/schema.prisma > /tmp/schema-before.prisma
mkdir -p prisma/migrations/20260809120000_add_bank_statement_signatures
npx prisma migrate diff \
  --from-schema-datamodel /tmp/schema-before.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260809120000_add_bank_statement_signatures/migration.sql
npx prisma generate
rm /tmp/schema-before.prisma
```

`prisma generate` needs no database — it reads the schema only.

If `migrate diff` cannot run at all in your environment, hand-write the SQL
instead: every migration in this repo is plain readable DDL (the most recent
one is a single `ALTER TABLE "accounts" ADD COLUMN "month_anchor_day" INTEGER;`),
and the required statements are listed in Step 2's verification below. Say in
your report which route you took.

Read the generated SQL before continuing. It must contain exactly one `CREATE TABLE "bank_statement_signatures"`, one unique index on `header_fingerprint`, and one `ALTER TABLE "accounts" ADD COLUMN "ai_import_consent_at"`. If it contains anything else — a drop, a rename, an unrelated column — stop and investigate; the schema had drift.

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/modules/import-bank/ai/signature.service.spec.ts`:

```ts
import { SignatureService, isQuarantined } from './signature.service';
import type { ColumnMapping } from '@budget/shared-types';

const MAPPING: ColumnMapping = { date: 'Data', amount: 'Kwota', description: 'Opis' };

describe('isQuarantined', () => {
  it('is false when corrections do not outnumber confirmations', () => {
    expect(isQuarantined({ confirmedCount: 0, correctedCount: 0 })).toBe(false);
    expect(isQuarantined({ confirmedCount: 3, correctedCount: 3 })).toBe(false);
  });

  it('is true once corrections outnumber confirmations', () => {
    expect(isQuarantined({ confirmedCount: 0, correctedCount: 1 })).toBe(true);
    expect(isQuarantined({ confirmedCount: 2, correctedCount: 5 })).toBe(true);
  });
});

describe('SignatureService', () => {
  const prisma = {
    bankStatementSignature: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new SignatureService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('returns a stored signature', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue({
      mapping: MAPPING, delimiter: ';', amountFormat: 'polish', dateFormat: 'auto',
      bankLabel: 'mBank', confirmedCount: 2, correctedCount: 0,
    });
    await expect(service.find('fp')).resolves.toEqual({
      mapping: MAPPING, delimiter: ';', amountFormat: 'polish', dateFormat: 'auto', bankLabel: 'mBank',
    });
  });

  it('returns null when nothing is stored', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue(null);
    await expect(service.find('fp')).resolves.toBeNull();
  });

  it('returns null for a quarantined signature', async () => {
    prisma.bankStatementSignature.findUnique.mockResolvedValue({
      mapping: MAPPING, confirmedCount: 1, correctedCount: 4,
    });
    await expect(service.find('fp')).resolves.toBeNull();
  });

  it('upserts without resetting the counters on an existing row', async () => {
    await service.record({ headerFingerprint: 'fp', mapping: MAPPING, delimiter: ',' });
    const arg = prisma.bankStatementSignature.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ headerFingerprint: 'fp' });
    expect(arg.create).toMatchObject({ headerFingerprint: 'fp', confirmedCount: 0, correctedCount: 0 });
    expect(arg.update).not.toHaveProperty('confirmedCount');
    expect(arg.update).not.toHaveProperty('correctedCount');
  });

  it('increments confirmations', async () => {
    await service.confirm('fp');
    expect(prisma.bankStatementSignature.update).toHaveBeenCalledWith({
      where: { headerFingerprint: 'fp' },
      data: { confirmedCount: { increment: 1 } },
    });
  });

  it('increments corrections', async () => {
    await service.markCorrected('fp');
    expect(prisma.bankStatementSignature.update).toHaveBeenCalledWith({
      where: { headerFingerprint: 'fp' },
      data: { correctedCount: { increment: 1 } },
    });
  });

  it('never throws when the row to increment is gone', async () => {
    prisma.bankStatementSignature.update.mockRejectedValue(new Error('P2025'));
    await expect(service.confirm('missing')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/api && npx jest signature.service.spec`
Expected: FAIL — `Cannot find module './signature.service'`

- [ ] **Step 5: Write minimal implementation**

Create `apps/api/src/modules/import-bank/ai/signature.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { ColumnMapping } from '@budget/shared-types';

export interface StoredSignature {
  mapping: ColumnMapping;
  delimiter?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  bankLabel?: string;
}

/**
 * A signature whose users correct it more often than they confirm it has
 * stopped being useful. Withdrawing it degrades to "ask the model again",
 * which is strictly better than serving a wrong mapping to everyone.
 */
export function isQuarantined(row: { confirmedCount: number; correctedCount: number }): boolean {
  return row.correctedCount > row.confirmedCount;
}

/**
 * The global statement-signature dictionary. Deliberately NOT account-scoped:
 * a row holds only column names, a delimiter and two format hints — no
 * accountId, no userId, no transaction data — so it is safe to share across
 * every account, which is what makes the second user of any bank free.
 */
@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async find(headerFingerprint: string): Promise<StoredSignature | null> {
    const row = await this.prisma.bankStatementSignature.findUnique({
      where: { headerFingerprint },
    });
    if (!row) return null;
    if (isQuarantined(row)) return null;

    return {
      mapping: row.mapping as unknown as ColumnMapping,
      delimiter: row.delimiter ?? undefined,
      amountFormat: (row.amountFormat as StoredSignature['amountFormat']) ?? undefined,
      dateFormat: (row.dateFormat as StoredSignature['dateFormat']) ?? undefined,
      bankLabel: row.bankLabel ?? undefined,
    };
  }

  async record(input: {
    headerFingerprint: string;
    mapping: ColumnMapping;
    delimiter?: string;
    amountFormat?: string;
    dateFormat?: string;
    bankLabel?: string;
  }): Promise<void> {
    const shared = {
      mapping: input.mapping as unknown as object,
      delimiter: input.delimiter ?? null,
      amountFormat: input.amountFormat ?? null,
      dateFormat: input.dateFormat ?? null,
      bankLabel: input.bankLabel ?? null,
    };
    try {
      await this.prisma.bankStatementSignature.upsert({
        where: { headerFingerprint: input.headerFingerprint },
        create: {
          headerFingerprint: input.headerFingerprint,
          ...shared,
          confirmedCount: 0,
          correctedCount: 0,
        },
        update: shared,
      });
    } catch (e) {
      this.logger.warn(`Failed to record signature: ${e}`);
    }
  }

  async confirm(headerFingerprint: string): Promise<void> {
    await this.bump(headerFingerprint, 'confirmedCount');
  }

  async markCorrected(headerFingerprint: string): Promise<void> {
    await this.bump(headerFingerprint, 'correctedCount');
  }

  private async bump(
    headerFingerprint: string,
    field: 'confirmedCount' | 'correctedCount',
  ): Promise<void> {
    try {
      await this.prisma.bankStatementSignature.update({
        where: { headerFingerprint },
        data: { [field]: { increment: 1 } },
      });
    } catch (e) {
      // The row may legitimately not exist (parser-detected import, or a
      // signature that was never written). Counting is best-effort.
      this.logger.warn(`Failed to bump ${field}: ${e}`);
    }
  }
}
```

- [ ] **Step 6: Register the provider**

In `apps/api/src/modules/import-bank/import-bank.module.ts`, add `SignatureService` to `providers`:

```ts
import { SignatureService } from './ai/signature.service';
// ...
  providers: [ImportBankService, MappingService, SignatureService],
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/api && npx jest signature.service.spec`
Expected: PASS (9 tests)

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/import-bank/ai/signature.service.ts apps/api/src/modules/import-bank/ai/signature.service.spec.ts apps/api/src/modules/import-bank/import-bank.module.ts
git commit -m "feat(import): global bank statement signature dictionary"
```

---

### Task 5: Prompt builders and the response validator

**Files:**
- Create: `apps/api/src/modules/import-bank/ai/statement-ai.prompt.ts`
- Create: `apps/api/src/modules/import-bank/ai/statement-ai.validator.ts`
- Create: `apps/api/src/modules/import-bank/ai/statement-ai.validator.spec.ts`
- Create: `apps/api/src/modules/import-bank/ai/statement-ai.prompt.spec.ts`

**Interfaces:**
- Produces: `buildMappingPrompt(headers: string[], sampleRows: string[][]): string`
- Produces: `buildExtractionPrompt(pageText: string): string`
- Produces: `validateMappingResponse(raw: string, headers: string[]): InferredMapping | null`
- Produces: `validateExtractedRows(raw: string): ExtractedRow[]`
- Produces: types
  - `InferredMapping = { mapping: ColumnMapping; amountFormat: 'polish' | 'standard'; dateFormat: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD'; bankLabel?: string }`
  - `ExtractedRow = { date: string; amount: number; currencyCode: string; description: string; merchant?: string }`
- Produces: `MAX_SAMPLE_ROWS = 10`, `MAX_CELL_CHARS = 80`

This is the most important task in the plan. `validateMappingResponse` is what makes an amount hallucination structurally impossible on the CSV path.

- [ ] **Step 1: Write the failing validator test**

Create `apps/api/src/modules/import-bank/ai/statement-ai.validator.spec.ts`:

```ts
import { validateMappingResponse, validateExtractedRows } from './statement-ai.validator';

const HEADERS = ['Data operacji', 'Kwota', 'Opis operacji', 'Waluta', 'Kontrahent'];

const ok = JSON.stringify({
  date: 'Data operacji',
  amount: 'Kwota',
  description: 'Opis operacji',
  currency: 'Waluta',
  counterparty: 'Kontrahent',
  amountFormat: 'polish',
  dateFormat: 'auto',
  bankLabel: 'mBank',
});

describe('validateMappingResponse', () => {
  it('accepts a response whose columns all exist', () => {
    expect(validateMappingResponse(ok, HEADERS)).toEqual({
      mapping: {
        date: 'Data operacji',
        amount: 'Kwota',
        description: 'Opis operacji',
        currency: 'Waluta',
        counterparty: 'Kontrahent',
      },
      amountFormat: 'polish',
      dateFormat: 'auto',
      bankLabel: 'mBank',
    });
  });

  it('accepts a split debit/credit amount mapping', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: { debit: 'Kwota', credit: 'Waluta' },
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)?.mapping.amount).toEqual({
      debit: 'Kwota',
      credit: 'Waluta',
    });
  });

  it('REJECTS a column name that is not in headers', () => {
    const raw = JSON.stringify({
      date: 'Transaction Date', // invented
      amount: 'Kwota',
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('REJECTS an invented column inside a split amount mapping', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: { debit: 'Kwota', credit: 'Credit Amount' },
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('REJECTS an invented optional column rather than dropping it', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: 'Kwota',
      description: 'Opis operacji',
      currency: 'Currency',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('rejects a missing required field', () => {
    const raw = JSON.stringify({ date: 'Data operacji', amount: 'Kwota', amountFormat: 'polish', dateFormat: 'auto' });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('rejects an unknown amountFormat or dateFormat', () => {
    const bad = JSON.stringify({
      date: 'Data operacji', amount: 'Kwota', description: 'Opis operacji',
      amountFormat: 'martian', dateFormat: 'auto',
    });
    expect(validateMappingResponse(bad, HEADERS)).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(validateMappingResponse('not json at all', HEADERS)).toBeNull();
  });

  it('tolerates a fenced code block around the JSON', () => {
    expect(validateMappingResponse('```json\n' + ok + '\n```', HEADERS)).not.toBeNull();
  });

  it('matches header names exactly, not case-insensitively', () => {
    const raw = JSON.stringify({
      date: 'data operacji', amount: 'Kwota', description: 'Opis operacji',
      amountFormat: 'polish', dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });
});

describe('validateExtractedRows', () => {
  it('keeps well-formed rows', () => {
    const raw = JSON.stringify({
      rows: [
        { date: '2026-01-15', amount: -50.5, currencyCode: 'PLN', description: 'Biedronka' },
        { date: '2026-01-16', amount: 1200, currencyCode: 'PLN', description: 'Salary' },
      ],
    });
    expect(validateExtractedRows(raw)).toHaveLength(2);
  });

  it('drops rows with an unparseable date', () => {
    const raw = JSON.stringify({ rows: [{ date: 'last tuesday', amount: -5, currencyCode: 'PLN', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('drops rows with a non-finite amount', () => {
    const raw = JSON.stringify({ rows: [{ date: '2026-01-15', amount: 'a lot', currencyCode: 'PLN', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('drops rows with a malformed currency code', () => {
    const raw = JSON.stringify({ rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'zloty', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('returns an empty array for malformed JSON', () => {
    expect(validateExtractedRows('{{{')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest statement-ai.validator.spec`
Expected: FAIL — `Cannot find module './statement-ai.validator'`

- [ ] **Step 3: Write the validator**

Create `apps/api/src/modules/import-bank/ai/statement-ai.validator.ts`:

```ts
import type { ColumnMapping } from '@budget/shared-types';

export interface InferredMapping {
  mapping: ColumnMapping;
  amountFormat: 'polish' | 'standard';
  dateFormat: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  bankLabel?: string;
}

export interface ExtractedRow {
  date: string;
  amount: number;
  currencyCode: string;
  description: string;
  merchant?: string;
}

const AMOUNT_FORMATS = ['polish', 'standard'];
const DATE_FORMATS = ['auto', 'DD.MM.YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

/** Strip a ```json fence if the model wrapped its answer in one. */
function parseJson(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate a mapping response against the file's ACTUAL header cells.
 *
 * This is the guard that makes an amount hallucination structurally
 * impossible on the CSV/XLSX path: the model only ever names columns, and a
 * name it invented is rejected outright. Matching is EXACT — a
 * case-insensitive or trimmed match would let "data operacji" through for a
 * header that is really "Data operacji", and UniversalParser looks rows up by
 * exact key, so every row would then parse as null.
 *
 * Rejection is wholesale, including for optional columns. Silently dropping an
 * invented `currency` would produce a plausible-looking import in the wrong
 * currency, which is worse than falling back to the manual mapper.
 */
export function validateMappingResponse(raw: string, headers: string[]): InferredMapping | null {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const known = new Set(headers);
  const isKnown = (v: unknown): v is string => typeof v === 'string' && known.has(v);

  if (!isKnown(parsed.date) || !isKnown(parsed.description)) return null;

  let amount: ColumnMapping['amount'];
  if (isKnown(parsed.amount)) {
    amount = parsed.amount;
  } else if (
    parsed.amount &&
    typeof parsed.amount === 'object' &&
    isKnown(parsed.amount.debit) &&
    isKnown(parsed.amount.credit)
  ) {
    amount = { debit: parsed.amount.debit, credit: parsed.amount.credit };
  } else {
    return null;
  }

  if (parsed.currency !== undefined && parsed.currency !== null && !isKnown(parsed.currency)) return null;
  if (parsed.counterparty !== undefined && parsed.counterparty !== null && !isKnown(parsed.counterparty)) return null;

  if (!AMOUNT_FORMATS.includes(parsed.amountFormat)) return null;
  if (!DATE_FORMATS.includes(parsed.dateFormat)) return null;

  const mapping: ColumnMapping = {
    date: parsed.date,
    amount,
    description: parsed.description,
    ...(isKnown(parsed.currency) ? { currency: parsed.currency } : {}),
    ...(isKnown(parsed.counterparty) ? { counterparty: parsed.counterparty } : {}),
  };

  return {
    mapping,
    amountFormat: parsed.amountFormat,
    dateFormat: parsed.dateFormat,
    ...(typeof parsed.bankLabel === 'string' && parsed.bankLabel.trim()
      ? { bankLabel: parsed.bankLabel.trim().slice(0, 64) }
      : {}),
  };
}

/**
 * Validate extracted PDF rows. Unlike the mapping path this one CAN receive
 * hallucinated values, so every row is checked independently and a bad row is
 * dropped rather than failing the batch — a statement page with one unreadable
 * line should still import the other 40. Completeness is separately guarded by
 * the balance reconciliation in balance-check.ts.
 */
export function validateExtractedRows(raw: string): ExtractedRow[] {
  const parsed = parseJson(raw);
  const rows = parsed?.rows;
  if (!Array.isArray(rows)) return [];

  const out: ExtractedRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.date !== 'string' || !ISO_DATE.test(r.date)) continue;
    if (Number.isNaN(Date.parse(r.date))) continue;
    if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) continue;
    if (typeof r.currencyCode !== 'string' || !ISO_CURRENCY.test(r.currencyCode)) continue;
    const description = typeof r.description === 'string' ? r.description.trim() : '';
    const merchant = typeof r.merchant === 'string' && r.merchant.trim() ? r.merchant.trim() : undefined;
    if (!description && !merchant) continue;
    out.push({ date: r.date, amount: r.amount, currencyCode: r.currencyCode, description, merchant });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest statement-ai.validator.spec`
Expected: PASS (15 tests)

- [ ] **Step 5: Write the failing prompt test**

Create `apps/api/src/modules/import-bank/ai/statement-ai.prompt.spec.ts`:

```ts
import { buildMappingPrompt, buildExtractionPrompt, MAX_CELL_CHARS, MAX_SAMPLE_ROWS } from './statement-ai.prompt';

describe('buildMappingPrompt', () => {
  const headers = ['Data operacji', 'Kwota', 'Opis operacji'];

  it('includes every header verbatim', () => {
    const prompt = buildMappingPrompt(headers, [['2026-01-01', '-12,00', 'Sklep']]);
    headers.forEach((h) => expect(prompt).toContain(h));
  });

  it('caps the number of sample rows', () => {
    const rows = Array.from({ length: 50 }, (_, i) => [`row${i}`, '-1,00', 'x']);
    const prompt = buildMappingPrompt(headers, rows);
    expect(prompt).toContain('row0');
    expect(prompt).toContain(`row${MAX_SAMPLE_ROWS - 1}`);
    expect(prompt).not.toContain(`row${MAX_SAMPLE_ROWS}`);
  });

  it('truncates long cells', () => {
    const long = 'x'.repeat(500);
    const prompt = buildMappingPrompt(headers, [[long, '-1,00', 'y']]);
    expect(prompt).not.toContain(long);
    expect(prompt).toContain('x'.repeat(MAX_CELL_CHARS));
  });

  it('instructs the model to choose only from the given headers', () => {
    const prompt = buildMappingPrompt(headers, []);
    expect(prompt.toLowerCase()).toContain('exactly');
  });
});

describe('buildExtractionPrompt', () => {
  it('includes the page text and asks for ISO dates', () => {
    const prompt = buildExtractionPrompt('01.02.2026 BIEDRONKA -50,00 PLN');
    expect(prompt).toContain('BIEDRONKA');
    expect(prompt).toContain('YYYY-MM-DD');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/api && npx jest statement-ai.prompt.spec`
Expected: FAIL — `Cannot find module './statement-ai.prompt'`

- [ ] **Step 7: Write the prompt builders**

Create `apps/api/src/modules/import-bank/ai/statement-ai.prompt.ts`:

```ts
export const MAX_SAMPLE_ROWS = 10;
export const MAX_CELL_CHARS = 80;

const truncate = (cell: string): string =>
  cell.length > MAX_CELL_CHARS ? cell.slice(0, MAX_CELL_CHARS) : cell;

/**
 * Ask the model to MAP columns, never to read values. The response is
 * validated against this exact `headers` array by validateMappingResponse, so
 * the instruction below is a hint for accuracy, not the safety mechanism.
 */
export function buildMappingPrompt(headers: string[], sampleRows: string[][]): string {
  const rows = sampleRows
    .slice(0, MAX_SAMPLE_ROWS)
    .map((r) => r.map(truncate).join(' | '))
    .join('\n');

  return `You are given the header row and a few sample rows of a bank statement export.
Identify which column holds which piece of information.

HEADERS (choose your answers from exactly these strings, copied character for character):
${headers.map((h) => `- ${h}`).join('\n')}

SAMPLE ROWS (same column order as the headers):
${rows || '(none available)'}

Reply with JSON only, no prose and no code fence:
{
  "date": "<header of the transaction date column>",
  "amount": "<header of the signed amount column>",
  "description": "<header of the description / title column>",
  "currency": "<header of the currency column, or omit if absent>",
  "counterparty": "<header of the merchant / counterparty column, or omit if absent>",
  "amountFormat": "polish" | "standard",
  "dateFormat": "auto" | "DD.MM.YYYY" | "DD-MM-YYYY" | "YYYY-MM-DD",
  "bankLabel": "<your best guess at the bank name, or omit>"
}

Rules:
- Every header you return must appear in the HEADERS list above, character for character. Do not translate, reformat, trim or invent one.
- If the file has separate debit and credit columns instead of one signed column, return "amount": { "debit": "<header>", "credit": "<header>" }.
- "polish" amountFormat means a comma decimal separator (1 234,56). "standard" means a dot (1,234.56).
- Prefer the column with the transaction (booking) date over a value or posting date when both exist.
- If you cannot identify the date, amount or description column with confidence, reply exactly: {}`;
}

/**
 * PDF path: the model DOES emit values here, which is why this path is
 * Pro-gated and its output reconciled against the statement balance.
 */
export function buildExtractionPrompt(pageText: string): string {
  return `Extract every transaction from this page of a bank statement.

PAGE TEXT:
${pageText}

Reply with JSON only, no prose and no code fence:
{ "rows": [ { "date": "YYYY-MM-DD", "amount": -50.5, "currencyCode": "PLN", "description": "...", "merchant": "..." } ] }

Rules:
- "date" must be YYYY-MM-DD. Convert any other format you see.
- "amount" is a number, negative for money leaving the account and positive for money arriving. Use a dot decimal separator regardless of how the statement prints it.
- "currencyCode" is a 3-letter ISO code. Infer it from the statement if a row does not print one.
- "merchant" is optional; omit it when the row has no clear counterparty.
- Include only real transaction rows. Skip balances, subtotals, page headers, footers and interest summaries.
- If the page contains no transactions, reply exactly: { "rows": [] }
- Never invent a transaction that is not printed on this page.`;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/api && npx jest statement-ai`
Expected: PASS (20 tests across the two spec files)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/import-bank/ai/statement-ai.prompt.ts apps/api/src/modules/import-bank/ai/statement-ai.prompt.spec.ts apps/api/src/modules/import-bank/ai/statement-ai.validator.ts apps/api/src/modules/import-bank/ai/statement-ai.validator.spec.ts
git commit -m "feat(import): statement AI prompts and header-anchored response validator"
```

---

### Task 6: Balance reconciliation

**Files:**
- Create: `apps/api/src/modules/import-bank/ai/balance-check.ts`
- Create: `apps/api/src/modules/import-bank/ai/balance-check.spec.ts`

**Interfaces:**
- Consumes: `ExtractedRow` from `./statement-ai.validator`.
- Produces: `findStatementBalances(text: string): { opening: number; closing: number } | null`
- Produces: `reconcile(rows: ExtractedRow[], balances: { opening: number; closing: number } | null): ExtractionWarning | undefined` where `ExtractionWarning` comes from `@budget/shared-types`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/ai/balance-check.spec.ts`:

```ts
import { findStatementBalances, reconcile } from './balance-check';
import type { ExtractedRow } from './statement-ai.validator';

const row = (amount: number): ExtractedRow => ({
  date: '2026-01-15', amount, currencyCode: 'PLN', description: 'x',
});

describe('findStatementBalances', () => {
  it('reads Polish opening and closing balance labels', () => {
    const text = 'Saldo poczatkowe: 1 000,00 PLN\n...\nSaldo koncowe: 850,50 PLN';
    expect(findStatementBalances(text)).toEqual({ opening: 1000, closing: 850.5 });
  });

  it('reads English labels with a dot decimal separator', () => {
    const text = 'Opening balance 1,000.00\nClosing balance 850.50';
    expect(findStatementBalances(text)).toEqual({ opening: 1000, closing: 850.5 });
  });

  it('returns null when only one of the two is present', () => {
    expect(findStatementBalances('Saldo poczatkowe: 1 000,00')).toBeNull();
  });

  it('returns null when neither is present', () => {
    expect(findStatementBalances('just some transactions')).toBeNull();
  });
});

describe('reconcile', () => {
  it('returns no_balance when there is nothing to check against', () => {
    expect(reconcile([row(-10)], null)).toBe('no_balance');
  });

  it('returns undefined when the sum matches within a cent', () => {
    expect(reconcile([row(-100), row(-49.5)], { opening: 1000, closing: 850.5 })).toBeUndefined();
  });

  it('returns balance_mismatch when rows are missing', () => {
    expect(reconcile([row(-100)], { opening: 1000, closing: 850.5 })).toBe('balance_mismatch');
  });

  it('tolerates floating point drift', () => {
    const rows = [row(-0.1), row(-0.2)];
    expect(reconcile(rows, { opening: 1, closing: 0.7 })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest balance-check.spec`
Expected: FAIL — `Cannot find module './balance-check'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/import-bank/ai/balance-check.ts`:

```ts
import type { ExtractionWarning } from '@budget/shared-types';
import type { ExtractedRow } from './statement-ai.validator';

const OPENING = /(saldo\s+pocz[aą]tkowe|opening\s+balance|anfangssaldo|saldo\s+inicial|solde\s+initial)\D{0,20}(-?[\d\s.,]+)/i;
const CLOSING = /(saldo\s+ko[nń]cowe|closing\s+balance|endsaldo|saldo\s+final|solde\s+final)\D{0,20}(-?[\d\s.,]+)/i;

/** Parse a money token that may use either a comma or a dot decimal separator. */
function parseMoney(raw: string): number {
  const cleaned = raw.replace(/\s| /g, '');
  // The LAST separator is the decimal one; anything before it groups thousands.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : NaN;
}

export function findStatementBalances(text: string): { opening: number; closing: number } | null {
  const opening = OPENING.exec(text);
  const closing = CLOSING.exec(text);
  if (!opening || !closing) return null;

  const o = parseMoney(opening[2]);
  const c = parseMoney(closing[2]);
  if (Number.isNaN(o) || Number.isNaN(c)) return null;
  return { opening: o, closing: c };
}

/**
 * Confirm the extracted rows account for the whole statement.
 *
 * A missing balance is NOT treated as success — it returns 'no_balance', which
 * the client renders as the same "check before importing" warning. The
 * extraction path can hallucinate or skip rows, so silence is never reported
 * as completeness.
 */
export function reconcile(
  rows: ExtractedRow[],
  balances: { opening: number; closing: number } | null,
): ExtractionWarning | undefined {
  if (!balances) return 'no_balance';

  const sum = rows.reduce((acc, r) => acc + r.amount, 0);
  const expected = balances.closing - balances.opening;
  // One cent of tolerance absorbs float drift and per-row rounding.
  return Math.abs(sum - expected) <= 0.01 ? undefined : 'balance_mismatch';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest balance-check.spec`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/import-bank/ai/balance-check.ts apps/api/src/modules/import-bank/ai/balance-check.spec.ts
git commit -m "feat(import): statement balance reconciliation for AI-extracted rows"
```

---

### Task 7: StatementAiService

**Files:**
- Create: `apps/api/src/modules/import-bank/ai/statement-ai.service.ts`
- Create: `apps/api/src/modules/import-bank/ai/statement-ai.service.spec.ts`
- Modify: `apps/api/src/modules/import-bank/import-bank.module.ts`

**Interfaces:**
- Consumes: `buildMappingPrompt`, `buildExtractionPrompt` from `./statement-ai.prompt`; `validateMappingResponse`, `validateExtractedRows`, `InferredMapping`, `ExtractedRow` from `./statement-ai.validator`.
- Produces: `StatementAiService` with
  - `isEnabled(): boolean`
  - `inferMapping(headers: string[], sampleRows: string[][]): Promise<InferredMapping | null>`
  - `extractRows(pageTexts: string[]): Promise<ExtractedRow[]>`
- Produces: exported constants `INFERENCE_TIMEOUT_MS = 20_000`, `EXTRACTION_TIMEOUT_MS = 30_000`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/ai/statement-ai.service.spec.ts`:

```ts
const createMock = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

import { StatementAiService } from './statement-ai.service';

const config = { get: (k: string) => (k === 'OPENAI_API_KEY' ? 'test-key' : undefined) } as any;
const HEADERS = ['Data', 'Kwota', 'Opis'];
const reply = (content: string) => ({ choices: [{ message: { content } }] });

const validMapping = JSON.stringify({
  date: 'Data', amount: 'Kwota', description: 'Opis',
  amountFormat: 'polish', dateFormat: 'auto', bankLabel: 'mBank',
});

describe('StatementAiService', () => {
  let service: StatementAiService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StatementAiService(config);
  });

  describe('inferMapping', () => {
    it('returns a validated mapping', async () => {
      createMock.mockResolvedValue(reply(validMapping));
      const result = await service.inferMapping(HEADERS, [['2026-01-01', '-12,00', 'Sklep']]);
      expect(result?.mapping).toEqual({ date: 'Data', amount: 'Kwota', description: 'Opis' });
      expect(result?.bankLabel).toBe('mBank');
    });

    it('returns null when the model invents a column', async () => {
      createMock.mockResolvedValue(reply(JSON.stringify({
        date: 'Transaction Date', amount: 'Kwota', description: 'Opis',
        amountFormat: 'polish', dateFormat: 'auto',
      })));
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('returns null when the model declines with {}', async () => {
      createMock.mockResolvedValue(reply('{}'));
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('returns null and does not throw when the API errors', async () => {
      createMock.mockRejectedValue(new Error('502 Bad Gateway'));
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('returns null when the response has no content', async () => {
      createMock.mockResolvedValue({ choices: [] });
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('makes exactly one API call', async () => {
      createMock.mockResolvedValue(reply(validMapping));
      await service.inferMapping(HEADERS, []);
      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractRows', () => {
    const page = (n: number) => JSON.stringify({
      rows: [{ date: `2026-01-0${n}`, amount: -n, currencyCode: 'PLN', description: `row${n}` }],
    });

    it('concatenates rows from every page', async () => {
      createMock.mockResolvedValueOnce(reply(page(1))).mockResolvedValueOnce(reply(page(2)));
      const rows = await service.extractRows(['page one', 'page two']);
      expect(rows.map((r) => r.description)).toEqual(['row1', 'row2']);
      expect(createMock).toHaveBeenCalledTimes(2);
    });

    it('keeps the pages that succeeded when one page fails', async () => {
      createMock.mockResolvedValueOnce(reply(page(1))).mockRejectedValueOnce(new Error('timeout'));
      const rows = await service.extractRows(['page one', 'page two']);
      expect(rows.map((r) => r.description)).toEqual(['row1']);
    });

    it('returns an empty array when every page fails', async () => {
      createMock.mockRejectedValue(new Error('down'));
      await expect(service.extractRows(['a', 'b'])).resolves.toEqual([]);
    });

    it('skips blank pages without calling the API', async () => {
      createMock.mockResolvedValue(reply(page(1)));
      await service.extractRows(['   ', 'real page']);
      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('isEnabled', () => {
    it('is false without an API key', () => {
      const noKey = new StatementAiService({ get: () => undefined } as any);
      expect(noKey.isEnabled()).toBe(false);
    });

    it('is true with an API key', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest statement-ai.service.spec`
Expected: FAIL — `Cannot find module './statement-ai.service'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/import-bank/ai/statement-ai.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { buildMappingPrompt, buildExtractionPrompt } from './statement-ai.prompt';
import {
  validateMappingResponse,
  validateExtractedRows,
  type InferredMapping,
  type ExtractedRow,
} from './statement-ai.validator';

export const INFERENCE_TIMEOUT_MS = 20_000;
export const EXTRACTION_TIMEOUT_MS = 30_000;

const MODEL = 'gpt-4o-mini';

/**
 * LLM access for statement import. Owns its own OpenAI client, following the
 * convention of every other AI service in this repo (ocr, chat, whisper,
 * categorization, embedding, …) — there is no shared provider to inject, and
 * importing AiModule here would drag in its 11 module dependencies.
 *
 * Every public method is fail-silent: import must degrade to the manual
 * mapper, never to an error page.
 */
@Injectable()
export class StatementAiService {
  private readonly logger = new Logger(StatementAiService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isEnabled(): boolean {
    return this.openai !== null;
  }

  async inferMapping(headers: string[], sampleRows: string[][]): Promise<InferredMapping | null> {
    const content = await this.complete(
      buildMappingPrompt(headers, sampleRows),
      INFERENCE_TIMEOUT_MS,
    );
    if (!content) return null;
    return validateMappingResponse(content, headers);
  }

  async extractRows(pageTexts: string[]): Promise<ExtractedRow[]> {
    const out: ExtractedRow[] = [];
    for (const pageText of pageTexts) {
      if (!pageText.trim()) continue;
      const content = await this.complete(buildExtractionPrompt(pageText), EXTRACTION_TIMEOUT_MS);
      // A failed page must not discard the pages that worked; completeness is
      // caught downstream by balance reconciliation.
      if (content) out.push(...validateExtractedRows(content));
    }
    return out;
  }

  private async complete(prompt: string, timeoutMs: number): Promise<string | null> {
    if (!this.openai) return null;
    try {
      const response = await this.openai.chat.completions.create(
        {
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          response_format: { type: 'json_object' },
        },
        { timeout: timeoutMs },
      );
      return response.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      this.logger.warn(`Statement AI call failed: ${e}`);
      return null;
    }
  }
}
```

- [ ] **Step 4: Register the provider**

In `import-bank.module.ts`:

```ts
import { StatementAiService } from './ai/statement-ai.service';
// ...
  providers: [ImportBankService, MappingService, SignatureService, StatementAiService],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest statement-ai.service.spec`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/import-bank/ai/statement-ai.service.ts apps/api/src/modules/import-bank/ai/statement-ai.service.spec.ts apps/api/src/modules/import-bank/import-bank.module.ts
git commit -m "feat(import): StatementAiService for mapping inference and PDF extraction"
```

---

### Task 8: The `ai` PDF parser

**Files:**
- Create: `apps/api/src/modules/import-bank/parsers/ai-statement.parser.ts`
- Create: `apps/api/src/modules/import-bank/parsers/ai-statement.parser.spec.ts`
- Modify: `apps/api/src/modules/import-bank/parsers/parser.interface.ts:16`
- Modify: `apps/api/src/modules/import-bank/parsers/registry.ts`

**Interfaces:**
- Consumes: `ExtractedRow` from `../ai/statement-ai.validator`.
- Produces: `AiStatementParser` implementing `BankParser` with `id = 'ai'`, `format = 'pdf'`, `detect()` always `false`, and a static-style helper `toParserResult(rows: ExtractedRow[]): ParserResult` used by the service (the `parse()` member itself throws, because rows arrive pre-extracted rather than from raw text).

Mirrors `UniversalParser`, whose `detect()` also always returns `false` because it is never auto-selected.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/parsers/ai-statement.parser.spec.ts`:

```ts
import { AiStatementParser, toParserResult } from './ai-statement.parser';

describe('AiStatementParser', () => {
  const parser = new AiStatementParser();

  it('identifies itself as an ai pdf parser', () => {
    expect(parser.id).toBe('ai');
    expect(parser.format).toBe('pdf');
  });

  it('never auto-detects', () => {
    expect(parser.detect(['anything'], [])).toBe(false);
  });

  it('throws if parse() is called directly', () => {
    expect(() => parser.parse('text')).toThrow('AiStatementParser rows are supplied by StatementAiService');
  });
});

describe('toParserResult', () => {
  it('maps a negative amount to an expense with a positive value', () => {
    const result = toParserResult([
      { date: '2026-01-15', amount: -50.5, currencyCode: 'PLN', description: 'Biedronka', merchant: 'Biedronka' },
    ]);
    expect(result.rows[0]).toEqual({
      idx: 0, kind: 'expense', date: '2026-01-15', amount: 50.5,
      currencyCode: 'PLN', description: 'Biedronka', merchant: 'Biedronka',
      suggestedCategoryName: undefined,
    });
  });

  it('maps a positive amount to an income', () => {
    const result = toParserResult([
      { date: '2026-01-20', amount: 1200, currencyCode: 'PLN', description: 'Salary' },
    ]);
    expect(result.rows[0].kind).toBe('income');
    expect(result.rows[0].amount).toBe(1200);
  });

  it('falls back to the merchant when the description is empty', () => {
    const result = toParserResult([
      { date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: '', merchant: 'Zabka' },
    ]);
    expect(result.rows[0].description).toBe('Zabka');
  });

  it('numbers rows sequentially and reports no headers', () => {
    const result = toParserResult([
      { date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: 'a' },
      { date: '2026-01-16', amount: -6, currencyCode: 'PLN', description: 'b' },
    ]);
    expect(result.rows.map((r) => r.idx)).toEqual([0, 1]);
    expect(result.detectedHeaders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest ai-statement.parser.spec`
Expected: FAIL — `Cannot find module './ai-statement.parser'`

- [ ] **Step 3: Widen the parser id union**

In `parsers/parser.interface.ts:16`:

```ts
  id: 'mbank' | 'pko' | 'revolut' | 'ing' | 'millennium' | 'pekao' | 'erste' | 'alior' | 'universal' | 'ai';
```

- [ ] **Step 4: Write minimal implementation**

Create `apps/api/src/modules/import-bank/parsers/ai-statement.parser.ts`:

```ts
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import type { ExtractedRow } from '../ai/statement-ai.validator';

/**
 * Convert LLM-extracted rows into the shape every other parser produces.
 * A negative amount is money leaving the account; ImportRow carries a positive
 * magnitude plus a `kind`, so the sign moves into `kind` here.
 */
export function toParserResult(rows: ExtractedRow[]): ParserResult {
  return {
    rows: rows.map((r, idx) => ({
      idx,
      kind: r.amount < 0 ? ('expense' as const) : ('income' as const),
      date: r.date,
      amount: Math.abs(r.amount),
      currencyCode: r.currencyCode,
      description: r.description || r.merchant || '',
      merchant: r.merchant,
      suggestedCategoryName: undefined,
    })),
    detectedHeaders: [],
  };
}

/**
 * Registry entry for AI-extracted PDF statements. Like UniversalParser it is
 * never auto-selected — detect() always returns false — but unlike it, its
 * rows do not come from the raw text at all: StatementAiService produces them
 * and the service calls toParserResult directly. The class exists so that
 * `parser.id` is `'ai'` when buildExternalRef and buildPreviewResponse run.
 */
export class AiStatementParser implements BankParser {
  id = 'ai' as const;
  displayName = 'AI (any bank)';
  format = 'pdf' as const;

  detect(_headers: string[], _sampleRows: string[][]): boolean {
    return false;
  }

  parse(_text: string, _opts?: ParserOptions): ParserResult {
    throw new Error('AiStatementParser rows are supplied by StatementAiService');
  }
}
```

- [ ] **Step 5: Register it, without breaking PDF auto-detection**

In `parsers/registry.ts`, import and append it **after** `UniversalParser`, then exclude it from PDF auto-detection the same way `detectParser` excludes `universal`:

```ts
import { AiStatementParser } from './ai-statement.parser';

export const PARSERS: BankParser[] = [
  new MBankParser(),
  new PkoParser(),
  new RevolutParser(),
  new IngParser(),
  new MillenniumParser(),
  new PekaoParser(),
  new ErsteParser(),
  new AliorParser(),
  new UniversalParser(),
  new AiStatementParser(),
];
```

```ts
/** Auto-detect a PDF bank parser from extracted statement text lines. */
export function detectPdfParser(lines: string[]): BankParser | undefined {
  return PARSERS.find(
    (p) => p.id !== 'ai' && parserFormat(p) === 'pdf' && p.detect(lines, []),
  );
}
```

- [ ] **Step 6: Guard the picker list**

`parsePreview` and `parsePdfPreview` build `supportedBanks` from `PARSERS`. `'ai'` must not appear as a pickable bank. In `import-bank.service.ts`, change the CSV `needs_picker` return to filter it out:

```ts
        supportedBanks: PARSERS.filter((p) => p.id !== 'ai').map((p) => ({
          id: p.id,
          displayName: p.displayName,
        })),
```

and the PDF one:

```ts
        supportedBanks: PARSERS.filter((p) => p.id !== 'ai' && (p.format ?? 'csv') === 'pdf').map((p) => ({
          id: p.id,
          displayName: p.displayName,
        })),
```

- [ ] **Step 7: Run the suite**

Run: `cd apps/api && npx jest import-bank`
Expected: PASS. (`registry.spec.ts` asserts no parser count, so adding an entry to `PARSERS` breaks nothing.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/import-bank/parsers/ai-statement.parser.ts apps/api/src/modules/import-bank/parsers/ai-statement.parser.spec.ts apps/api/src/modules/import-bank/parsers/parser.interface.ts apps/api/src/modules/import-bank/parsers/registry.ts apps/api/src/modules/import-bank/import-bank.service.ts
git commit -m "feat(import): ai parser id for LLM-extracted PDF statements"
```

---

### Task 9: Wire the CSV/XLSX inference path

**Files:**
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts` (`PreviewOptions`, `parsePreview`, new private helpers)
- Create: `apps/api/src/modules/import-bank/ai-preview.service.spec.ts`

**Interfaces:**
- Consumes: `SignatureService`, `StatementAiService`, `sniffDelimiter`.
- Produces: `PreviewOptions` gains `useAi?: boolean`; `ImportBankService` gains private `resolveAiConsent(accountId, useAi?): Promise<'ok' | 'needs_consent' | 'unsupported'>`, `consumeInferenceQuota(accountId): Promise<boolean>`, `tryAiMapping(...)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/ai-preview.service.spec.ts`:

```ts
import { ImportBankService } from './import-bank.service';

const CSV = 'Data;Kwota;Opis\n2026-01-15;-50,00;Biedronka\n2026-01-16;1200,00;Wyplata';

function buildService(overrides: {
  consentAt?: Date | null;
  encryptionTier?: number;
  signature?: any;
  inferred?: any;
  quotaUsedToday?: number;
} = {}) {
  const prisma: any = {
    account: {
      findUnique: jest.fn().mockResolvedValue({
        aiImportConsentAt: overrides.consentAt ?? null,
        encryptionTier: overrides.encryptionTier ?? 0,
      }),
      update: jest.fn(),
    },
    csvImportMapping: { findFirst: jest.fn().mockResolvedValue(null) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    income: { findMany: jest.fn().mockResolvedValue([]) },
    currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache: any = {
    get: jest.fn().mockResolvedValue(overrides.quotaUsedToday ?? 0),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const mapping: any = { findByFingerprint: jest.fn().mockResolvedValue(null) };
  const signatures: any = {
    find: jest.fn().mockResolvedValue(overrides.signature ?? null),
    record: jest.fn(),
    confirm: jest.fn(),
    markCorrected: jest.fn(),
  };
  const ai: any = {
    isEnabled: jest.fn().mockReturnValue(true),
    inferMapping: jest.fn().mockResolvedValue(overrides.inferred ?? null),
    extractRows: jest.fn(),
  };
  const service = new ImportBankService(
    prisma,
    { create: jest.fn() } as any,   // importBatches
    mapping,
    { sendMessage: jest.fn() } as any, // telegram
    { checkExpenseBatch: jest.fn() } as any, // anomaly
    { getRulesMap: jest.fn().mockResolvedValue(new Map()) } as any, // merchantRules
    signatures,
    ai,
    { getCurrent: jest.fn(), trackAiUsage: jest.fn() } as any, // subscriptions
    cache,
  );
  return { service, prisma, signatures, ai, cache };
}

const GOOD_INFERENCE = {
  mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
  amountFormat: 'polish' as const,
  dateFormat: 'auto' as const,
  bankLabel: 'Test Bank',
};

describe('AI inference path', () => {
  it('asks for consent when no parser matches and consent is absent', async () => {
    const { service, ai } = buildService();
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_ai_consent');
    expect(res.headers).toEqual(['Data', 'Kwota', 'Opis']);
    expect(ai.inferMapping).not.toHaveBeenCalled();
  });

  it('infers and parses once consent is on file', async () => {
    const { service, ai, signatures } = buildService({
      consentAt: new Date(),
      inferred: GOOD_INFERENCE,
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(ai.inferMapping).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('parsed');
    expect(res.aiInferred).toBe(true);
    expect(res.aiBankLabel).toBe('Test Bank');
    expect(res.totalRows).toBe(2);
    expect(signatures.record).toHaveBeenCalledTimes(1);
  });

  it('serves a stored signature WITHOUT calling the model', async () => {
    const { service, ai } = buildService({
      consentAt: new Date(),
      signature: {
        mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
        delimiter: ';', amountFormat: 'polish', dateFormat: 'auto', bankLabel: 'Cached Bank',
      },
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(ai.inferMapping).not.toHaveBeenCalled();
    expect(res.status).toBe('parsed');
    expect(res.totalRows).toBe(2);
  });

  it('falls back to needs_picker when inference fails', async () => {
    const { service, signatures } = buildService({ consentAt: new Date(), inferred: null });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_picker');
    expect(signatures.record).not.toHaveBeenCalled();
  });

  it('does not store a signature when the mapping parses zero rows', async () => {
    const { service, signatures } = buildService({
      consentAt: new Date(),
      // 'Opis' is a real header but holds no dates, so every row fails to parse.
      inferred: { ...GOOD_INFERENCE, mapping: { date: 'Opis', amount: 'Kwota', description: 'Opis' } },
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_mapping');
    expect(res.aiMapping).toBeDefined();
    expect(signatures.record).not.toHaveBeenCalled();
  });

  it('refuses a tier-2 E2EE account before calling the model', async () => {
    const { service, ai } = buildService({ consentAt: new Date(), encryptionTier: 2 });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_picker');
    expect(ai.inferMapping).not.toHaveBeenCalled();
  });

  it('degrades to needs_picker when the daily inference quota is spent', async () => {
    const { service, ai } = buildService({ consentAt: new Date(), quotaUsedToday: 20 });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_picker');
    expect(ai.inferMapping).not.toHaveBeenCalled();
  });

  it('does not spend quota when a stored signature answers the request', async () => {
    const { service, cache } = buildService({
      consentAt: new Date(),
      signature: {
        mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
        delimiter: ';', amountFormat: 'polish', dateFormat: 'auto',
      },
    });
    await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('records consent when useAi is passed', async () => {
    const { service, prisma } = buildService({ inferred: GOOD_INFERENCE });
    await service.parsePreview('acc', 'user', Buffer.from(CSV), { useAi: true });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc' },
      data: { aiImportConsentAt: expect.any(Date) },
    });
  });
});

describe('externalRef invariant', () => {
  it('produces byte-identical externalRefs for AI inference and manual mapping', async () => {
    const manualMapping = { date: 'Data', amount: 'Kwota', description: 'Opis' };

    const manual = await buildService().service.parsePreview('acc', 'user', Buffer.from(CSV), {
      inlineMapping: manualMapping,
      amountFormat: 'polish',
      dateFormat: 'auto',
    });

    const inferred = await buildService({
      consentAt: new Date(),
      inferred: GOOD_INFERENCE,
    }).service.parsePreview('acc', 'user', Buffer.from(CSV), {});

    expect(inferred.rows!.map((r) => r.externalRef)).toEqual(manual.rows!.map((r) => r.externalRef));
    expect(inferred.detectedBankId).toBe('universal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest ai-preview.service.spec`
Expected: FAIL — the constructor takes 6 arguments, not 10.

- [ ] **Step 3: Extend the constructor and options**

In `import-bank.service.ts`, add to the constructor:

```ts
    private readonly signatures: SignatureService,
    private readonly statementAi: StatementAiService,
    private readonly subscriptions: SubscriptionsService,
    private readonly cache: CacheService,
```

with imports:

```ts
import { SignatureService } from './ai/signature.service';
import { StatementAiService } from './ai/statement-ai.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CacheService } from '../../common/cache/cache.service';
```

`CacheService` is provided by a `@Global()` module, so it needs no entry in `import-bank.module.ts`'s `imports`.

and extend `PreviewOptions`:

```ts
export interface PreviewOptions {
  bankId?: BankParser['id'];
  mappingId?: string;
  encoding?: EncodingHint;
  inlineMapping?: import('@budget/shared-types').ColumnMapping;
  delimiter?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  /** Set by the client after the user accepts the AI consent screen. */
  useAi?: boolean;
}
```

Import `SubscriptionsModule` in `import-bank.module.ts`:

```ts
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
// ...
  imports: [ImportBatchesModule, AnomalyModule, MerchantRulesModule, SubscriptionsModule],
```

- [ ] **Step 4: Add the gate helpers**

Add these private methods to `ImportBankService`:

```ts
  private static readonly MAX_INFERENCES_PER_DAY = Number(
    process.env.AI_IMPORT_MAX_INFERENCES_PER_DAY ?? 20,
  );

  /**
   * Consent is per-account and one-time; `useAi` records it on first use.
   *
   * Returns three outcomes rather than a boolean so the caller can tell
   * "ask the user" from "this account can never use AI import" with a single
   * query — an E2EE account must see the bank picker, not a consent screen it
   * cannot act on.
   */
  private async resolveAiConsent(
    accountId: string,
    useAi?: boolean,
  ): Promise<'ok' | 'needs_consent' | 'unsupported'> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { aiImportConsentAt: true, encryptionTier: true },
    });
    if (!account) return 'unsupported';
    // The server cannot read a fully-encrypted account's data at all.
    if (account.encryptionTier === 2) return 'unsupported';
    if (account.aiImportConsentAt) return 'ok';
    if (!useAi) return 'needs_consent';

    await this.prisma.account.update({
      where: { id: accountId },
      data: { aiImportConsentAt: new Date() },
    });
    return 'ok';
  }

  /**
   * Mapping inference is free and outside the monthly AI limit, so it needs
   * its own ceiling.
   *
   * The counter lives in Redis, NOT in `usage_logs`: the only writer of that
   * table is SubscriptionsService.trackAiUsage, which is exactly the monthly
   * billing counter this path is specified to stay out of. CacheService is
   * @Global(), so no module import is needed.
   *
   * get-then-set is not atomic, so two simultaneous uploads can both see the
   * same count. That is the same benign read-then-act race the anomaly push
   * cap already accepts — this is an abuse ceiling, not an accounting record.
   */
  private async consumeInferenceQuota(accountId: string): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `aiimp:${accountId}:${day}`;
    const used = (await this.cache.get<number>(key)) ?? 0;
    if (used >= ImportBankService.MAX_INFERENCES_PER_DAY) return false;
    await this.cache.set(key, used + 1, 24 * 60 * 60);
    return true;
  }
```

- [ ] **Step 5: Insert the two new links into the resolution chain**

In `parsePreview`, replace the `else` branch that currently ends in `parser = detectParser(headers, sampleRows)` and the `if (!parser)` block below it:

```ts
    } else {
      const saved = await this.mapping.findByFingerprint(accountId, fingerprint);
      if (saved) {
        parser =
          getParserById((saved.bankId ?? 'universal') as BankParser['id']) ??
          getParserById('universal');
        columnMapping = saved.mapping as unknown as import('@budget/shared-types').ColumnMapping;
      } else {
        parser = detectParser(headers, sampleRows);
      }
    }

    if (opts.inlineMapping) {
      parser = getParserById('universal')!;
      columnMapping = opts.inlineMapping;
    }

    if (!parser) {
      return this.tryAiMapping(accountId, text, headers, sampleRows, fingerprint, delimiter, opts);
    }
```

- [ ] **Step 6: Implement `tryAiMapping`**

```ts
  /**
   * Last two links in the parser-resolution chain: the global signature
   * dictionary, then LLM inference. Returns a fully-built preview on success
   * and degrades to needs_ai_consent / needs_mapping / needs_picker otherwise.
   */
  private async tryAiMapping(
    accountId: string,
    text: string,
    headers: string[],
    sampleRows: string[][],
    fingerprint: string,
    delimiter: string,
    opts: PreviewOptions,
  ): Promise<BankImportPreviewResponse> {
    const universal = getParserById('universal')!;

    const picker = (): BankImportPreviewResponse => ({
      status: 'needs_picker',
      headers,
      sampleRows,
      headerFingerprint: fingerprint,
      supportedBanks: PARSERS.filter((p) => p.id !== 'ai').map((p) => ({
        id: p.id,
        displayName: p.displayName,
      })),
    });

    const runUniversal = (
      mapping: import('@budget/shared-types').ColumnMapping,
      amountFormat: 'polish' | 'standard' | undefined,
      dateFormat: PreviewOptions['dateFormat'],
      usedDelimiter: string,
    ) => {
      try {
        return universal.parse(text, {
          columnMapping: mapping,
          delimiter: usedDelimiter,
          amountFormat,
          dateFormat,
        });
      } catch {
        return null;
      }
    };

    // 1. Global signature dictionary — free, no LLM call.
    const stored = await this.signatures.find(fingerprint);
    if (stored) {
      const parsed = runUniversal(
        stored.mapping,
        stored.amountFormat,
        stored.dateFormat,
        stored.delimiter ?? delimiter,
      );
      if (parsed && parsed.rows.length > 0) {
        const response = await this.buildPreviewResponse(
          accountId, universal, parsed.rows, countParseFailures(text, parsed.rows.length), fingerprint,
        );
        return { ...response, aiInferred: true, aiMapping: stored.mapping, aiBankLabel: stored.bankLabel };
      }
      // A stored signature that no longer parses is stale for this file; fall
      // through and let the model try again.
    }

    // 2. LLM inference, behind consent, E2EE and quota gates.
    if (!this.statementAi.isEnabled()) return picker();
    const consent = await this.resolveAiConsent(accountId, opts.useAi);
    if (consent === 'unsupported') return picker();
    if (consent === 'needs_consent') {
      return {
        status: 'needs_ai_consent',
        headers,
        sampleRows,
        headerFingerprint: fingerprint,
      };
    }
    if (!(await this.consumeInferenceQuota(accountId))) return picker();

    const inferred = await this.statementAi.inferMapping(headers, sampleRows);
    if (!inferred) return picker();

    const parsed = runUniversal(inferred.mapping, inferred.amountFormat, inferred.dateFormat, delimiter);
    if (!parsed || parsed.rows.length === 0) {
      // The mapping is plausible but produced nothing — hand it to the manual
      // mapper pre-filled so the user corrects one column, not six. Do NOT
      // store a signature that has never parsed a row.
      return {
        status: 'needs_mapping',
        headers,
        sampleRows,
        headerFingerprint: fingerprint,
        aiInferred: true,
        aiMapping: inferred.mapping,
        aiBankLabel: inferred.bankLabel,
      };
    }

    await this.signatures.record({
      headerFingerprint: fingerprint,
      mapping: inferred.mapping,
      delimiter,
      amountFormat: inferred.amountFormat,
      dateFormat: inferred.dateFormat,
      bankLabel: inferred.bankLabel,
    });

    const response = await this.buildPreviewResponse(
      accountId, universal, parsed.rows, countParseFailures(text, parsed.rows.length), fingerprint,
    );
    return { ...response, aiInferred: true, aiMapping: inferred.mapping, aiBankLabel: inferred.bankLabel };
  }
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && npx jest ai-preview.service.spec`
Expected: PASS (10 tests). The `externalRef invariant` test is the one that must never be weakened — if it fails, `parser.id` drifted away from `'universal'` somewhere on the inference path.

- [ ] **Step 8: Run the whole import-bank suite**

Run: `cd apps/api && npx jest import-bank`
Expected: PASS. `import-bank.service.spec.ts` constructs `ImportBankService` directly and will need the three new constructor arguments added as mocks — do that rather than making the dependencies optional.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/import-bank/import-bank.service.ts apps/api/src/modules/import-bank/import-bank.module.ts apps/api/src/modules/import-bank/ai-preview.service.spec.ts apps/api/src/modules/import-bank/import-bank.service.spec.ts
git commit -m "feat(import): AI column-mapping inference with global signature cache"
```

---

### Task 10: Wire the PDF extraction path

**Files:**
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts` (`parsePdfPreview`)
- Create: `apps/api/src/modules/import-bank/ai-pdf.service.spec.ts`

**Interfaces:**
- Consumes: `StatementAiService.extractRows`, `toParserResult`, `findStatementBalances`, `reconcile`, `SubscriptionsService`.
- Produces: private `tryAiExtraction(accountId, userId, text, opts): Promise<BankImportPreviewResponse>`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/ai-pdf.service.spec.ts`:

```ts
import { ImportBankService } from './import-bank.service';

jest.mock('./utils/pdf-text', () => ({
  isPdfBuffer: () => true,
  extractPdfText: jest.fn().mockResolvedValue(
    'Saldo poczatkowe: 1 000,00 PLN\n15.01.2026 BIEDRONKA -50,00\nSaldo koncowe: 950,00 PLN',
  ),
}));

const ROWS = [{ date: '2026-01-15', amount: -50, currencyCode: 'PLN', description: 'Biedronka' }];

function buildService(overrides: { tier?: string; rows?: any[] } = {}) {
  const prisma: any = {
    account: {
      findUnique: jest.fn().mockResolvedValue({ aiImportConsentAt: new Date(), encryptionTier: 0 }),
      update: jest.fn(),
    },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    income: { findMany: jest.fn().mockResolvedValue([]) },
    currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache: any = { get: jest.fn().mockResolvedValue(0), set: jest.fn() };
  const ai: any = {
    isEnabled: () => true,
    inferMapping: jest.fn(),
    extractRows: jest.fn().mockResolvedValue(overrides.rows ?? ROWS),
  };
  const subscriptions: any = {
    getCurrent: jest.fn().mockResolvedValue({ tier: overrides.tier ?? 'pro' }),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ImportBankService(
    prisma,
    { create: jest.fn() } as any,
    { findByFingerprint: jest.fn().mockResolvedValue(null) } as any,
    { sendMessage: jest.fn() } as any,
    { checkExpenseBatch: jest.fn() } as any,
    { getRulesMap: jest.fn().mockResolvedValue(new Map()) } as any,
    { find: jest.fn().mockResolvedValue(null), record: jest.fn(), confirm: jest.fn(), markCorrected: jest.fn() } as any,
    ai,
    subscriptions,
    cache,
  );
  return { service, ai, subscriptions };
}

describe('AI PDF extraction path', () => {
  it('extracts rows and tracks AI usage for a Pro account', async () => {
    const { service, subscriptions } = buildService();
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(res.status).toBe('parsed');
    expect(res.detectedBankId).toBe('ai');
    expect(res.totalRows).toBe(1);
    expect(res.extractionWarning).toBeUndefined();
    expect(subscriptions.trackAiUsage).toHaveBeenCalledWith('user', 'ocr', 2.0, 'acc');
  });

  it('rejects a free account with a TIER_REQUIRED payload', async () => {
    const { service, ai } = buildService({ tier: 'free' });
    await expect(
      service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {}),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'TIER_REQUIRED', requiredTier: 'pro' },
    });
    expect(ai.extractRows).not.toHaveBeenCalled();
  });

  it('flags balance_mismatch when rows do not add up', async () => {
    const { service } = buildService({
      rows: [{ date: '2026-01-15', amount: -10, currencyCode: 'PLN', description: 'partial' }],
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(res.status).toBe('parsed');
    expect(res.extractionWarning).toBe('balance_mismatch');
  });

  it('falls back to needs_picker when extraction yields nothing', async () => {
    const { service } = buildService({ rows: [] });
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(res.status).toBe('needs_picker');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest ai-pdf.service.spec`
Expected: FAIL — `parsePdfPreview` still returns `needs_picker` and never calls `extractRows`.

- [ ] **Step 3: Implement `tryAiExtraction`**

Add to `ImportBankService`, with imports (note `ForbiddenException` joins the existing `@nestjs/common` import):

```ts
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { toParserResult } from './parsers/ai-statement.parser';
import { findStatementBalances, reconcile } from './ai/balance-check';
```

```ts
  private static readonly MAX_PDF_PAGES = Number(process.env.AI_IMPORT_MAX_PDF_PAGES ?? 20);

  /**
   * PDF path: the model emits values here, so this is Pro-gated, usage-tracked
   * and reconciled against the statement balance. The tier check lives here
   * rather than on the route because it depends on the uploaded file type,
   * which a route decorator cannot see.
   */
  private async tryAiExtraction(
    accountId: string,
    userId: string,
    text: string,
    lines: string[],
    opts: PreviewOptions,
  ): Promise<BankImportPreviewResponse> {
    const picker = (): BankImportPreviewResponse => ({
      status: 'needs_picker',
      headers: lines.slice(0, 20),
      sampleRows: [],
      supportedBanks: PARSERS.filter((p) => p.id !== 'ai' && (p.format ?? 'csv') === 'pdf').map((p) => ({
        id: p.id,
        displayName: p.displayName,
      })),
    });

    if (!this.statementAi.isEnabled()) return picker();

    const consent = await this.resolveAiConsent(accountId, opts.useAi);
    if (consent === 'unsupported') return picker();
    if (consent === 'needs_consent') {
      return { status: 'needs_ai_consent', headers: lines.slice(0, 20), sampleRows: [] };
    }

    // 403, not 400 — this is the shape SubscriptionTierGuard throws and the
    // shape the mobile client detects to open the paywall.
    const subscription = await this.subscriptions.getCurrent(userId);
    if (subscription.tier !== 'pro' && subscription.tier !== 'business') {
      throw new ForbiddenException({
        code: 'TIER_REQUIRED',
        requiredTier: 'pro',
        currentTier: subscription.tier,
        message: 'AI PDF statement import requires Pro',
      });
    }

    const allPages = text.split('\f').filter((p) => p.trim());
    const pages = allPages.slice(0, ImportBankService.MAX_PDF_PAGES);
    const droppedPages = allPages.length - pages.length;

    const rows = await this.statementAi.extractRows(pages);
    if (rows.length === 0) return picker();

    await this.subscriptions.trackAiUsage(userId, 'ocr', 2.0, accountId);

    const parsed = toParserResult(rows);
    const aiParser = getParserById('ai')!;
    const response = await this.buildPreviewResponse(accountId, aiParser, parsed.rows, 0);

    const warning = droppedPages > 0
      ? ('pages_truncated' as const)
      : reconcile(rows, findStatementBalances(text));

    return {
      ...response,
      aiInferred: true,
      ...(warning ? { extractionWarning: warning } : {}),
      ...(droppedPages > 0 ? { droppedPages } : {}),
    };
  }
```

- [ ] **Step 4: Call it from `parsePdfPreview`**

`parsePdfPreview` currently takes `(accountId, fileBuffer, opts)`. Add `userId` to its signature and to its call site in `parsePreview`, then replace its `if (!parser)` block with:

```ts
    if (!parser) {
      return this.tryAiExtraction(accountId, userId, text, lines, opts);
    }
```

In `parsePreview`, the PDF dispatch at the top becomes:

```ts
    if (isPdfBuffer(fileBuffer)) {
      return this.parsePdfPreview(accountId, userId, fileBuffer, opts);
    }
```

and `parsePreview`'s second parameter is no longer unused — rename `_userId` to `userId`.

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest ai-pdf.service.spec`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the whole import-bank suite**

Run: `cd apps/api && npx jest import-bank`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/import-bank/import-bank.service.ts apps/api/src/modules/import-bank/ai-pdf.service.spec.ts
git commit -m "feat(import): Pro-gated AI extraction for PDF statements"
```

---

### Task 11: Controller surface, throttling and env

**Files:**
- Modify: `apps/api/src/modules/import-bank/import-bank.controller.ts`
- Create: `apps/api/src/modules/import-bank/import-bank.controller.spec.ts`
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts` (`commit`: confirm the signature)
- Modify: `.env.example`

**Interfaces:**
- Consumes: everything above.
- Produces: `POST /import/bank/preview` accepts `useAi` in the body; `POST /import/bank/ai-consent` records consent; both throttled.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/import-bank/import-bank.controller.spec.ts`:

```ts
import { ImportBankController } from './import-bank.controller';

describe('ImportBankController', () => {
  const service: any = {
    parsePreview: jest.fn().mockResolvedValue({ status: 'parsed' }),
    grantAiConsent: jest.fn().mockResolvedValue({ ok: true }),
  };
  const mapping: any = {};
  const controller = new ImportBankController(service, mapping);
  const req: any = { accountId: 'acc', accountRole: 'owner', user: { id: 'user' } };
  const file: any = { buffer: Buffer.from('x') };

  beforeEach(() => jest.clearAllMocks());

  it('passes useAi:true through to the service', async () => {
    await controller.preview(req, file, { useAi: 'true' } as any);
    expect(service.parsePreview).toHaveBeenCalledWith(
      'acc', 'user', file.buffer, expect.objectContaining({ useAi: true }),
    );
  });

  it('treats an absent useAi as false', async () => {
    await controller.preview(req, file, {} as any);
    expect(service.parsePreview).toHaveBeenCalledWith(
      'acc', 'user', file.buffer, expect.objectContaining({ useAi: false }),
    );
  });

  it('records consent on the dedicated endpoint', async () => {
    await expect(controller.aiConsent(req)).resolves.toEqual({ ok: true });
    expect(service.grantAiConsent).toHaveBeenCalledWith('acc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest import-bank.controller.spec`
Expected: FAIL — `controller.aiConsent is not a function`

- [ ] **Step 3: Add the controller changes**

In `import-bank.controller.ts`, extend the `preview` body type and pass the flag through. `multipart/form-data` values arrive as strings, so compare explicitly:

```ts
    @Body() body: {
      mapping?: string;
      delimiter?: string;
      amountFormat?: 'polish' | 'standard';
      dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
      useAi?: string;
    } = {},
```

```ts
    return this.service.parsePreview(req.accountId, req.user.id, file.buffer, {
      bankId, mappingId, encoding,
      inlineMapping,
      delimiter: body.delimiter,
      amountFormat: body.amountFormat,
      dateFormat: body.dateFormat,
      useAi: body.useAi === 'true',
    });
```

Add the throttle to the preview route and the new consent endpoint:

```ts
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
```

```ts
  @Post('preview')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
```

```ts
  /**
   * Record the account's one-time consent to send statement fragments to the
   * AI provider. Writes account-wide state, so viewers are blocked.
   */
  @Post('ai-consent')
  @UseGuards(new ViewerBlockGuard())
  aiConsent(@Req() req: AuthenticatedRequest) {
    return this.service.grantAiConsent(req.accountId);
  }
```

`ViewerBlockGuard` is exported from `apps/api/src/modules/accounts/guards/account-role.guard.ts` and is zero-dependency by design, so instantiating it inline needs no module import.

- [ ] **Step 4: Add `grantAiConsent` to the service**

```ts
  async grantAiConsent(accountId: string): Promise<{ ok: boolean }> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    if (account?.encryptionTier === 2) {
      throw new BadRequestException({
        code: 'E2EE_UNSUPPORTED',
        message: 'AI import is unavailable for fully encrypted accounts',
      });
    }
    await this.prisma.account.update({
      where: { id: accountId },
      data: { aiImportConsentAt: new Date() },
    });
    return { ok: true };
  }
```

- [ ] **Step 5: Confirm the signature on commit**

In `commit()`, after the transaction succeeds and `saveMapping` is handled, add:

```ts
    if (dto.headerFingerprint) {
      void this.signatures.confirm(dto.headerFingerprint).catch(() => {});
    }
```

and where the client saves a corrected mapping (`saveMapping` present together with `headerFingerprint`), add:

```ts
      void this.signatures.markCorrected(dto.headerFingerprint).catch(() => {});
```

A user who saves their own mapping for a fingerprint has, by definition, corrected whatever the dictionary offered.

- [ ] **Step 6: Add the env vars**

Append to `.env.example`:

```bash
# AI statement import (apps/api). Both optional — the defaults below apply when unset.
AI_IMPORT_MAX_PDF_PAGES=20
AI_IMPORT_MAX_INFERENCES_PER_DAY=20
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && npx jest import-bank`
Expected: PASS — all import-bank specs green.

- [ ] **Step 8: Run the full API suite and typecheck**

Run: `cd apps/api && npx jest`
Run: `npm run typecheck` (from the repo root)
Run: `npm run lint`
Expected: all PASS. Any failure here is a real regression — do not proceed to plan 2 with a red suite.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/import-bank/import-bank.controller.ts apps/api/src/modules/import-bank/import-bank.controller.spec.ts apps/api/src/modules/import-bank/import-bank.service.ts .env.example
git commit -m "feat(import): AI consent endpoint, preview throttle and signature confirmation"
```

---

## Done criteria for this plan

- A CSV or XLSX statement from an unsupported bank returns `needs_ai_consent`, and after consent imports correctly with `aiInferred: true`.
- A second account uploading the same bank's export is served from `bank_statement_signatures` with **no** LLM call.
- `externalRef`s from the inference path equal those from a hand-mapped import of the same file, byte for byte.
- A PDF statement from an unsupported bank imports for a Pro account, is refused with `TIER_REQUIRED` for a free one, and always carries an `extractionWarning` unless its balances reconcile.
- Every AI failure mode lands on `needs_picker` or `needs_mapping`; none produces a 5xx.
- `cd apps/api && npx jest` is green; `npm run typecheck` and `npm run lint` are green.

## Follow-up: plan 2 (mobile)

Not in scope here. It covers the `needs_ai_consent` screen, the editable mapping chip row on the preview screen when `aiInferred` is true, routing `extractionWarning` and `droppedPages` into visible copy, the `TIER_REQUIRED` → `useUpgradeStore` path for PDF, and `bankImport.ai*` keys across all 9 locales.
