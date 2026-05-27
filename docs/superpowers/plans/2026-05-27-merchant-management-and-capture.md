# Merchant Management + Capture Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users manage their merchants (rename / merge / delete) from a mobile Settings screen, and make receipt-OCR and voice capture reuse existing merchants instead of spawning variants.

**Architecture:** Mobile-only, no API/entity/schema changes. Builds on the `merchant` free-text field (ABA-140). Bulk operations run over the offline-first expense store and sync via the existing `syncPendingExpenses` (E2EE-safe). Capture reconciliation is "suggest + confirm": editable `MerchantInput` pre-filled and exact-match-snapped to existing merchants.

**Tech Stack:** Expo/React Native, Zustand, SQLite (raw `executeSql`), Jest (jest-expo), i18n (8 locales).

**Specs:** `docs/superpowers/specs/2026-05-27-merchant-management-design.md` (A), `docs/superpowers/specs/2026-05-27-merchant-capture-reconciliation-design.md` (B).

**Conventions:** Branch `development`. Commit per task. Do NOT push. Do NOT bump app version. New screens MUST have a header (registered in `app/_layout.tsx`). Update all 8 locales together.

---

## File structure

- `apps/mobile/src/utils/merchant.ts` — add `getMerchantCounts` (A) + `resolveExistingMerchant` (B); tests in `__tests__/merchant.test.ts`.
- `apps/mobile/src/db/expenseRepository.ts` — add `bulkRenameMerchant` (A).
- `apps/mobile/src/stores/expenseStore.ts` — add `getMerchantCounts` selector + `renameMerchant` action (A).
- `apps/mobile/app/settings/merchants.tsx` — NEW management screen (A).
- `apps/mobile/app/_layout.tsx` — register the new screen's header (A).
- `apps/mobile/app/settings/index.tsx` — Settings-hub link (A).
- `apps/mobile/app/expense/receipt.tsx` — editable merchant + reconcile (B).
- `apps/mobile/app/expense/voice.tsx` — `MerchantInput` + reconcile + save to `merchant` not `notes` (B).
- `apps/mobile/src/i18n/locales/*.ts` — new keys (A); B reuses existing keys.

---

# Sub-feature A — Merchant management screen

### Task A1: `getMerchantCounts` utility (TDD)

**Files:**
- Modify: `apps/mobile/src/utils/merchant.ts`
- Test: `apps/mobile/src/utils/__tests__/merchant.test.ts`

- [ ] **Step 1: Add the failing test** (append to the existing describe-block file):

```ts
import { getMerchantCounts } from '../merchant';

describe('getMerchantCounts', () => {
  const m = (merchant?: string, isDeleted = false) =>
    ({ merchant, isDeleted } as unknown as import('@budget/shared-types').Expense);
  it('counts by exact value, skips deleted/blank, sorts by count desc then name', () => {
    const expenses = [
      m('Lidl'), m('Lidl'), m('Biedronka'), m('Biedronka'), m('Biedronka'),
      m('  '), m(undefined), m('Lidl', true),
    ];
    expect(getMerchantCounts(expenses)).toEqual([
      { merchant: 'Biedronka', count: 3 },
      { merchant: 'Lidl', count: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts -t getMerchantCounts`
Expected: FAIL — `getMerchantCounts is not a function`.

- [ ] **Step 3: Implement** (add to `apps/mobile/src/utils/merchant.ts`):

