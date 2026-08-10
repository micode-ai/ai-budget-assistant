# AI Universal Statement Import — Mobile Implementation Plan (plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI statement import built in plan 1 reachable and safe from the Expo app — the consent screen, the editable inferred mapping, the assumed-currency and extraction warnings, and the Pro paywall for PDF — so the API can finally be deployed.

**Architecture:** No new state container and no new native module. `importStore` gains one field; `import-bank.api.ts` gains one method and stops throwing away HTTP status codes; one new screen is added to the existing `app/settings/import/` folder; `preview.tsx` grows three presentational blocks and `mapper.tsx` learns to prefill itself.

**Tech Stack:** Expo Router, React Native 0.81, Zustand, `react-i18next`, existing `useUpgradeStore` paywall.

**Spec:** `docs/superpowers/specs/2026-08-09-ai-universal-statement-import-design.md` — read its **Mobile and i18n** section first. It was revised after plan 1 shipped and the revision is the contract; the section's own first draft is marked as superseded.

**Plan 1 (API) is complete and committed.** Its shape, as built:

- `POST /import/bank/preview` may now return `status: 'needs_ai_consent'`, carrying `headers` / `sampleRows` / `headerFingerprint` (CSV) or the first 20 extracted lines in `headers` (PDF).
- **There is no `useAi` field.** Consent is written only by `POST /import/bank/ai-consent`, which takes no body and returns `{ ok: true }`. The flow is: preview → `needs_ai_consent` → consent → **re-request** preview.
- A successful AI parse returns `status: 'parsed'` plus `aiInferred: true`, `aiMapping`, `aiBankLabel?`, and possibly `currencyAssumed?`, `extractionWarning?`, `droppedPages?`.
- PDF extraction for a non-Pro account returns **403** with `{ code: 'TIER_REQUIRED', requiredTier: 'pro', currentTier }`.
- A fully-E2EE (tier-2) account never sees `needs_ai_consent`; it gets `needs_picker`, as before.

## Global Constraints

- **Never present an AI result as certain.** `currencyAssumed`, `extractionWarning` and an inferred mapping are all "check this before importing", never errors and never silent.
- **`aiBankLabel` is display-only.** It is the model's guess at the bank name; it must never select a parser, filter a list, or be persisted.
- **The consent screen must state what leaves the device** — header row plus up to 10 sample rows on CSV, the first 20 extracted lines on PDF — and where it goes. It is shown once per account.
- **Every new user-facing string goes in all 9 locales**: `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`. English first, then the rest; never leave 8 stale.
- Existing behaviour for a recognised bank must not change. A statement that parses today must render exactly as it does today.
- Mobile tests run from `apps/mobile` with `npx jest <pattern>`. Typecheck is `npm run typecheck` from the repo root.
- Commit messages in English.

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/services/import-bank.api.ts` (modify) | Preserve HTTP status + error `code` on preview; add `grantAiImportConsent()` |
| `apps/mobile/src/services/importErrors.ts` (create) | `ImportRequestError` + `isTierRequiredError` — pure, testable |
| `apps/mobile/src/stores/importStore.ts` (modify) | Remember the account that granted consent this session |
| `apps/mobile/app/settings/import/ai-consent.tsx` (create) | The consent screen |
| `apps/mobile/app/settings/import/preview.tsx` (modify) | Route `needs_ai_consent`; render the three new blocks |
| `apps/mobile/src/components/import/AiMappingChips.tsx` (create) | The editable inferred-mapping chip row |
| `apps/mobile/src/components/import/ImportNoticeBanner.tsx` (create) | Shared banner for currency/extraction notices |
| `apps/mobile/app/settings/import/mapper.tsx` (modify) | Prefill from `aiMapping` |
| `apps/mobile/app/_layout.tsx` (modify) | Register the new route's header |
| `apps/mobile/src/i18n/locales/*.ts` (modify ×9) | `bankImport.ai*` keys |

The two new components live under `src/components/import/` rather than inside `preview.tsx`, which is already 556 lines — the same reasoning that produced `src/components/shopping-list/` in ABA-352.

---

### Task 1: Preserve HTTP status and error code on import requests

**Files:**
- Create: `apps/mobile/src/services/importErrors.ts`
- Create: `apps/mobile/src/services/__tests__/importErrors.test.ts`
- Modify: `apps/mobile/src/services/import-bank.api.ts`

**Interfaces:**
- Produces: `class ImportRequestError extends Error { status: number; code?: string; requiredTier?: 'pro' | 'business' }`
- Produces: `isTierRequiredError(e: unknown): e is ImportRequestError` — true only for a 403 carrying `code === 'TIER_REQUIRED'`.

**Why first.** `importBankPreview` currently does `throw new Error(message)`, discarding the status and the body. The API's Pro gate answers 403 with `{ code: 'TIER_REQUIRED', requiredTier }`, and nothing downstream can see it — so the paywall in Task 6 is unbuildable until this lands.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/services/__tests__/importErrors.test.ts`:

```ts
import { ImportRequestError, isTierRequiredError } from '../importErrors';

describe('ImportRequestError', () => {
  it('carries status, code and requiredTier', () => {
    const e = new ImportRequestError('nope', 403, 'TIER_REQUIRED', 'pro');
    expect(e.message).toBe('nope');
    expect(e.status).toBe(403);
    expect(e.code).toBe('TIER_REQUIRED');
    expect(e.requiredTier).toBe('pro');
    expect(e instanceof Error).toBe(true);
  });
});

describe('isTierRequiredError', () => {
  it('accepts a 403 with the TIER_REQUIRED code', () => {
    expect(isTierRequiredError(new ImportRequestError('x', 403, 'TIER_REQUIRED', 'pro'))).toBe(true);
  });

  it('rejects a 403 without the code', () => {
    expect(isTierRequiredError(new ImportRequestError('x', 403))).toBe(false);
  });

  it('rejects the right code on the wrong status', () => {
    expect(isTierRequiredError(new ImportRequestError('x', 400, 'TIER_REQUIRED'))).toBe(false);
  });

  it('rejects a plain Error and a non-error', () => {
    expect(isTierRequiredError(new Error('x'))).toBe(false);
    expect(isTierRequiredError('x')).toBe(false);
    expect(isTierRequiredError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest importErrors`
Expected: FAIL — `Cannot find module '../importErrors'`

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/services/importErrors.ts`:

```ts
/**
 * The import endpoints answer with typed error bodies — notably a 403
 * `{ code: 'TIER_REQUIRED', requiredTier }` for PDF extraction on a free
 * account. The raw fetch helpers used to collapse every failure into
 * `new Error(message)`, which made those bodies unreadable and the paywall
 * unreachable. This carries them through.
 */
