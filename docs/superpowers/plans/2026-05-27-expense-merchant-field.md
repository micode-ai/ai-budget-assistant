# Expense Merchant Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-text `merchant` field to expenses — auto-captured from receipt scan + bank/Wise import, manually editable with autocomplete, shown on the detail screen and list rows, with a client-side merchant filter and search match.

**Architecture:** A single nullable `merchant` string column on `Expense`, threaded through shared-types → Prisma → API service/DTOs → mobile SQLite → store → UI. No normalized merchant entity. The merchant filter and autocomplete suggestions are derived client-side from the distinct merchant values already loaded in memory (offline-first); no new API endpoints.

**Tech Stack:** TypeScript, NestJS 10 + Prisma 5 (Postgres), Expo/React Native + SQLite (raw `executeSql`), Zustand, Jest / jest-expo, class-validator, Zod.

**Spec:** `docs/superpowers/specs/2026-05-27-expense-merchant-field-design.md`

**Conventions:** Branch is `development`. Commit after each task. Do NOT bump app version. GitHub artifacts in English.

---

### Task 1: Shared types + Zod schema

**Files:**
- Modify: `packages/shared-types/src/entities/index.ts` (Expense interface, ~line 208)
- Modify: `packages/shared-utils/src/validation/index.ts` (expense create/update Zod schema)

- [ ] **Step 1: Add `merchant` to the Expense entity**

In `packages/shared-types/src/entities/index.ts`, inside the `Expense` interface, add the field right after `notes?: string;` (currently line 209):

```ts
  notes?: string;
  merchant?: string;
```

- [ ] **Step 2: Add `merchant` to the expense Zod schema(s)**

In `packages/shared-utils/src/validation/index.ts`, find the expense schema(s) (search for `description:` within the expense create/update Zod object). Add a `merchant` field next to `description`:

```ts
    merchant: z.string().max(120).optional(),
```

If there are separate create and update schemas, add it to both. If the update schema uses `.partial()` off the create schema, adding it once is enough.

- [ ] **Step 3: Build the shared packages to verify types compile**

Run: `npm run build -- --filter=@budget/shared-types --filter=@budget/shared-utils`
Expected: PASS (no TypeScript errors). If the repo's turbo filter syntax differs, run `cd packages/shared-types && npx tsc --noEmit` and `cd packages/shared-utils && npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types packages/shared-utils
git commit -m "feat(types): add merchant field to Expense entity and validation"
```

---

### Task 2: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Expense model)

- [ ] **Step 1: Add the `merchant` column and index**

In `apps/api/prisma/schema.prisma`, in `model Expense`, add the column right after the `notes String?` line:

```prisma
  description  String?
  notes        String?
  merchant     String?
```

Then add an index near the other `@@index` lines of the model:

```prisma
  @@index([accountId, merchant])
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run (from `apps/api/`):
```bash
npx prisma migrate dev --name add_expense_merchant
npx prisma generate
```
Expected: a new migration directory under `apps/api/prisma/migrations/<timestamp>_add_expense_merchant/` and `Prisma client generated`. If the dev DB is unavailable, instead run `npx prisma migrate dev --create-only --name add_expense_merchant` to generate the SQL without applying, then `npx prisma generate`.

- [ ] **Step 3: Verify the generated SQL**

Run: `cat apps/api/prisma/migrations/*add_expense_merchant/migration.sql`
Expected: contains `ALTER TABLE "expenses" ADD COLUMN "merchant" TEXT;` and a `CREATE INDEX` on `(account_id, merchant)`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(db): add merchant column + index to expenses"
```

---

### Task 3: API DTOs + expenses service

**Files:**
- Modify: `apps/api/src/modules/expenses/dto/index.ts` (imports, CreateExpenseDto, UpdateExpenseDto)
- Modify: `apps/api/src/modules/expenses/expenses.service.ts` (create `expenseData` + upsert `updateData`, PATCH `expenseUpdateData`)

- [ ] **Step 1: Import `MaxLength`**

In `apps/api/src/modules/expenses/dto/index.ts`, add `MaxLength` to the `class-validator` import block (currently lines 1-12):

```ts
import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsBoolean,
  IsArray,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