```ts
/**
 * Distinct merchants with their expense counts (exact, case-sensitive, trimmed value).
 * Variants stay separate on purpose — the management screen exists to collapse them.
 * Skips soft-deleted rows and blank merchants. Sorted by count desc, then name.
 */
export function getMerchantCounts(expenses: Expense[]): { merchant: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of expenses) {
    if (e.isDeleted) continue;
    const name = e.merchant?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([merchant, count]) => ({ merchant, count }))
    .sort((a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant));
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts`
Expected: PASS (existing `getDistinctMerchants` tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/merchant.ts apps/mobile/src/utils/__tests__/merchant.test.ts
git commit -m "feat(mobile): add getMerchantCounts utility with tests"
```

---

### Task A2: `bulkRenameMerchant` repository helper

**Files:**
- Modify: `apps/mobile/src/db/expenseRepository.ts`

- [ ] **Step 1: Add the helper** (append near the other expense write helpers):

```ts
/**
 * Bulk set merchant for all of an account's non-deleted expenses whose merchant
 * exactly equals `from`. `to = null` clears it. Marks rows pending for sync.
 */
export async function bulkRenameMerchant(
  accountId: string,
  from: string,
  to: string | null,
): Promise<void> {
  await executeSql(
    `UPDATE expenses SET merchant = ?, updated_at = ?, sync_status = 'pending'
     WHERE account_id = ? AND merchant = ? AND is_deleted = 0`,
    [to, Date.now(), accountId, from],
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/db/expenseRepository.ts
git commit -m "feat(mobile): add bulkRenameMerchant repository helper"
```

---

### Task A3: store selector + `renameMerchant` action

**Files:**
- Modify: `apps/mobile/src/stores/expenseStore.ts`

- [ ] **Step 1: Import the helpers**

Add `bulkRenameMerchant` to the `@/db/expenseRepository` import, and extend the merchant util import:
```ts
import { getDistinctMerchants as computeDistinctMerchants, getMerchantCounts as computeMerchantCounts } from '@/utils/merchant';
```
(Add `bulkRenameMerchant` to whatever existing `from '@/db/expenseRepository'` import line lists `updateExpenseInDb`, `insertExpense`, etc.)

- [ ] **Step 2: Extend the `ExpenseState` interface**

Next to `getDistinctMerchants: () => string[];` add:
```ts
  getMerchantCounts: () => { merchant: string; count: number }[];
  renameMerchant: (from: string, to: string | null) => Promise<number>;
```

- [ ] **Step 3: Implement the selector + action**

Next to the `getDistinctMerchants` implementation add:
```ts
    getMerchantCounts: () => computeMerchantCounts(get().expenses),

    // Bulk rename/merge/delete a merchant across the account's expenses.
    // Renaming to an existing name merges; to = null clears. Reuses the offline
    // sync path (syncPendingExpenses re-encrypts for E2EE accounts).
    renameMerchant: async (from, to) => {
      if (to === from) return 0;
      const accountId = useAccountStore.getState().currentAccountId || '';
      const affected = get().expenses.filter((e) => !e.isDeleted && e.merchant === from);
      if (affected.length === 0) return 0;
      const now = new Date();
      set((state) => ({
        expenses: state.expenses.map((e) =>
          !e.isDeleted && e.merchant === from
            ? {
                ...e,
                merchant: to || undefined,
                updatedAt: now,
                syncStatus: e.syncStatus === 'synced' ? 'pending' : e.syncStatus,
              }
            : e
        ),
      }));
      try {
        await bulkRenameMerchant(accountId, from, to);
      } catch (e) {
        console.error('Failed to bulk-rename merchant in SQLite:', e);
      }
      get().syncPendingExpenses().catch((e) =>
        console.error('Failed to sync merchant rename:', e),
      );
      return affected.length;
    },
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/expenseStore.ts
git commit -m "feat(mobile): merchant counts selector + renameMerchant bulk action"
```

---

### Task A4: Merchants management screen + header + hub link

**Files:**
- Create: `apps/mobile/app/settings/merchants.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register header)
- Modify: `apps/mobile/app/settings/index.tsx` (hub link)

- [ ] **Step 1: Create the screen**

Create `apps/mobile/app/settings/merchants.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function MerchantsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const getMerchantCounts = useExpenseStore((s) => s.getMerchantCounts);
  const renameMerchant = useExpenseStore((s) => s.renameMerchant);

  const merchants = getMerchantCounts();

  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const openRename = (merchant: string) => {
    setEditing(merchant);
    setName(merchant);
  };

  const handleSaveRename = async () => {
    if (!editing) return;
    const next = name.trim();
    if (!next) {
      Alert.alert(t('common.error'), t('merchants.nameRequired'));
      return;
    }
    if (next === editing) {
      setEditing(null);
      return;
    }
    setSaving(true);
    const count = await renameMerchant(editing, next);
    setSaving(false);
    setEditing(null);
    Alert.alert('', t('merchants.renamed', { count }));
  };

  const handleDelete = (merchant: string, count: number) => {
    Alert.alert(
      t('merchants.delete'),
      t('merchants.deleteConfirm', { count }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('merchants.delete'),
          style: 'destructive',
          onPress: async () => {
            const n = await renameMerchant(merchant, null);
            Alert.alert('', t('merchants.deleted', { count: n }));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {merchants.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="storefront-outline" size={56} color={theme.colors.textDisabled} />
            <Text style={styles.emptyText}>{t('merchants.empty')}</Text>
          </View>
        ) : (
          merchants.map(({ merchant, count }) => (
            <View key={merchant} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{merchant}</Text>
                <Text style={styles.rowCount}>{t('merchants.expensesCount', { count })}</Text>
              </View>
              <TouchableOpacity onPress={() => openRename(merchant)} style={styles.rowBtn}>
                <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(merchant, count)} style={styles.rowBtn}>
                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('merchants.renameTitle')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('merchants.renamePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditing(null)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveRename} disabled={saving}>
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4] },
  empty: { alignItems: 'center' as const, paddingVertical: theme.spacing[10], gap: theme.spacing[3] },
  emptyText: { fontSize: 15, color: theme.colors.textTertiary },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textPrimary },
  rowCount: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
  rowBtn: { padding: theme.spacing[2] },
  modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' as const },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  modalTitle: { fontSize: 18, fontWeight: '600' as const, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3.5], paddingVertical: theme.spacing[2.5], fontSize: 16,
    color: theme.colors.textPrimary, marginBottom: theme.spacing[4],
  },
  modalActions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  modalCancel: {
    flex: 1, alignItems: 'center' as const, paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg, borderWidth: 2, borderColor: theme.colors.textDisabled,
  },
  modalCancelText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textSecondary },
  modalSave: {
    flex: 1, alignItems: 'center' as const, paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg, backgroundColor: theme.colors.primary,
  },
  modalSaveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
```

- [ ] **Step 2: Register the screen header** in `apps/mobile/app/_layout.tsx`

After the `settings/categories` `<Stack.Screen>` block (ends ~line 479), add:
```tsx
        <Stack.Screen
          name="settings/merchants"
          options={{
            headerShown: true,
            title: t('settingsNav.merchants'),
          }}
        />
```

- [ ] **Step 3: Add the Settings-hub link** in `apps/mobile/app/settings/index.tsx`

Immediately after the `settings/categories` item object (ends ~line 88), add:
```tsx
    {
      icon: 'storefront-outline',
      label: t('settingsNav.merchants'),
      description: t('settingsNav.merchantsDesc'),
      route: '/settings/merchants',
    },
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint app/settings/merchants.tsx app/settings/index.tsx app/_layout.tsx`
Expected: PASS (i18n keys land in Task A5; `t()` compiles regardless).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/settings/merchants.tsx apps/mobile/app/_layout.tsx apps/mobile/app/settings/index.tsx
git commit -m "feat(mobile): merchant management screen (rename/merge/delete)"
```

---

### Task A5: i18n for management (8 locales)

**Files:** `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts`

REQUIRED SUB-SKILL: `i18n-add-strings`.

- [ ] **Step 1: Add keys**

Add a `merchants` namespace and two `settingsNav` keys to each locale. EN values:
```ts
settingsNav: { /* ...existing... */
  merchants: 'Merchants',
  merchantsDesc: 'Rename, merge, or remove merchants',
},
merchants: {
  title: 'Merchants',
  rename: 'Rename',
  delete: 'Delete',
  renameTitle: 'Rename merchant',
  renamePlaceholder: 'Merchant name',
  nameRequired: 'Enter a merchant name',
  expensesCount: '{{count}} expenses',
  deleteConfirm: 'Clear merchant from {{count}} expenses?',
  renamed: 'Updated {{count}} expenses',
  deleted: 'Cleared {{count}} expenses',
  empty: 'No merchants yet',
},
```
Translate per locale (de/es/fr/pl/ru/ua/be). Use the same translations style as existing keys; `{{count}}` placeholders stay literal.

- [ ] **Step 2: Verify parity + typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json` and confirm `grep -l "renameTitle" src/i18n/locales/*.ts | wc -l` → 8.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): merchant management i18n keys (8 locales)"
```

---

# Sub-feature B — Capture reconciliation (OCR + voice)

### Task B1: `resolveExistingMerchant` utility (TDD)

**Files:**
- Modify: `apps/mobile/src/utils/merchant.ts`
- Test: `apps/mobile/src/utils/__tests__/merchant.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
import { resolveExistingMerchant } from '../merchant';

describe('resolveExistingMerchant', () => {
  it('snaps to existing canonical on case/space-insensitive exact match', () => {
    expect(resolveExistingMerchant('zabka zf351 ', ['Zabka ZF351', 'Lidl'])).toBe('Zabka ZF351');
  });
  it('returns trimmed input when no match', () => {
    expect(resolveExistingMerchant('  New Shop ', ['Lidl'])).toBe('New Shop');
  });
  it('returns empty string for blank/nullish', () => {
    expect(resolveExistingMerchant('   ', ['Lidl'])).toBe('');
    expect(resolveExistingMerchant(null, ['Lidl'])).toBe('');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts -t resolveExistingMerchant`
Expected: FAIL — `resolveExistingMerchant is not a function`.

- [ ] **Step 3: Implement** (add to `apps/mobile/src/utils/merchant.ts`):

```ts
/**
 * If `input` matches an existing merchant case-insensitively (trimmed), return that
 * existing canonical value; otherwise the trimmed input. '' for blank/nullish input.
 * Used at capture time (OCR/voice) so new expenses reuse existing merchant names.
 */
export function resolveExistingMerchant(input: string | null | undefined, existing: string[]): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const match = existing.find((m) => m.trim().toLowerCase() === lower);
  return match ?? trimmed;
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts`
Expected: PASS (all merchant util tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/merchant.ts apps/mobile/src/utils/__tests__/merchant.test.ts
git commit -m "feat(mobile): add resolveExistingMerchant capture-reconciliation utility"
```

---

### Task B2: OCR receipt — editable merchant + reconcile

**Files:**
- Modify: `apps/mobile/app/expense/receipt.tsx`

- [ ] **Step 1: Imports + store selector**

Add imports:
```ts
import { MerchantInput } from '@/components/MerchantInput';
import { resolveExistingMerchant } from '@/utils/merchant';
```
Extend the `useExpenseStore` usage to also get distinct merchants:
```ts
  const { addExpense } = useExpenseStore();
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);
```

- [ ] **Step 2: Add merchant state + pre-fill on scan**

Add state near the other `useState`s (after `userPrompt`):
```ts
  const [merchant, setMerchant] = useState('');
```
In the `scannedReceipt` effect (currently sets `showConfirm`), add the reconciled pre-fill:
```ts
  useEffect(() => {
    if (scannedReceipt) {
      setShowConfirm(true);
      setMerchant(resolveExistingMerchant(scannedReceipt.merchant, getDistinctMerchants()));
      useSubscriptionStore.getState().loadUsage();
    }
  }, [scannedReceipt]);
```

- [ ] **Step 3: Replace the read-only merchant display with an editable input**

Replace the existing block (~lines 294-298):
```tsx
              {scannedReceipt?.merchant && (
                <View ...>
                  <Text style={styles.expenseLabel}>{t('receipt.merchant')}</Text>
                  <Text style={styles.expenseValue}>{scannedReceipt.merchant}</Text>
                </View>
              )}
```
with:
```tsx
              <View style={styles.merchantField}>
                <MerchantInput value={merchant} onChangeText={setMerchant} />
              </View>
```
Add a style `merchantField: { marginTop: theme.spacing[2] }` to `createStyles`.

- [ ] **Step 4: Save the edited merchant**

In `handleConfirmExpense`'s `addExpense({ ... })` call, change:
```ts
        merchant: scannedReceipt.merchant ?? undefined,
```
to:
```ts
        merchant: merchant.trim() || undefined,
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint app/expense/receipt.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/expense/receipt.tsx
git commit -m "feat(mobile): editable, reconciled merchant on receipt OCR confirm"
```

---

### Task B3: Voice — MerchantInput + reconcile + save to `merchant`

**Files:**
- Modify: `apps/mobile/app/expense/voice.tsx`

- [ ] **Step 1: Imports + store selector**

Add:
```ts
import { MerchantInput } from '@/components/MerchantInput';
import { resolveExistingMerchant } from '@/utils/merchant';
```
Add the distinct-merchants selector next to the existing `useExpenseStore` usage:
```ts
  const { addExpense } = useExpenseStore();
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);
```

- [ ] **Step 2: Reconcile on parse**

In the `parsedExpense` effect, change (line ~72):
```ts
      setEditMerchant(parsedExpense.merchant || '');
```
to:
```ts
      setEditMerchant(resolveExistingMerchant(parsedExpense.merchant, getDistinctMerchants()));
```

- [ ] **Step 3: Replace the plain merchant TextInput with MerchantInput**

Replace the block (~lines 264-274):
```tsx
              {/* Merchant */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('voice.merchant')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={editMerchant}
                  onChangeText={setEditMerchant}
                  placeholder={t('voice.merchant')}
                  placeholderTextColor={theme.colors.textTertiary}
                />
              </View>
```
with:
```tsx
              {/* Merchant */}
              <View style={styles.fieldGroup}>
                <MerchantInput value={editMerchant} onChangeText={setEditMerchant} />
              </View>
```

- [ ] **Step 4: Save merchant to the real field (not notes)**

In the `addExpense({ ... })` call (~line 115-127), change:
```ts
        notes: editMerchant.trim() || undefined,
```
to:
```ts
        merchant: editMerchant.trim() || undefined,
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint app/expense/voice.tsx`
Expected: PASS. (If `TextInput`/`theme` become unused after the swap, remove the now-unused import/var to satisfy lint.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/expense/voice.tsx
git commit -m "feat(mobile): voice expense reconciles merchant and saves it to merchant field"
```

---

### Task FINAL: verify + docs + ABA issue

**Files:** `CLAUDE.md`, `user_docs/{8}/03-expenses-and-income.md`, regenerate `apps/mobile/src/help/content.ts`.

- [ ] **Step 1: Full verify**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx jest src/utils/__tests__/merchant.test.ts`
Expected: tsc PASS; merchant tests PASS.

- [ ] **Step 2: CLAUDE.md**

Add a concise note: Settings → Merchants screen (`app/settings/merchants.tsx`) with `expenseStore.renameMerchant(from, to|null)` (rename auto-merges, `null` clears) backed by `bulkRenameMerchant` + `syncPendingExpenses`; OCR/voice capture reconcile via `resolveExistingMerchant` + `MerchantInput`; voice now stores merchant in `merchant` (was `notes`).

- [ ] **Step 3: user_docs (8 locales)**

In each `user_docs/<lang>/03-expenses-and-income.md`, extend the Merchant section: merchants can be renamed/merged/deleted in Settings → Merchants, and receipt/voice capture reuses existing merchants. Translate per locale. Then run `npm run generate:help` from repo root.

- [ ] **Step 4: ABA issue**

`gh issue list --limit 1 --state all --json number,title` → N+1. Create `ABA-{N}: Merchant management screen + OCR/voice capture reconciliation` (English; Problem / Implementation / Out-of-scope).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git commit -m "docs: merchant management + capture reconciliation (CLAUDE.md + user_docs)"
```

---

## Self-Review

**Spec coverage (A):** management screen ✔ (A4), rename/merge via `renameMerchant` ✔ (A3, rename-to-existing merges by equal string), delete=null ✔ (A3/A4), counts list ✔ (A1/A3/A4), `syncPendingExpenses` E2EE path ✔ (A3), hub link + header ✔ (A4), i18n ✔ (A5), no API/entity ✔.
**Spec coverage (B):** `resolveExistingMerchant` ✔ (B1), OCR editable + reconcile + save ✔ (B2), voice MerchantInput + reconcile + save to `merchant` not `notes` ✔ (B3), suggest+confirm via MerchantInput ✔, no AI change ✔.

**Placeholder scan:** none — every code step has concrete code; i18n step lists exact EN values + which locales to translate.

**Type/name consistency:** `getMerchantCounts(): {merchant,count}[]` (util + store selector + screen), `renameMerchant(from, to|null): Promise<number>` (store + screen), `bulkRenameMerchant(accountId, from, to)` (repo + store), `resolveExistingMerchant(input, existing)` (util + receipt + voice), i18n `merchants.*` + `settingsNav.merchants`/`merchantsDesc` consistent across A4/A5.

**Risks for implementer:**
- A3: confirm `useAccountStore` and `syncPendingExpenses` are in scope inside the store (they are — used elsewhere in `expenseStore`).
- B2: the receipt confirm view is a `ScrollView`; `MerchantInput`'s horizontal suggestion strip nests fine. Ensure the field sits inside the existing scroll so the keyboard doesn't cover it.
- B3: after swapping to `MerchantInput`, delete any now-unused `TextInput`/`theme`/`styles.textInput`/`styles.fieldLabel` references only if they become unused (other fields may still use them — check before removing).
- Voice migration: past voice expenses keep their merchant in `notes` (not retro-migrated; out of scope per spec).