export class ImportRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requiredTier?: 'pro' | 'business',
  ) {
    super(message);
    this.name = 'ImportRequestError';
  }
}

export function isTierRequiredError(e: unknown): e is ImportRequestError {
  return e instanceof ImportRequestError && e.status === 403 && e.code === 'TIER_REQUIRED';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest importErrors`
Expected: PASS (6 tests)

- [ ] **Step 5: Throw the typed error from both raw-fetch helpers**

In `apps/mobile/src/services/import-bank.api.ts`, add the import:

```ts
import { ImportRequestError } from './importErrors';
```

Then replace the identical `if (!response.ok)` block in **both** `importBankPreview` (lines 53-57) and `requestBank` (lines 125-129) with:

```ts
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Request failed' }));
      const message = Array.isArray(err.message) ? err.message.join('\n') : err.message || `HTTP ${response.status}`;
      throw new ImportRequestError(message, response.status, err.code, err.requiredTier);
    }
```

`ImportRequestError` extends `Error`, so every existing `catch` that reads `err.message` keeps working unchanged.

- [ ] **Step 6: Add the consent method**

Append to the `importBankApi` object, after `importBankCommit`:

```ts
  /**
   * Records the account's one-time consent to send statement fragments to the
   * AI provider. Viewer-blocked and throttled server-side. The client must call
   * this before re-requesting a preview that returned `needs_ai_consent` —
   * there is no per-request consent flag.
   */
  grantAiImportConsent(): Promise<{ ok: boolean }> {
    return httpClient.request<{ ok: boolean }>('/import/bank/ai-consent', { method: 'POST' });
  },
```

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS

```bash
git add apps/mobile/src/services/importErrors.ts apps/mobile/src/services/__tests__/importErrors.test.ts apps/mobile/src/services/import-bank.api.ts
git commit -m "feat(import): preserve HTTP status and error code on import requests"
```

---

### Task 2: Remember consent for the session

**Files:**
- Modify: `apps/mobile/src/stores/importStore.ts`
- Create: `apps/mobile/src/stores/__tests__/importStore.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `ImportState` gains `aiConsentGrantedFor: string | null` and `setAiConsentGrantedFor(accountId: string | null): void`. `reset()` must **not** clear it.

**Why.** After the user accepts, the client re-requests the preview. If the server write raced or failed silently, the client would bounce back to the consent screen and loop. Remembering which account consented this session lets the consent screen refuse to show itself twice and surface a real error instead. It is per-account because consent is per-account, and it is deliberately in-memory only — the server holds the durable record.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/stores/__tests__/importStore.test.ts`:

```ts
import { useImportStore } from '../importStore';