```

- [ ] **Step 2: Add `merchant` to `CreateExpenseDto`**

In `CreateExpenseDto`, after the `projectId?: string;` block (~line 170), add:

```ts
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant?: string;
```

- [ ] **Step 3: Add `merchant` to `UpdateExpenseDto`**

In `UpdateExpenseDto`, after its `projectId?: string | null;` block (~line 266), add (nullable so it can be cleared):

```ts
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant?: string | null;
```

- [ ] **Step 4: Persist `merchant` on create (both upsert branches)**

In `apps/api/src/modules/expenses/expenses.service.ts`, in the `create` method:

In `expenseData` (after `notes: dto.notes,` ~line 107) add:
```ts
        notes: dto.notes,
        merchant: dto.merchant,
```

In `updateData` (after `notes: dto.notes,` ~line 134) add:
```ts
          notes: dto.notes,
          merchant: dto.merchant,
```

- [ ] **Step 5: Persist `merchant` on update (PATCH)**

In the `update` method's `expenseUpdateData` (after `notes: dto.notes,` ~line 404) add:
```ts
          notes: dto.notes,
          merchant: dto.merchant === undefined ? undefined : dto.merchant,
```
(Passing `undefined` = no change; a string sets it; `null`/empty clears it. `toExpenseResponse` spreads `...rest`, so `merchant` is returned automatically — no change needed there.)

- [ ] **Step 6: Typecheck the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS. (If `merchant` is reported as unknown on the Prisma input type, re-run `npx prisma generate`.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/expenses
git commit -m "feat(api): persist and return expense merchant on create/update"
```

---

### Task 4: API import (Wise + bank) merchant on commit

**Files:**
- Modify: `apps/api/src/modules/import-wise/import-wise.service.ts` (commit `tx.expense.create`, ~line 272)
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts` (commit `tx.expense.create`, ~line 351)

- [ ] **Step 1: Wise — confirm the committed row carries merchant**

In `import-wise.service.ts`, the preview row already computes `const merchant = r.Merchant || undefined;` (~line 177) and includes `merchant` in the preview object (~line 187). Confirm the committed row type carries `merchant` through to the commit loop. In the commit's `tx.expense.create({ data: { ... } })` (~line 272), add `merchant` to the `data` object next to `description`:

```ts
                description: row.description,
                merchant: row.merchant ?? null,
```

If `row` (the commit DTO) does not yet include `merchant`, add `merchant?: string` to the commit row DTO/type and ensure the client sends it (the preview already exposes it). If threading the field through the commit payload is non-trivial, fall back to re-deriving from the row's description is NOT acceptable — instead add `merchant` to the commit row shape.

- [ ] **Step 2: Bank — add merchant to the committed expense**

In `import-bank.service.ts`, the normalized row has a `merchant` hint (from `merchants-pl.ts`). In the commit's `tx.expense.create({ data: { ... } })` (~line 351), add next to `description: row.description,`:

```ts
                description: row.description,
                merchant: row.merchant ?? null,
```

If the normalized bank row type doesn't expose `merchant`, add `merchant?: string` to it and set it where the parser/merchant-hint is resolved. Income rows are unchanged.

- [ ] **Step 3: Typecheck the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run existing import specs (regression)**

Run: `cd apps/api && npx jest import-bank import-wise`
Expected: PASS (parser/merchant specs unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/import-wise apps/api/src/modules/import-bank
git commit -m "feat(api): store detected merchant on bank/Wise import commit"
```

---

### Task 5: API bot OCR (Telegram + WhatsApp) merchant

**Files:**
- Modify: `apps/api/src/modules/telegram/handlers/photo.handler.ts` (pending-receipt store ~line 142, create call ~line 297)
- Modify: `apps/api/src/modules/whatsapp/handlers/photo.handler.ts` (parallel structure)

- [ ] **Step 1: Telegram — thread merchant into the pending receipt + create**

In `telegram/handlers/photo.handler.ts`:

a) Add `merchant?: string;` to the pending-receipt type (the interface around line 30 with `description: string;`).

b) In both `pendingReceipts.set(receiptId, { ... })` calls (image ~line 142 and PDF path), add after `description: receipt.description,`:
```ts
        description: receipt.description,
        merchant: receipt.merchant ?? undefined,
```

