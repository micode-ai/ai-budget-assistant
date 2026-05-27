# Expense Merchant Field — Design

**Date:** 2026-05-27
**ABA issue:** to be created on completion (next after ABA-139)
**Status:** Approved (design)

## Problem

Expenses have no `merchant` field. Receipt OCR and bank/Wise import *detect* a merchant
name but fold it into the `description` text (e.g. "Purchase at Biedronka"), so it is
neither displayed as a distinct value nor filterable. Users want the merchant shown on
expenses and the ability to filter the expense list by it.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Source of merchant value | **Auto-capture** (receipt scan + bank/Wise import) **and** manual edit on the expense form |
| Filter UX | **Dedicated merchant filter** on the Expenses tab **plus** the existing search box also matches merchant |
| Display | **Detail screen row + secondary line on each list row** |
| Manual input style | **Free text with autocomplete suggestions** from previously-used merchants |
| Existing expenses | **No backfill** — only new/edited expenses get a merchant |
| Income | **Out of scope** — expenses only |

## Data-model approach

Free-text `merchant` string column on `Expense`. **No** normalized `Merchant` entity/table.
Suggestions and the filter list are the *distinct merchant values* already present in the
account's expenses, derived in-memory on the client (offline-first). Filtering stays
client-side (the app already pulls all expenses and filters in `getFilteredExpenses`), so
no `?merchant=` API query param and no distinct-merchants endpoint are needed.

## Changes by layer (follows CLAUDE.md dependency order)

### 1. `packages/shared-types`
- `Expense` entity (`src/entities/index.ts`): add `merchant?: string` near `description`/`notes`.
- DTOs (`src/dto/index.ts`) — if expense DTO shapes live here, mirror `merchant?: string`.

### 2. `packages/shared-utils`
- Zod expense schema (`src/validation/index.ts`): add `merchant: z.string().max(120).optional()`
  to the create/update expense schemas.

### 3. `apps/api` (Prisma + service)
- `apps/api/prisma/schema.prisma`: add `merchant String? @map("merchant")` to `Expense`,
  plus `@@index([accountId, merchant])`. Run `npx prisma migrate dev --name add_expense_merchant`
  + `npx prisma generate`.
- `apps/api/src/modules/expenses/dto/index.ts`: add `merchant?: string` to `CreateExpenseDto`
  (`@IsOptional() @IsString() @MaxLength(120)`) and `UpdateExpenseDto` (allow `string | null`
  to clear, mirroring how `projectId` is handled).
- `apps/api/src/modules/expenses/expenses.service.ts`:
  - `create`: persist `dto.merchant`.
  - `update`: set `merchant` when `dto.merchant !== undefined` (empty string / null clears).
  - `toExpenseResponse`: include `merchant`.
- OCR-created expenses (server side): the Telegram and WhatsApp photo handlers
  (`modules/telegram/handlers/photo.handler.ts`, `modules/whatsapp/handlers/photo.handler.ts`)
  create expenses from a scanned receipt — carry the OCR `merchantName` into `merchant`.
  (Mobile receipt scanning is handled client-side in `receipt.tsx`, see §6.)
- `apps/api/src/modules/import-bank/import-bank.service.ts` commit (`expense.create`, ~line 351):
  set `merchant: row.merchant ?? null` when the normalized row has one.
- `apps/api/src/modules/import-wise/import-wise.service.ts` commit: set `merchant` from the
  Wise row's already-parsed `merchant`.

### 4. `apps/mobile` — SQLite
- `apps/mobile/src/db/client.native.ts`: add an idempotent migration block
  `try { expoDb.execSync('ALTER TABLE expenses ADD COLUMN merchant TEXT'); } catch {}`
  (web client is in-memory, no-op).
- `apps/mobile/src/db/schema/index.ts`: add `merchant` text column to the `expenses` table def.
- `apps/mobile/src/db/expenseRepository.ts`: add `merchant` to insert params, update handling,
  and `rowToExpense` mapping.

### 5. `apps/mobile` — stores
- `expenseStore.ts`:
  - `ExpenseFilters`: add `merchant: string | null`.
  - default filters: `merchant: null`.
  - `addExpense`: include `merchant` in the new expense + `api.createExpense` payload
    (and the `maybeEncrypt('expense', …)` field set, matching `description`).
  - `updateExpense`: `merchant` is a plain column, so the generic path already persists it
    locally + server. Confirm `updateExpenseInDb` writes it.
  - server-pull merge (`loadExpenses`): map `se.merchant` → local expense (and decrypt if the
    field is encrypted, alongside `description`).
  - `getFilteredExpenses`: add a merchant equality filter; include `merchant` in the
    `searchQuery` `includes()` match.
  - new selector `getDistinctMerchants(): string[]` — distinct, non-empty, sorted, from
    non-deleted expenses (used by both the filter picker and the autocomplete suggestions).

### 6. `apps/mobile` — UI
- `app/expense/new.tsx`: merchant `TextInput` + suggestion chips/list from `getDistinctMerchants`
  filtered by current input; pass `merchant` to `addExpense`.
- `app/expense/[id].tsx`: read-mode "Merchant" detail row; edit-mode `TextInput` + suggestions;
  include `merchant` in the `updateExpense` call and reset on cancel.
- `app/expense/receipt.tsx`: pass `merchant: scannedReceipt.merchant ?? undefined` into the
  `addExpense({ … })` call (merchant is already shown in the preview).
- `app/(tabs)/expenses.tsx`:
  - render `merchant` as a secondary line under the description on each expense row;
  - add a merchant filter control next to the category filter (horizontal chips or a
    bottom-sheet picker) sourced from `getDistinctMerchants`, with an "All merchants" reset;
  - search box already matches merchant via the store change (no extra UI).

### 7. i18n (all 8 locales: en, de, es, fr, pl, ru, ua, be)
- `expenses.merchant` ("Merchant"), `expenses.merchantPlaceholder`, `expenses.merchantSuggestions`,
  `filters.allMerchants` (or reuse an existing "all" key), and any picker title.
- Follow the `i18n-add-strings` discipline — update all 8 files.

### 8. Docs (finish-aba-task)
- Update `CLAUDE.md` (expense merchant field note).
- Update `user_docs/<lang>/03-expenses-and-income.md` for all 8 locales (merchant display +
  filter), then `npm run generate:help`.
- Create the ABA issue.

## Encryption note

When account-level E2E encryption is enabled, `merchant` is encrypted client-side together
with `description` (added to the `maybeEncrypt('expense', …)` field set). Server-side import
writes plaintext `merchant`, exactly as it already does for `description` (import cannot
encrypt). Because filtering and suggestions are client-side over decrypted data, encryption
does not affect them.

## Out of scope / follow-ups

- Income merchant field.
- Voice-input expenses (no merchant detection in the voice flow).
- Backfill of merchant from legacy descriptions.
- Server-side `?merchant=` query param and a distinct-merchants endpoint (filtering is local).
- Per-merchant analytics / normalized merchant directory (possible future enhancement).

## Testing

- API: unit-test `create`/`update` persist + clear `merchant`; `toExpenseResponse` includes it;
  import commit maps merchant. Existing import parser specs unaffected.
- Mobile: `getFilteredExpenses` merchant filter + search match; `getDistinctMerchants` dedup/sort;
  manual `tsc --noEmit` + eslint on changed files.
- Manual: scan a receipt → merchant persists and shows; add manual expense with merchant +
  suggestion; filter list by merchant; edit/clear merchant.