describe('importStore consent tracking', () => {
  beforeEach(() => {
    useImportStore.setState({ aiConsentGrantedFor: null });
    useImportStore.getState().reset();
  });

  it('starts with no consent recorded', () => {
    expect(useImportStore.getState().aiConsentGrantedFor).toBeNull();
  });

  it('records the account that granted consent', () => {
    useImportStore.getState().setAiConsentGrantedFor('acc-1');
    expect(useImportStore.getState().aiConsentGrantedFor).toBe('acc-1');
  });

  it('survives reset(), which clears the file and preview but not consent', () => {
    useImportStore.getState().setFileAsset({ uri: 'u', name: 'n', type: 't' });
    useImportStore.getState().setAiConsentGrantedFor('acc-1');
    useImportStore.getState().reset();
    expect(useImportStore.getState().fileAsset).toBeNull();
    expect(useImportStore.getState().previewData).toBeNull();
    expect(useImportStore.getState().aiConsentGrantedFor).toBe('acc-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest importStore`
Expected: FAIL — `aiConsentGrantedFor` is `undefined`, not `null`.

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/stores/importStore.ts`, add to the `ImportState` interface after `pendingMapping`:

```ts
  /**
   * Account that granted AI-import consent during this app session. In-memory
   * only — the server holds the durable record. It exists so the consent
   * screen can tell "the user has not consented yet" from "we asked, the write
   * appeared to succeed, and the server still says no", which would otherwise
   * be an invisible loop.
   */
  aiConsentGrantedFor: string | null;
  setAiConsentGrantedFor: (accountId: string | null) => void;
```

and to the store body:

```ts
  aiConsentGrantedFor: null,
  setAiConsentGrantedFor: (aiConsentGrantedFor) => set({ aiConsentGrantedFor }),
```

Leave `reset()` exactly as it is — it must not clear consent, because it runs after every finished import.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest importStore`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/importStore.ts apps/mobile/src/stores/__tests__/importStore.test.ts
git commit -m "feat(import): track AI consent per account for the session"
```

---

### Task 3: The `bankImport.ai*` i18n keys

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`, `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`, `nl.ts`

**Interfaces:**
- Produces: 25 keys inside the existing `bankImport` object (which starts at `en.ts:866`).

Doing this before the screens means every later task references keys that already exist, and no task ends with English hardcoded "for now".

- [ ] **Step 1: Add the keys to `en.ts`**

Inside the existing `bankImport: { ... }` object, append:

```ts
    aiConsentTitle: 'Let AI read this statement?',
    aiConsentBody:
      "We don't recognise this bank's format. AI can work out which column is the date, the amount and the description — then your device does the rest.",
    aiConsentWhatLeaves: 'What gets sent',
    aiConsentWhatLeavesCsv: 'The header row and up to 10 example rows from your file.',
    aiConsentWhatLeavesPdf: 'The first 20 lines of text from your statement.',
    aiConsentOnce: 'Asked once per account. You can still map the columns yourself.',
    aiConsentAccept: 'Use AI',
    aiConsentDecline: "I'll map it myself",
    aiConsentFailed: 'Could not save your choice. Please try again.',
    aiInferredBy: 'Columns matched by AI',
    aiInferredEdit: 'Wrong? Tap to fix',
    aiCurrencyAssumed: 'This file has no currency column, so every row was read as {{currency}}. Check before importing.',
    aiWarningNoBalance: "We couldn't verify that every transaction was found — this statement has no closing balance to check against. Please review the list.",
    aiWarningMismatch: "The transactions we found don't add up to this statement's closing balance. Some rows may be missing.",
    aiWarningTruncated: 'This statement was too long to read in full — {{count}} page(s) were not processed.',
    aiPdfPaywall: 'Reading PDF statements with AI',
    aiBankGuess: 'Looks like: {{bank}}',
    aiCurrencyFix: 'Change currency',
    aiRoleDate: 'Date',
    aiRoleAmount: 'Amount',
    aiRoleDebit: 'Debit',
    aiRoleCredit: 'Credit',
    aiRoleDescription: 'Description',
    aiRoleCurrency: 'Currency',
    aiRoleCounterparty: 'Payee',
```

The seven `aiRole*` labels are deliberately **not** the existing `mapperDate` / `mapperCurrency` keys. Those read "Date column" and "Currency column (optional)", which is right above a picker and far too long inside a chip that already reads `<role> → <column>`.

- [ ] **Step 2: Translate into the other 8 locales**

Add the same 25 keys to `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`, `nl.ts`, in the same position inside each file's `bankImport` object.

Two rules for the copy, in every language:
- `aiWarningNoBalance` and `aiWarningMismatch` describe a **check to perform**, not a failure. Do not translate them as errors.
- `aiCurrencyAssumed` must keep the `{{currency}}` placeholder and `aiWarningTruncated` the `{{count}}` placeholder; `aiBankGuess` keeps `{{bank}}`.

- [ ] **Step 3: Verify every locale has all 25**

Run:

```bash
cd apps/mobile && for f in src/i18n/locales/*.ts; do echo -n "$f "; grep -cE "aiConsentTitle|aiConsentBody|aiConsentWhatLeaves:|aiConsentWhatLeavesCsv|aiConsentWhatLeavesPdf|aiConsentOnce|aiConsentAccept|aiConsentDecline|aiConsentFailed|aiInferredBy|aiInferredEdit|aiCurrencyAssumed|aiCurrencyFix|aiWarningNoBalance|aiWarningMismatch|aiWarningTruncated|aiPdfPaywall|aiBankGuess|aiRole(Date|Amount|Debit|Credit|Description|Currency|Counterparty)" "$f"; done
```

Expected: `25` for each of the nine files. (`aiConsentWhatLeaves:` carries the colon so it does not also match the two `…Csv`/`…Pdf` keys.)

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS — the locale files are typed against `en.ts`, so a missing key in any locale fails here.

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(import): bankImport.ai* strings in all 9 locales"
```

---

### Task 4: The consent screen

**Files:**
- Create: `apps/mobile/app/settings/import/ai-consent.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/settings/import/preview.tsx`

**Interfaces:**
- Consumes: `api.grantAiImportConsent()` (Task 1), `useImportStore.setAiConsentGrantedFor` (Task 2), the `bankImport.aiConsent*` keys (Task 3).
- Produces: route `/settings/import/ai-consent`.

- [ ] **Step 1: Route `needs_ai_consent` out of the preview screen**

In `preview.tsx`, immediately **after** the `if (preview.status === 'needs_picker')` block and **before** the `needs_mapping` block, add:

```tsx
  if (preview.status === 'needs_ai_consent') {
    router.replace('/settings/import/ai-consent');
    return null;
  }
```

Placing it before `needs_mapping` mirrors how that branch already redirects. Without this the status falls through to the `parsed` branch and renders `preview.rows ?? []` — an empty list with an Import button, which is the regression this whole plan exists to prevent.

- [ ] **Step 2: Register the header**

In `apps/mobile/app/_layout.tsx`, beside the other `settings/import/*` screens, add:

```tsx
        <Stack.Screen
          name="settings/import/ai-consent"
          options={{ title: i18n.t('bankImport.aiConsentTitle'), headerShown: true }}
        />
```

Match the exact prop shape the neighbouring `settings/import/*` entries use in this file — if they take their title through a different helper, follow that instead. A new screen without a header is a recurring mistake in this codebase.

- [ ] **Step 3: Write the screen**

Create `apps/mobile/app/settings/import/ai-consent.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useImportStore } from '@/stores/importStore';
import { useAccountStore } from '@/stores/accountStore';

export default function AiConsentScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const preview = useImportStore((s) => s.previewData);
  const file = useImportStore((s) => s.fileAsset);
  const setPreview = useImportStore((s) => s.setPreview);
  const setConsent = useImportStore((s) => s.setAiConsentGrantedFor);
  const accountId = useAccountStore((s) => s.currentAccountId);
  const [busy, setBusy] = useState(false);

  // The PDF path sends extracted lines rather than header cells, and sends no
  // fingerprint — that is how we tell the two apart for the disclosure copy.
  const isPdf = !preview?.headerFingerprint;

  const accept = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await api.grantAiImportConsent();
      if (accountId) setConsent(accountId);
      const res = await api.importBankPreview(file);
      setPreview(res);
      router.replace('/settings/import/preview');
    } catch (err) {
      showAlert(
        t('bankImport.aiConsentFailed'),
        err instanceof Error ? err.message : String(err),
      );
      setBusy(false);
    }
  };

  const decline = () => router.replace('/settings/import/mapper');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="sparkles-outline" size={40} color={theme.colors.primary} />
        <Text style={styles.body}>{t('bankImport.aiConsentBody')}</Text>

        <Text style={styles.sectionTitle}>{t('bankImport.aiConsentWhatLeaves')}</Text>
        <Text style={styles.detail}>
          {isPdf ? t('bankImport.aiConsentWhatLeavesPdf') : t('bankImport.aiConsentWhatLeavesCsv')}
        </Text>

        <Text style={styles.footnote}>{t('bankImport.aiConsentOnce')}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={accept}
          disabled={busy}
          activeOpacity={0.7}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('bankImport.aiConsentAccept')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={decline} disabled={busy} activeOpacity={0.7}>
          <Text style={styles.secondaryButtonText}>{t('bankImport.aiConsentDecline')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
```

Add a `createStyles(theme: Theme)` block at the bottom of the file following the exact convention used by `request-bank.tsx` in the same folder — same `container`, `content`, `primaryButton`, `secondaryButton` shapes and the same spacing scale. Do not invent a new visual language for one screen.

- [ ] **Step 4: Verify by hand**

There is no component test here — this codebase has no renderer dependency for RN components (see the `ShareImageCard` note in CLAUDE.md), and the pure logic in this screen is one boolean. Verify by running the app and confirming: the screen appears for an unrecognised CSV, "Use AI" re-requests the preview, and "I'll map it myself" opens the mapper.

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/settings/import/ai-consent.tsx apps/mobile/app/_layout.tsx apps/mobile/app/settings/import/preview.tsx
git commit -m "feat(import): AI consent screen and needs_ai_consent routing"
```

---

### Task 5: The inferred-mapping chip row

**Files:**
- Create: `apps/mobile/src/components/import/AiMappingChips.tsx`
- Create: `apps/mobile/src/components/import/__tests__/aiMappingChips.test.ts`
- Modify: `apps/mobile/app/settings/import/preview.tsx`
- Modify: `apps/mobile/app/settings/import/mapper.tsx`

**Interfaces:**
- Consumes: `BankImportPreviewResponse.aiMapping`, `aiBankLabel` (plan 1).
- Produces: `describeMapping(mapping: ColumnMapping): Array<{ role: MappingRole; column: string }>` — pure, exported from the component file for testing; `MappingRole = 'date' | 'amount' | 'debit' | 'credit' | 'description' | 'currency' | 'counterparty'`.
- Produces: default-exported `AiMappingChips` component taking `{ mapping, bankLabel, onEdit }`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/import/__tests__/aiMappingChips.test.ts`:

```ts
import { describeMapping } from '../AiMappingChips';

describe('describeMapping', () => {
  it('lists a single-amount mapping in a stable order', () => {
    expect(
      describeMapping({ date: 'Data', amount: 'Kwota', description: 'Opis' }),
    ).toEqual([
      { role: 'date', column: 'Data' },
      { role: 'amount', column: 'Kwota' },
      { role: 'description', column: 'Opis' },
    ]);
  });

  it('splits a debit/credit mapping into two entries', () => {
    const out = describeMapping({
      date: 'Data',
      amount: { debit: 'Winien', credit: 'Ma' },
      description: 'Opis',
    });
    expect(out).toContainEqual({ role: 'debit', column: 'Winien' });
    expect(out).toContainEqual({ role: 'credit', column: 'Ma' });
    expect(out.some((e) => e.role === 'amount')).toBe(false);
  });

  it('includes the optional columns only when present', () => {
    const withOptional = describeMapping({
      date: 'Data', amount: 'Kwota', description: 'Opis',
      currency: 'Waluta', counterparty: 'Kontrahent',
    });
    expect(withOptional).toContainEqual({ role: 'currency', column: 'Waluta' });
    expect(withOptional).toContainEqual({ role: 'counterparty', column: 'Kontrahent' });

    const without = describeMapping({ date: 'Data', amount: 'Kwota', description: 'Opis' });
    expect(without.some((e) => e.role === 'currency')).toBe(false);
    expect(without.some((e) => e.role === 'counterparty')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest aiMappingChips`
Expected: FAIL — `Cannot find module '../AiMappingChips'`

- [ ] **Step 3: Write the component**

Create `apps/mobile/src/components/import/AiMappingChips.tsx` exporting the pure helper first:

```tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ColumnMapping } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export type MappingRole =
  | 'date' | 'amount' | 'debit' | 'credit' | 'description' | 'currency' | 'counterparty';

export interface MappingEntry {
  role: MappingRole;
  column: string;
}

/**
 * Flatten a ColumnMapping into display order. `amount` is either one column or
 * a debit/credit pair, never both, so the pair replaces it rather than joining
 * it. Optional columns appear only when the file actually had them — an absent
 * currency column is meaningful (see `currencyAssumed`) and must not be shown
 * as an empty chip.
 */
export function describeMapping(mapping: ColumnMapping): MappingEntry[] {
  const entries: MappingEntry[] = [{ role: 'date', column: mapping.date }];

  if (typeof mapping.amount === 'string') {
    entries.push({ role: 'amount', column: mapping.amount });
  } else {
    entries.push({ role: 'debit', column: mapping.amount.debit });
    entries.push({ role: 'credit', column: mapping.amount.credit });
  }

  entries.push({ role: 'description', column: mapping.description });
  if (mapping.currency) entries.push({ role: 'currency', column: mapping.currency });
  if (mapping.counterparty) entries.push({ role: 'counterparty', column: mapping.counterparty });

  return entries;
}

const ROLE_KEY: Record<MappingRole, string> = {
  date: 'bankImport.aiRoleDate',
  amount: 'bankImport.aiRoleAmount',
  debit: 'bankImport.aiRoleDebit',
  credit: 'bankImport.aiRoleCredit',
  description: 'bankImport.aiRoleDescription',
  currency: 'bankImport.aiRoleCurrency',
  counterparty: 'bankImport.aiRoleCounterparty',
};

interface Props {
  mapping: ColumnMapping;
  bankLabel?: string;
  onEdit: () => void;
}

export default function AiMappingChips({ mapping, bankLabel, onEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <TouchableOpacity style={styles.card} onPress={onEdit} activeOpacity={0.7}>
      <View style={styles.header}>
        <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('bankImport.aiInferredBy')}</Text>
        <Text style={styles.editText}>{t('bankImport.aiInferredEdit')}</Text>
      </View>

      {bankLabel ? (
        <Text style={styles.bankGuess}>{t('bankImport.aiBankGuess', { bank: bankLabel })}</Text>
      ) : null}

      <View style={styles.chips}>
        {describeMapping(mapping).map((e) => (
          <View key={`${e.role}:${e.column}`} style={styles.chip}>
            <Text style={styles.chipText}>
              {t(ROLE_KEY[e.role])} → {e.column}
            </Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}
```

`ROLE_KEY` uses the short `aiRole*` labels from Task 3, not `mapper*` — the mapper's labels ("Date column", "Currency column (optional)") are sized for a form row, not a chip.

Add a `createStyles(theme: Theme)` block matching the card styling already used in `preview.tsx`: reuse its card background, border radius and horizontal padding so the chip row reads as part of the same list rather than a foreign element.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest aiMappingChips`
Expected: PASS (3 tests)

- [ ] **Step 5: Render it on the preview screen**

In `preview.tsx`, in the `parsed` branch, above the transaction list, add:

```tsx
      {preview.aiInferred && preview.aiMapping ? (
        <AiMappingChips
          mapping={preview.aiMapping}
          bankLabel={preview.aiBankLabel}
          onEdit={() => router.push('/settings/import/mapper')}
        />
      ) : null}
```

- [ ] **Step 6: Prefill the mapper from the inferred mapping**

In `mapper.tsx`, the column state currently initialises from positional guesses (`headers[0]`, `headers[1]`, `headers[2]`). Change each `useState` initialiser to prefer the inferred mapping when the preview carries one, falling back to today's guess:

```tsx
  const ai = preview?.aiMapping;
  const aiAmount = typeof ai?.amount === 'string' ? ai.amount : undefined;
  const aiDebit = typeof ai?.amount === 'object' ? ai.amount.debit : undefined;
  const aiCredit = typeof ai?.amount === 'object' ? ai.amount.credit : undefined;

  const [dateCol, setDateCol] = useState(ai?.date ?? headers[0] ?? '');
  const [splitDebitCredit, setSplitDebitCredit] = useState(!!aiDebit);
  const [amountCol, setAmountCol] = useState(aiAmount ?? headers[1] ?? '');
  const [debitCol, setDebitCol] = useState(aiDebit ?? '');
  const [creditCol, setCreditCol] = useState(aiCredit ?? '');
  const [descCol, setDescCol] = useState(ai?.description ?? headers[2] ?? '');
  const [currencyCol, setCurrencyCol] = useState(ai?.currency ?? '');
  const [counterpartyCol, setCounterpartyCol] = useState(ai?.counterparty ?? '');
```

Leave `delimiter`, `encoding`, `amountFormat` and `dateFormat` alone — the preview response does not carry them back, and changing their defaults would alter the manual path.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck` and `cd apps/mobile && npx jest import`
Expected: PASS

```bash
git add apps/mobile/src/components/import apps/mobile/app/settings/import/preview.tsx apps/mobile/app/settings/import/mapper.tsx
git commit -m "feat(import): show and edit the AI-inferred column mapping"
```

---

### Task 6: The currency and extraction notices, and the PDF paywall

**Files:**
- Create: `apps/mobile/src/components/import/ImportNoticeBanner.tsx`
- Create: `apps/mobile/src/features/import/__tests__/previewNotices.test.ts`
- Create: `apps/mobile/src/features/import/previewNotices.ts`
- Modify: `apps/mobile/app/settings/import/preview.tsx`
- Modify: `apps/mobile/app/settings/import/index.tsx`

**Interfaces:**
- Consumes: `currencyAssumed`, `extractionWarning`, `droppedPages` (plan 1); `isTierRequiredError` (Task 1); `useUpgradeStore` (existing).
- Produces: `buildPreviewNotices(preview): Notice[]` where `Notice = { key: string; params?: Record<string, string | number>; tone: 'info' | 'warning' }` — pure.
- Produces: `ImportNoticeBanner` taking `{ notice }`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/import/__tests__/previewNotices.test.ts`:

```ts
import { buildPreviewNotices } from '../previewNotices';

describe('buildPreviewNotices', () => {
  it('returns nothing for an ordinary parsed preview', () => {
    expect(buildPreviewNotices({ status: 'parsed', rows: [] })).toEqual([]);
  });

  it('reports an assumed currency as info, carrying the code', () => {
    expect(buildPreviewNotices({ status: 'parsed', currencyAssumed: 'EUR' })).toEqual([
      { key: 'bankImport.aiCurrencyAssumed', params: { currency: 'EUR' }, tone: 'info' },
    ]);
  });

  it('maps each extraction warning to its own string', () => {
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'no_balance' })[0].key)
      .toBe('bankImport.aiWarningNoBalance');
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'balance_mismatch' })[0].key)
      .toBe('bankImport.aiWarningMismatch');
  });

  it('carries the dropped page count on a truncated statement', () => {
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'pages_truncated', droppedPages: 5 }))
      .toEqual([
        { key: 'bankImport.aiWarningTruncated', params: { count: 5 }, tone: 'warning' },
      ]);
  });

  it('shows both notices when both apply, currency first', () => {
    const out = buildPreviewNotices({
      status: 'parsed', currencyAssumed: 'GBP', extractionWarning: 'no_balance',
    });
    expect(out.map((n) => n.key)).toEqual([
      'bankImport.aiCurrencyAssumed',
      'bankImport.aiWarningNoBalance',
    ]);
  });

  it('treats an unknown warning value as no notice rather than crashing', () => {
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'something_new' as never })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest previewNotices`
Expected: FAIL — `Cannot find module '../previewNotices'`

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/features/import/previewNotices.ts`:

```ts
import type { BankImportPreviewResponse } from '@budget/shared-types';

export interface Notice {
  key: string;
  params?: Record<string, string | number>;
  tone: 'info' | 'warning';
}

const WARNING_KEY: Record<string, string> = {
  no_balance: 'bankImport.aiWarningNoBalance',
  balance_mismatch: 'bankImport.aiWarningMismatch',
  pages_truncated: 'bankImport.aiWarningTruncated',
};

/**
 * Everything the user must check before importing, in the order it should be
 * read. These are prompts to review, never errors — `no_balance` in particular
 * fires whenever a statement simply prints no closing balance, which is common.
 * An unrecognised warning value yields no notice rather than an empty banner,
 * so a future server-side addition degrades quietly instead of rendering a
 * blank box.
 */
export function buildPreviewNotices(preview: Partial<BankImportPreviewResponse>): Notice[] {
  const notices: Notice[] = [];

  if (preview.currencyAssumed) {
    notices.push({
      key: 'bankImport.aiCurrencyAssumed',
      params: { currency: preview.currencyAssumed },
      tone: 'info',
    });
  }

  const warningKey = preview.extractionWarning ? WARNING_KEY[preview.extractionWarning] : undefined;
  if (warningKey) {
    notices.push({
      key: warningKey,
      ...(preview.extractionWarning === 'pages_truncated'
        ? { params: { count: preview.droppedPages ?? 0 } }
        : {}),
      tone: 'warning',
    });
  }

  return notices;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest previewNotices`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the banner**

Create `apps/mobile/src/components/import/ImportNoticeBanner.tsx`:

```tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Notice } from '@/features/import/previewNotices';

interface Props {
  notice: Notice;
  /** Rendered as a trailing action; used by the assumed-currency notice. */
  actionLabel?: string;
  onAction?: () => void;
}

export default function ImportNoticeBanner({ notice, actionLabel, onAction }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const isWarning = notice.tone === 'warning';
  const tint = isWarning ? theme.colors.warning : theme.colors.textSecondary;

  return (
    <View style={[styles.banner, isWarning && styles.bannerWarning]}>
      <Ionicons
        name={isWarning ? 'warning-outline' : 'information-circle-outline'}
        size={18}
        color={tint}
      />
      <View style={styles.textWrap}>
        <Text style={styles.text}>{t(notice.key, notice.params)}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
            <Text style={styles.action}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
```

Add `createStyles(theme: Theme)` below it. `banner` is a `flexDirection: 'row'` card using the same surface/radius/padding as `preview.tsx`'s existing cards; `bannerWarning` only changes the border or background tint. Check `src/theme`'s colour tokens before using `theme.colors.warning` — if this theme names it differently, use the real token rather than adding one.

- [ ] **Step 6: Render the notices, with the currency correctable**

The spec requires the assumed currency to be **correctable**, not merely visible. That is cheap here: the commit payload is the `rows` array the client already holds, and each row carries its own `currencyCode` — so a correction is a local rewrite before commit, with no new endpoint.

In `preview.tsx`'s `parsed` branch, add state and the rendering, above `AiMappingChips`:

```tsx
  const [currencyOverride, setCurrencyOverride] = useState<string | null>(null);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const effectiveRows = useMemo(
    () => (currencyOverride ? rows.map((r) => ({ ...r, currencyCode: currencyOverride })) : rows),
    [rows, currencyOverride],
  );
```

```tsx
      {buildPreviewNotices({ ...preview, currencyAssumed: currencyOverride ?? preview.currencyAssumed })
        .map((n) =>
          n.key === 'bankImport.aiCurrencyAssumed' ? (
            <ImportNoticeBanner
              key={n.key}
              notice={n}
              actionLabel={t('bankImport.aiCurrencyFix')}
              onAction={() => setShowCurrencyPicker(true)}
            />
          ) : (
            <ImportNoticeBanner key={n.key} notice={n} />
          ),
        )}
```

Then render a picker modal over `SUPPORTED_CURRENCIES` (imported from `@budget/shared-utils`, which mobile may import at runtime — only `apps/api` may not), following the same bottom-sheet shape `expense/new.tsx` already uses for its currency list. Selecting a code sets `currencyOverride` and closes the sheet; the banner then reports the chosen currency, because it is fed `currencyOverride ?? preview.currencyAssumed`.

**Finally, use `effectiveRows` everywhere `rows` was used** — the list rendering, the `selected` filter, and the `rowsToCommit` the Import button sends. A correction the user makes and the commit ignores is worse than no correction at all.

- [ ] **Step 7: Wire the PDF paywall**

In `apps/mobile/app/settings/import/index.tsx`, the file-picking flow calls `api.importBankPreview`. In its `catch`, before the existing generic alert, add:

```tsx
      if (isTierRequiredError(err)) {
        useUpgradeStore.getState().show(t('bankImport.aiPdfPaywall'), err.requiredTier ?? 'pro');
        return;
      }
```

Apply the same guard to every other `catch` around an `importBankPreview` call — `preview.tsx`'s bank-picker retry and `ai-consent.tsx`'s accept handler both call it, and a free user reaching the Pro gate through either must get the paywall rather than a raw error string. Import `isTierRequiredError` from `@/services/importErrors` and `useUpgradeStore` from `@/stores/upgradeStore`.

- [ ] **Step 8: Typecheck, test and commit**

Run: `npm run typecheck` and `cd apps/mobile && npx jest import`
Expected: PASS

```bash
git add apps/mobile/src/features/import apps/mobile/src/components/import/ImportNoticeBanner.tsx apps/mobile/app/settings/import
git commit -m "feat(import): assumed-currency and extraction notices, PDF paywall"
```

---

### Task 7: Offer spreadsheets in the file picker

**Files:**
- Modify: `apps/mobile/app/settings/import/index.tsx`

Plan 1 accepts XLSX uploads, and `user_docs/*/27-bank-import.md` now says so, but the picker's `type` list names only CSV and PDF. It happens to work because the list ends with `'*/*'` — so this is about making a supported format discoverable rather than fixing a break.

- [ ] **Step 1: Add the spreadsheet MIME types**

At `index.tsx:92`, extend the list:

```tsx
      picked = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
      });
```

- [ ] **Step 2: Confirm the upload type label still routes correctly**

At `index.tsx:114` the asset is uploaded as `type: isPdf ? 'application/pdf' : 'text/csv'`. Leave it: the server sniffs the buffer for the XLSX zip magic and never trusts this label. Add a one-line comment saying so, so the next reader does not "fix" it.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS

```bash
git add apps/mobile/app/settings/import/index.tsx
git commit -m "feat(import): offer spreadsheet files in the statement picker"
```

---

### Task 8: Documentation and the release gate

**Files:**
- Modify: `CLAUDE.md`
- Modify: `user_docs/<lang>/27-bank-import.md` ×9
- Regenerate: `apps/mobile/src/help/content.ts`

- [ ] **Step 1: Update CLAUDE.md**

In the **AI universal statement import** entry, replace the closing sentence — which currently says mobile is plan 2 and a hard prerequisite for deploying — with the mobile surface as built: the `needs_ai_consent` screen, the three-call consent flow, `AiMappingChips` + mapper prefill, `buildPreviewNotices`, the `isTierRequiredError` paywall path, and the 17 `bankImport.ai*` keys. State plainly that the deployment-order constraint is now discharged.

- [ ] **Step 2: Document the feature for users, in all 9 locales**

`user_docs/<lang>/27-bank-import.md` currently documents supported banks and the manual mapper. Add a section covering: what happens when the app does not recognise your bank, what the consent screen asks and what is sent, that the matched columns are shown and can be corrected, what the "check before importing" notices mean, and that PDF reading requires Pro. Keep it to the reading level of the surrounding text, and do not promise accuracy the feature cannot deliver.

- [ ] **Step 3: Regenerate the in-app help**

Run from the repo root: `npm run generate:help`
Expected: `Generated 369 sections across 9 languages`

- [ ] **Step 4: Regenerate the public web help**

Run: `python docs/marketing/help/build_help.py`, then re-run the landing build with the production environment so the apex sitemap merges the changed pages:

```bash
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
```

`docs/marketing` is gitignored, so the generated pages need `git add -f`. This step was deliberately deferred during plan 1 because it rewrites ~500 committed HTML files and the branch was being held; do it now, at ship time.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git add -f docs/marketing/help/site docs/marketing/landing/site
git commit -m "docs: document AI statement import for users and regenerate help"
```

---

## Done criteria

- An unrecognised CSV shows the consent screen, and accepting it returns a parsed preview with the inferred columns shown as chips.
- Declining opens the manual mapper, prefilled with whatever the model had inferred if it ran.
- A statement with no currency column shows which currency was assumed **and lets the user change it**, before importing — and the change reaches the commit payload.
- A PDF extraction always shows either a reconciled result or a notice saying what could not be confirmed.
- A free account attempting a PDF sees the paywall, not an error string.
- A recognised bank's statement imports exactly as it did before this plan.
- `cd apps/mobile && npx jest` is green; `npm run typecheck` is green.

## Deferred

- **Per-row currency correction.** Task 6 lets the user correct the currency for the whole file, which is the case `currencyAssumed` describes — the statement had no currency column at all, so every row shares one currency by construction. A genuinely mixed-currency file has a currency column and never triggers the notice.
- **A "why was this column chosen" affordance.** The chip row shows the result, not the reasoning.
- The `parser.parse()` delimiter gap recorded in ABA-390's follow-ups is server-side and unaffected by this plan.