c) In the `this.expensesService.create(...)` call (~line 297) add to the dto after `description: data.description,`:
```ts
          description: data.description,
          merchant: data.merchant,
```

- [ ] **Step 2: WhatsApp — same wiring**

Apply the identical change in `whatsapp/handlers/photo.handler.ts`: add `merchant?: string` to its pending-receipt state shape (note WhatsApp stores pending state in Redis — add the field to the serialized object), set it from `receipt.merchant`, and pass `merchant` into `expensesService.create(...)`.

- [ ] **Step 3: Typecheck the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/telegram apps/api/src/modules/whatsapp
git commit -m "feat(api): carry OCR merchant into bot-created expenses"
```

---

### Task 6: Mobile SQLite (migration + Drizzle schema + repository)

**Files:**
- Modify: `apps/mobile/src/db/client.native.ts` (idempotent ALTER, ~line 524)
- Modify: `apps/mobile/src/db/schema/index.ts` (expenses table)
- Modify: `apps/mobile/src/db/expenseRepository.ts` (ExpenseRow, rowToExpense, expenseToParams, INSERT, updateExpenseInDb)

- [ ] **Step 1: Add the idempotent column migration**

In `apps/mobile/src/db/client.native.ts`, after the expenses debt-fields block (after line 524 `... related_debt_income_id TEXT`), add:

```ts
    // Merchant field for expenses (ABA — merchant feature)
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN merchant TEXT`); } catch {}
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `apps/mobile/src/db/schema/index.ts`, in the `expenses` table, after `notes: text('notes'),` add:

```ts
  notes: text('notes'),
  merchant: text('merchant'),
```

- [ ] **Step 3: Add `merchant` to the repository row type and mappers**

In `apps/mobile/src/db/expenseRepository.ts`:

a) `ExpenseRow` interface — after `notes: string | null;` (line 14):
```ts
  notes: string | null;
  merchant: string | null;
```

b) `rowToExpense` — after `notes: row.notes ?? undefined,` (line 50):
```ts
    notes: row.notes ?? undefined,
    merchant: row.merchant ?? undefined,
```

c) `expenseToParams` — after `expense.notes ?? null,` (line 92):
```ts
    expense.notes ?? null,
    expense.merchant ?? null,
```

d) `insertExpense` — add `merchant` to the column list and one more `?` placeholder. Update the column list (line 134-143) so the columns read `... description, notes, merchant, category_id, ...` and add one `?` to the VALUES tuple (it must have 33 placeholders now). The exact new column line:
```sql
      description, notes, merchant, category_id, date, time,
```
and the VALUES tuple becomes 33 `?`:
```sql
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
```
(IMPORTANT: `expenseToParams` order in step (c) inserts `merchant` right after `notes`, so the column list order above must match — `merchant` between `notes` and `category_id`.)

e) `updateExpenseInDb` — after the `description` branch (lines 165-168) add a merchant branch:
```ts
  if (updates.merchant !== undefined) {
    setClauses.push('merchant = ?');
    params.push(updates.merchant ?? null);
  }
```

- [ ] **Step 4: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/db
git commit -m "feat(mobile): add merchant column to expenses SQLite + repository"
```

---

### Task 7: Mobile merchant utility (TDD)

**Files:**
- Create: `apps/mobile/src/utils/merchant.ts`
- Test: `apps/mobile/src/utils/__tests__/merchant.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/utils/__tests__/merchant.test.ts`:

```ts
import { getDistinctMerchants } from '../merchant';
import type { Expense } from '@budget/shared-types';

const make = (merchant?: string, isDeleted = false) =>
  ({ merchant, isDeleted } as unknown as Expense);

describe('getDistinctMerchants', () => {
  it('returns trimmed, de-duplicated (case-insensitive), sorted merchants', () => {
    const expenses = [
      make('Lidl'),
      make('biedronka'),
      make('lidl'),       // dup of Lidl (case-insensitive) — keep first casing
      make('  '),         // blank
      make(undefined),    // none
      make('Żabka'),
    ];
    expect(getDistinctMerchants(expenses)).toEqual(['biedronka', 'Lidl', 'Żabka']);
  });

  it('skips deleted expenses', () => {
    const expenses = [make('Lidl', true), make('Rossmann')];
    expect(getDistinctMerchants(expenses)).toEqual(['Rossmann']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts`
Expected: FAIL with "Cannot find module '../merchant'".

- [ ] **Step 3: Implement the utility**

Create `apps/mobile/src/utils/merchant.ts`:

```ts
import type { Expense } from '@budget/shared-types';

/**
 * Distinct, non-empty merchant names across the given expenses.
 * De-duplicated case-insensitively (first-seen casing wins), excludes
 * soft-deleted rows, sorted with locale-aware compare. Used for the
 * merchant filter picker and the manual-entry autocomplete suggestions.
 */
export function getDistinctMerchants(expenses: Expense[]): string[] {
  const seen = new Map<string, string>();
  for (const e of expenses) {
    if (e.isDeleted) continue;
    const m = e.merchant?.trim();
    if (!m) continue;
    const key = m.toLowerCase();
    if (!seen.has(key)) seen.set(key, m);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/merchant.ts apps/mobile/src/utils/__tests__/merchant.test.ts
git commit -m "feat(mobile): add getDistinctMerchants utility with tests"
```

---

### Task 8: Mobile store (filters, create, merge, filtering)

**Files:**
- Modify: `apps/mobile/src/stores/expenseStore.ts` (ExpenseFilters, defaults, addExpense, maybeEncrypt, loadExpenses merge, getFilteredExpenses, getDistinctMerchants selector)

- [ ] **Step 1: Add `merchant` to `ExpenseFilters` + default**

In `expenseStore.ts`, in `interface ExpenseFilters` (line 38) add after `categoryId`:
```ts
  categoryId: string | null;
  merchant: string | null;
```
In the store's default `filters` object (~line 110) add:
```ts
      categoryId: null,
      merchant: null,
```

- [ ] **Step 2: Expose a distinct-merchants selector**

Add to the `ExpenseState` interface (near `getFilteredExpenses: () => Expense[];`, line 91):
```ts
  getFilteredExpenses: () => Expense[];
  getDistinctMerchants: () => string[];
```
Add the import at the top of the file:
```ts
import { getDistinctMerchants as computeDistinctMerchants } from '@/utils/merchant';
```
Implement it next to `getFilteredExpenses` (in the store body):
```ts
    getDistinctMerchants: () => computeDistinctMerchants(get().expenses),
```

- [ ] **Step 3: Persist merchant on create**

In `addExpense`, the destructure (line 452) currently pulls `projectId` etc. `merchant` is a plain column so it stays in `coreData` and flows into `newExpense` via `...coreData` and into `insertExpense` — no destructure change needed. Add `merchant` to the server payload in the `api.createExpense({ ... })` call (~line 565), after `description: ...`:
```ts
          description: encPayload.description ?? newExpense.description,
          merchant: encPayload.merchant ?? newExpense.merchant,
```

- [ ] **Step 4: Encrypt merchant alongside description**

In the `maybeEncrypt('expense', { ... }, accountId)` call (~line 558) add `merchant`:
```ts
      maybeEncrypt('expense', {
        description: newExpense.description,
        notes: newExpense.notes,
        merchant: newExpense.merchant,
        amount: newExpense.amount,
        discountAmount: newExpense.discountAmount,
        debtContactName: newExpense.debtContactName,
      }, accountId).then(...)
```
Then verify the encryption middleware's expense field list includes `merchant`. Search `apps/mobile/src/services/` and `encryptionMiddleware` for the expense field allowlist (the set that contains `description`, `notes`, `debtContactName`); add `'merchant'` to it so it gets encrypted/decrypted symmetrically. If no explicit allowlist exists (it encrypts whatever keys are passed), no extra change is needed — but the decrypt path on server-pull (next step) must request `merchant`.

- [ ] **Step 5: Map merchant on server-pull merge**

In `loadExpenses`, where each server expense `se` is turned into a local `Expense` (the object built around line 253-271 with `projectId: serverProjectId || localExpense?.projectId,`), add:
```ts
              description: ...,
              merchant: se.merchant ?? localExpense?.merchant,
```
Place `merchant: se.merchant ?? localExpense?.merchant,` alongside the other scalar fields in that built object. If decryption is applied to `description`/`notes` for E2EE accounts in this merge (look for a decrypt step that overwrites `description`), include `merchant` in the same decrypt mapping so encrypted merchants are restored to plaintext locally.

- [ ] **Step 6: Filter + search by merchant in `getFilteredExpenses`**

In `getFilteredExpenses` (~line 948), after the category filter block (lines 987-990) add a merchant equality filter:
```ts
      // Apply merchant filter
      if (filters.merchant) {
        filtered = filtered.filter((e) => e.merchant === filters.merchant);
      }
```
And extend the search block (lines 993-1000) to also match merchant:
```ts
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.description?.toLowerCase().includes(query) ||
            e.notes?.toLowerCase().includes(query) ||
            e.merchant?.toLowerCase().includes(query)
        );
      }
```

- [ ] **Step 7: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/stores/expenseStore.ts
git commit -m "feat(mobile): merchant in filters, create, sync merge, and filtering"
```

---

### Task 9: Mobile MerchantInput component

**Files:**
- Create: `apps/mobile/src/components/MerchantInput.tsx`

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/components/MerchantInput.tsx`. It renders a labeled text input plus up to ~6 suggestion chips derived from existing merchants, filtered by the current input. Self-styled via the theme so it works in both the new-expense form and the detail screen.

```tsx
import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTheme, useStyles, type Theme } from '@/theme';

interface MerchantInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export const MerchantInput: React.FC<MerchantInputProps> = ({ value, onChangeText }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);

  const suggestions = useMemo(() => {
    const all = getDistinctMerchants();
    const q = value.trim().toLowerCase();
    const matches = q
      ? all.filter((m) => m.toLowerCase().includes(q) && m.toLowerCase() !== q)
      : all;
    return matches.slice(0, 6);
  }, [getDistinctMerchants, value]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('expenses.merchant')}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('expenses.merchantPlaceholder')}
        placeholderTextColor={theme.colors.textTertiary}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {suggestions.map((m) => (
            <TouchableOpacity key={m} style={styles.chip} onPress={() => onChangeText(m)}>
              <Text style={styles.chipText} numberOfLines={1}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const createStyles = (theme: Theme) => ({
  container: { marginVertical: theme.spacing[2] },
  label: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1.5],
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  chips: { gap: theme.spacing[2], paddingTop: theme.spacing[2] },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSecondary,
    maxWidth: 160,
  },
  chipText: { fontSize: 13, color: theme.colors.textSecondary },
});
```

- [ ] **Step 2: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (i18n keys are added in Task 14; `t()` calls compile regardless).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/MerchantInput.tsx
git commit -m "feat(mobile): add MerchantInput component with autocomplete"
```

---

### Task 10: New-expense form uses MerchantInput

**Files:**
- Modify: `apps/mobile/app/expense/new.tsx` (import, state, render, addExpense payload)

- [ ] **Step 1: Import the component**

Near the other component imports in `new.tsx`, add:
```ts
import { MerchantInput } from '@/components/MerchantInput';
```

- [ ] **Step 2: Add merchant state**

After `const [description, setDescription] = useState(params.description || '');` (line 66) add:
```ts
  const [merchant, setMerchant] = useState('');
```

- [ ] **Step 3: Render the input after Description**

In the JSX, right after the Description `</View>` block (after line 232) and before `{/* Category */}`, add:
```tsx
          {/* Merchant */}
          <View style={styles.fieldContainer}>
            <MerchantInput value={merchant} onChangeText={setMerchant} />
          </View>
```

- [ ] **Step 4: Include merchant in addExpense**

In the `addExpense({ ... })` call, after `description: description.trim(),` (line 124) add:
```ts
        description: description.trim(),
        merchant: merchant.trim() || undefined,
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint app/expense/new.tsx`
Expected: PASS / no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/expense/new.tsx
git commit -m "feat(mobile): merchant field on new-expense form"
```

---

### Task 11: Expense detail — display + edit merchant

**Files:**
- Modify: `apps/mobile/app/expense/[id].tsx` (import, edit state, render, save, cancel reset)

- [ ] **Step 1: Import the component**

Add near the other component imports:
```ts
import { MerchantInput } from '@/components/MerchantInput';
```

- [ ] **Step 2: Add edit state**

Alongside the other `edit*` state (after `editCategory`/`editProjectId`), add:
```ts
  const [editMerchant, setEditMerchant] = useState(expense?.merchant || '');
```

- [ ] **Step 3: Render merchant row (read) / input (edit)**

In the details card, after the Description detail row and before the Date row (or near the Project section), add:
```tsx
          {/* Merchant Section */}
          {isEditing ? (
            <View style={styles.detailRow}>
              <MerchantInput value={editMerchant} onChangeText={setEditMerchant} />
            </View>
          ) : expense.merchant ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('expenses.merchant')}</Text>
              <Text style={styles.detailValue}>{expense.merchant}</Text>
            </View>
          ) : null}
```

- [ ] **Step 4: Save merchant in `handleSaveEdit`**

In the `updateExpense(expense.id, { ... })` call, add to the updates object:
```ts
      categoryId: editCategory || undefined,
      merchant: editMerchant.trim() || undefined,
      date: editDate,
```
(Note: to clear a merchant the empty string becomes `undefined`, which the generic `updateExpenseInDb` skips. To make clearing reliable, instead pass the trimmed value with explicit empty handling:)
```ts
      merchant: editMerchant.trim() === '' ? '' : editMerchant.trim(),
```
Use the second form so an empty string is written (clears locally via `updateExpenseInDb`'s `updates.merchant !== undefined` branch and sends `''` to the server, which clears it). Verify `updateExpenseInDb` writes `''` (it does: `params.push(updates.merchant ?? null)` → empty string is kept).

- [ ] **Step 5: Reset on cancel**

In the cancel handler that resets `editDescription`/`editCategory`/etc., add:
```ts
                  setEditMerchant(expense.merchant || '');
```

- [ ] **Step 6: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint "app/expense/[id].tsx"`
Expected: PASS / no new errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/app/expense/[id].tsx"
git commit -m "feat(mobile): display and edit merchant on expense detail"
```

---

### Task 12: Receipt scan saves the detected merchant

**Files:**
- Modify: `apps/mobile/app/expense/receipt.tsx` (the `addExpense({ ... })` call ~line 126)

- [ ] **Step 1: Pass merchant into addExpense**

In `receipt.tsx`, in the `addExpense({ ... })` call (~line 126), after `description: scannedReceipt.description,` (line 131) add:
```ts
        description: scannedReceipt.description,
        merchant: scannedReceipt.merchant ?? undefined,
```
(`scannedReceipt.merchant` is already parsed and displayed on the preview — see lines 293-296.)

- [ ] **Step 2: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint app/expense/receipt.tsx`
Expected: PASS / no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/expense/receipt.tsx
git commit -m "feat(mobile): persist scanned merchant from receipt OCR"
```

---

### Task 13: Expenses tab — list row + merchant filter

**Files:**
- Modify: `apps/mobile/app/(tabs)/expenses.tsx` (row render, merchant filter control + picker modal, styles)

- [ ] **Step 1: Show merchant as a secondary line on expense rows**

In `renderExpenseItem` (line 207), inside `styles.expenseDetails`, add a merchant line between description and date:
```tsx
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Expense'}
        </Text>
        {item.merchant ? (
          <Text style={styles.expenseMerchant} numberOfLines={1}>{item.merchant}</Text>
        ) : null}
        <Text style={styles.expenseDate}>{formatDate(item.date, undefined, getIntlLocale())}</Text>
      </View>
```
Add the style to the `createStyles` object (near `expenseDate`):
```ts
  expenseMerchant: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
```
(Income rows are unchanged.)

- [ ] **Step 2: Add merchant-picker state + distinct list**

Near the existing `showCategoryPicker` state, add:
```ts
  const [showMerchantPicker, setShowMerchantPicker] = useState(false);
```
Read the selector from the store (where `getFilteredExpenses` etc. are pulled, line 33):
```ts
  const { loadExpenses, getFilteredExpenses, getDistinctMerchants, deleteExpense, filters: expenseFilters, setFilters: setExpenseFilters } = useExpenseStore();
```

- [ ] **Step 3: Render a merchant filter button (expenses tab only)**

After the Category Filter block (the IIFE ending ~line 410+; place it just after that wrapper), add an expenses-only merchant filter control:
```tsx
      {/* Merchant Filter (expenses only) */}
      {activeTab === 'expenses' && (() => {
        const hasFilter = expenseFilters.merchant !== null;
        return (
          <View style={styles.categoryFilterWrapper}>
            <TouchableOpacity
              style={[styles.categoryFilterButton, hasFilter && styles.categoryFilterButtonActive]}
              onPress={() => setShowMerchantPicker(true)}
            >
              <Ionicons name="storefront-outline" size={14} color={hasFilter ? theme.colors.primary : theme.colors.textTertiary} />
              <Text style={[styles.categoryFilterButtonText, hasFilter && styles.categoryChipTextActive]} numberOfLines={1}>
                {expenseFilters.merchant || t('expenses.merchantAll')}
              </Text>
              {hasFilter && (
                <TouchableOpacity onPress={() => setExpenseFilters({ merchant: null })}>
                  <Ionicons name="close-circle" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        );
      })()}
```

- [ ] **Step 4: Render the merchant picker modal**

Add a modal near the bottom of the component's JSX (next to where the category picker / other modals render). Reuse `Modal` (import it from `react-native` if not already imported):
```tsx
      <Modal visible={showMerchantPicker} transparent animationType="slide" onRequestClose={() => setShowMerchantPicker(false)}>
        <TouchableOpacity style={styles.merchantModalOverlay} activeOpacity={1} onPress={() => setShowMerchantPicker(false)}>
          <View style={styles.merchantModalSheet}>
            <Text style={styles.merchantModalTitle}>{t('expenses.merchant')}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                style={styles.merchantRow}
                onPress={() => { setExpenseFilters({ merchant: null }); setShowMerchantPicker(false); }}
              >
                <Text style={styles.merchantRowText}>{t('expenses.merchantAll')}</Text>
                {expenseFilters.merchant === null && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
              {getDistinctMerchants().map((m) => (
                <TouchableOpacity
                  key={m}
                  style={styles.merchantRow}
                  onPress={() => { setExpenseFilters({ merchant: m }); setShowMerchantPicker(false); }}
                >
                  <Text style={styles.merchantRowText} numberOfLines={1}>{m}</Text>
                  {expenseFilters.merchant === m && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                </TouchableOpacity>
              ))}
              {getDistinctMerchants().length === 0 && (
                <Text style={styles.merchantEmpty}>{t('expenses.merchantNone')}</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
```
Add the styles to `createStyles`:
```ts
  merchantModalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' as const },
  merchantModalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[10],
  },
  merchantModalTitle: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  merchantRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  merchantRowText: { fontSize: 15, color: theme.colors.textPrimary, flex: 1, marginRight: theme.spacing[2] },
  merchantEmpty: { fontSize: 14, color: theme.colors.textTertiary, textAlign: 'center' as const, paddingVertical: theme.spacing[4] },
```
Ensure `Modal` and `ScrollView` are in the `react-native` import at the top (ScrollView already is; add `Modal` if missing).

- [ ] **Step 5: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(tabs)/expenses.tsx"`
Expected: PASS / no new errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/(tabs)/expenses.tsx"
git commit -m "feat(mobile): merchant on expense rows + merchant filter on Expenses tab"
```

---

### Task 14: i18n — all 8 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts`

REQUIRED SUB-SKILL: use the `i18n-add-strings` skill to keep all 8 locale files in sync.

- [ ] **Step 1: Add keys under the `expenses` namespace in every locale**

Add these keys to the `expenses` object in each locale file (translate the values per language):

| key | en value |
|---|---|
| `merchant` | `Merchant` |
| `merchantPlaceholder` | `e.g. Biedronka, Amazon` |
| `merchantAll` | `All merchants` |
| `merchantNone` | `No merchants yet` |

Suggested translations:
- de: `Händler`, `z. B. Biedronka, Amazon`, `Alle Händler`, `Noch keine Händler`
- es: `Comercio`, `p. ej. Biedronka, Amazon`, `Todos los comercios`, `Aún no hay comercios`
- fr: `Commerçant`, `p. ex. Biedronka, Amazon`, `Tous les commerçants`, `Aucun commerçant`
- pl: `Sprzedawca`, `np. Biedronka, Amazon`, `Wszyscy sprzedawcy`, `Brak sprzedawców`
- ru: `Продавец`, `напр. Biedronka, Amazon`, `Все продавцы`, `Пока нет продавцов`
- ua: `Продавець`, `напр. Biedronka, Amazon`, `Усі продавці`, `Поки немає продавців`
- be: `Прадавец`, `напр. Biedronka, Amazon`, `Усе прадаўцы`, `Пакуль няма прадаўцоў`

- [ ] **Step 2: Verify locale parity**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS. Then spot-check each file has the 4 new keys (grep `merchantAll` across the 8 files → 8 hits).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): add merchant i18n keys (8 locales)"
```

---

### Task 15: Full verification + docs + ABA issue

**Files:**
- Modify: `CLAUDE.md`
- Modify: `user_docs/{en,de,es,fr,pl,ru,ua,be}/03-expenses-and-income.md`
- Regenerate: `apps/mobile/src/help/content.ts` (via `npm run generate:help` — never hand-edit)

- [ ] **Step 1: Full typecheck + targeted tests**

Run:
```bash
cd apps/api && npx tsc --noEmit
cd ../mobile && npx tsc --noEmit -p tsconfig.json && npx jest src/utils/__tests__/merchant.test.ts
```
Expected: all PASS.

- [ ] **Step 2: Update CLAUDE.md**

Add a concise note (terse pattern reference) documenting the merchant field: column on `Expense` (Prisma + mobile SQLite), populated from OCR (mobile `receipt.tsx`, bot photo handlers) and bank/Wise import commit, manually editable via `MerchantInput`, encrypted alongside `description`, and filtered/searched client-side (no API query param) with suggestions from `getDistinctMerchants`.

- [ ] **Step 3: Update user docs (8 locales)**

In each `user_docs/<lang>/03-expenses-and-income.md`, add a short "Merchant" note: expenses can have a merchant (auto-filled from receipt scans and bank imports, editable manually), shown on the list and detail, and filterable via the merchant filter on the Expenses tab. Translate per locale.

- [ ] **Step 4: Regenerate help content**

Run (from project root): `npm run generate:help`
Expected: `Generated N sections across 8 languages ...`.

- [ ] **Step 5: Create the ABA issue**

Find the latest issue number (`gh issue list --limit 1 --state all --json number,title`), add 1, and create `ABA-{N}: Add merchant field to expenses (display, capture, filter)` with Problem / Implementation / Out-of-scope sections (English). Reference this plan and the spec.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git commit -m "docs: document expense merchant field (CLAUDE.md + user_docs, 8 locales)"
```

---

## Self-Review

**Spec coverage:**
- Source = auto + manual → Tasks 4 (import), 5 (bot OCR), 12 (mobile OCR), 10/11 (manual create+edit). ✔
- Filter = dedicated + search → Task 13 (filter control + picker), Task 8 step 6 (search match). ✔
- Display = detail + list row → Task 11 (detail), Task 13 step 1 (list row). ✔
- Manual input = free text + suggestions → Task 9 (MerchantInput), Task 7 (distinct util). ✔
- No backfill → no migration data step (Task 2 is schema-only). ✔
- Income out of scope → income rows untouched (Tasks 8/13 only touch expenses). ✔
- Encryption parity with description → Task 8 step 4. ✔
- Persist + return via API → Task 3. ✔

**Placeholder scan:** No TBD/TODO. Each code step shows concrete code. The only conditional ("if the row type doesn't expose merchant…") in Task 4 gives an explicit instruction (add the field), not a vague placeholder.

**Type/name consistency:** `merchant?: string` (entity), `merchant String?` (Prisma), `merchant TEXT` (SQLite), `getDistinctMerchants` (util + store selector + UI), `MerchantInput` (component, used in Tasks 10/11), `filters.merchant` (store + expenses tab), i18n keys `expenses.merchant{,Placeholder,All,None}` consistent across Tasks 9/11/13/14.

**Risk notes for the implementer:**
- Confirm the import commit row DTOs actually carry `merchant` (Task 4) — thread the field rather than re-deriving from description.
- Confirm the E2EE decrypt path on `loadExpenses` merge restores `merchant` (Task 8 step 5) — otherwise encrypted-account merchants render as ciphertext.
- The `insertExpense` placeholder count must increase to 33 and column order must match `expenseToParams` (Task 6 step 3).
