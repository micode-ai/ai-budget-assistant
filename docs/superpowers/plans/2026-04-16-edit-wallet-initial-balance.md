# Edit Wallet Initial Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit the initial balance of an existing wallet currency (instead of only being able to set a new one or delete and re-create).

**Architecture:** Mobile-only UX change. Two new entry points (tap-on-card on `wallet/index.tsx`, pencil-in-row on `wallet/set-balance.tsx`) route to `/wallet/set-balance?editId=<id>`. The existing `set-balance` screen gets an edit mode that pre-fills the form, locks the currency chip, swaps the button to "Update", adds a "Cancel" button, and calls the already-wired `walletStore.updateInitialBalance(id, amount)` instead of `setInitialBalance`. i18n keys added across all 8 locales.

**Tech Stack:** React Native (Expo 54), Expo Router, Zustand (`walletStore`), `react-i18next` for i18n, Ionicons. No API, no Prisma, no shared-types, no SQLite schema changes.

**Spec:** `docs/superpowers/specs/2026-04-16-edit-wallet-initial-balance-design.md`

**Testing reality:** The mobile project has `jest-expo` configured but no unit tests for screen components. Following the project's convention, verification relies on `tsc --noEmit` and explicit manual verification on the Expo dev server (web preview is the fastest surface). Do NOT invent a new test scaffold for these screens.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/i18n/locales/en.ts` | modify | add `wallet.editInitialBalance`, `wallet.balanceUpdated`, `common.update` |
| `apps/mobile/src/i18n/locales/{de,es,fr,pl,ru,ua,be}.ts` | modify (×7) | same three keys, translated |
| `apps/mobile/app/wallet/set-balance.tsx` | modify | read `editId`, pre-fill form, branch title/button/save handler, lock currency, add Cancel button, add pencil icon in list rows |
| `apps/mobile/app/wallet/index.tsx` | modify | wrap balance cards in `TouchableOpacity` (when `canEdit`), add pencil icon affordance, navigate with `editId` param on tap |

No files created. No files deleted.

---

## Task 1: Add i18n keys (English source)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`

- [ ] **Step 1: Add `common.update`**

Edit the `common` block in `apps/mobile/src/i18n/locales/en.ts`. After line `edit: 'Edit',` (around line 6) insert:

```ts
    update: 'Update',
```

- [ ] **Step 2: Add two new wallet keys**

In the `wallet` block (around line 566-589), replace the line:

```ts
    balanceSaved: 'Balance set successfully',
```

with:

```ts
    balanceSaved: 'Balance set successfully',
    editInitialBalance: 'Edit Initial Balance',
    balanceUpdated: 'Balance updated successfully',
```

- [ ] **Step 3: Verify typecheck**

Run from `apps/mobile/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales/en.ts
git commit -m "feat(mobile): add i18n keys for wallet balance editing (en)"
```

---

## Task 2: Translate keys to the other 7 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`

For each locale, add `common.update` inside the `common` block (right after the existing `edit` key) and `wallet.editInitialBalance` + `wallet.balanceUpdated` inside the `wallet` block (right after `balanceSaved`).

- [ ] **Step 1: German (`de.ts`)**

`common.update`: `Aktualisieren`
`wallet.editInitialBalance`: `Anfangsguthaben bearbeiten`
`wallet.balanceUpdated`: `Guthaben erfolgreich aktualisiert`

- [ ] **Step 2: Spanish (`es.ts`)**

`common.update`: `Actualizar`
`wallet.editInitialBalance`: `Editar saldo inicial`
`wallet.balanceUpdated`: `Saldo actualizado correctamente`

- [ ] **Step 3: French (`fr.ts`)**

`common.update`: `Mettre à jour`
`wallet.editInitialBalance`: `Modifier le solde initial`
`wallet.balanceUpdated`: `Solde mis à jour avec succès`

- [ ] **Step 4: Polish (`pl.ts`)**

`common.update`: `Aktualizuj`
`wallet.editInitialBalance`: `Edytuj saldo początkowe`
`wallet.balanceUpdated`: `Saldo zaktualizowane pomyślnie`

- [ ] **Step 5: Russian (`ru.ts`)**

`common.update`: `Обновить`
`wallet.editInitialBalance`: `Редактировать начальный баланс`
`wallet.balanceUpdated`: `Баланс обновлён`

- [ ] **Step 6: Ukrainian (`ua.ts`)**

`common.update`: `Оновити`
`wallet.editInitialBalance`: `Редагувати початковий баланс`
`wallet.balanceUpdated`: `Баланс оновлено`

- [ ] **Step 7: Belarusian (`be.ts`)**

`common.update`: `Абнавіць`
`wallet.editInitialBalance`: `Рэдагаваць пачатковы баланс`
`wallet.balanceUpdated`: `Баланс абноўлены`

- [ ] **Step 8: Verify typecheck**

Run from `apps/mobile/`:

```bash
npm run typecheck
```

Expected: no errors. i18n files are type-checked against `en.ts` structure — any missing key across locales would surface here.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/i18n/locales/de.ts apps/mobile/src/i18n/locales/es.ts apps/mobile/src/i18n/locales/fr.ts apps/mobile/src/i18n/locales/pl.ts apps/mobile/src/i18n/locales/ru.ts apps/mobile/src/i18n/locales/ua.ts apps/mobile/src/i18n/locales/be.ts
git commit -m "feat(mobile): translate wallet balance editing strings (de/es/fr/pl/ru/ua/be)"
```

---

## Task 3: Add edit mode to `set-balance.tsx`

**Files:**
- Modify: `apps/mobile/app/wallet/set-balance.tsx`

Goal: when `?editId=<id>` is present in the URL, the screen pre-fills the form with that balance, shows the "Edit initial balance" title, only renders the balance's currency chip (non-interactive), swaps the primary button to "Update", adds a "Cancel" secondary button, and calls `updateInitialBalance` on save. When not present, behaviour is unchanged.

- [ ] **Step 1: Update imports**

Replace the first import block (currently line 1-9) with:

```tsx
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useWalletStore } from '@/stores/walletStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
```

- [ ] **Step 2: Read `editId` and derive editing balance**

Replace the start of the component (currently line 13-20) with:

```tsx
export default function SetBalanceScreen() {
  const { t } = useTranslation();
  const { walletBalances, walletSummary, setInitialBalance, updateInitialBalance, removeBalance } = useWalletStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editingBalance = useMemo(
    () => (editId ? walletBalances.find((b) => b.id === editId && !b.isDeleted) : undefined),
    [editId, walletBalances],
  );
  const isEditMode = !!editingBalance;

  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('USD');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (editingBalance) {
      setSelectedCurrency(editingBalance.currencyCode as Currency);
      setAmount(editingBalance.initialAmount.toString());
    }
  }, [editingBalance]);
```

Note: If `editId` is present but `editingBalance` is not found (stale id or store not loaded), `isEditMode` is `false` and the screen renders in create mode — intentional fallback per the spec.

- [ ] **Step 3: Update save handler to branch on mode**

Replace the existing `handleSave` (currently lines 22-32) with:

```tsx
  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    if (isEditMode && editingBalance) {
      updateInitialBalance(editingBalance.id, parsedAmount);
      setAmount('');
      setSelectedCurrency('USD');
      router.setParams({ editId: '' });
      Alert.alert(t('common.success'), t('wallet.balanceUpdated'));
    } else {
      setInitialBalance(selectedCurrency, parsedAmount);
      setAmount('');
      Alert.alert(t('common.success'), t('wallet.balanceSaved'));
    }
  };

  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.setParams({ editId: '' });
      setAmount('');
    }
  };
```

- [ ] **Step 4: Branch the title**

Replace line ~52 (`<Text style={styles.title}>{t('wallet.setInitialBalance')}</Text>`) with:

```tsx
        <Text style={styles.title}>
          {isEditMode ? t('wallet.editInitialBalance') : t('wallet.setInitialBalance')}
        </Text>
```

- [ ] **Step 5: Lock currency chip grid in edit mode**

Replace the currency grid block (currently lines ~56-68, the `View style={styles.currencyGrid}` block) with:

```tsx
          <View style={styles.currencyGrid}>
            {(isEditMode ? [selectedCurrency] : CURRENCIES).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, selectedCurrency === c && styles.currencyChipActive]}
                onPress={() => {
                  if (!isEditMode) setSelectedCurrency(c);
                }}
                disabled={isEditMode}
              >
                <Text style={[styles.currencyChipText, selectedCurrency === c && styles.currencyChipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
```

- [ ] **Step 6: Branch primary button label and add Cancel button**

Replace the `saveButton` TouchableOpacity (currently lines ~80-82) with:

```tsx
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {isEditMode ? t('common.update') : t('common.save')}
            </Text>
          </TouchableOpacity>

          {isEditMode && (
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          )}
```

- [ ] **Step 7: Add pencil icon button to each list row**

Locate the list row block (currently lines ~91-110 — the `View key={balance.id} style={styles.balanceRow}` block) and replace the delete `TouchableOpacity` at the end with this pair of buttons:

```tsx
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => router.setParams({ editId: balance.id })}
                    >
                      <Ionicons name="pencil-outline" size={20} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => handleDelete(balance.id, balance.currencyCode)}
                    >
                      <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
```

- [ ] **Step 8: Add new style entries**

In the `createStyles` object at the bottom, remove the existing `deleteButton` entry and add:

```ts
  rowActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[1],
  },
  iconButton: {
    padding: theme.spacing[2],
  },
  cancelButton: {
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  cancelButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textSecondary,
  },
```

- [ ] **Step 9: Verify typecheck**

Run from `apps/mobile/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 10: Manual smoke test**

From `apps/mobile/` run `npx expo start --web` and navigate to Wallet → Set Balance. Verify:

- Screen loads in create mode (all currency chips visible, title "Set Balance", button "Save")
- Adding a new balance still works as before
- Tap the new pencil icon next to an existing balance → form pre-fills with that currency + amount, title switches to "Edit Initial Balance", currency chips collapse to a single non-interactive chip, button reads "Update", "Cancel" button appears underneath
- Change the amount → "Update" → success alert shows "Balance updated successfully"
- Tap Cancel in edit mode → form clears, screen returns to create mode (or navigates back if stack exists)
- Delete icon still works

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/app/wallet/set-balance.tsx
git commit -m "feat(mobile): add edit mode and pencil entry to wallet set-balance screen"
```

---

## Task 4: Add tap-on-card + pencil affordance to `wallet/index.tsx`

**Files:**
- Modify: `apps/mobile/app/wallet/index.tsx`

Goal: each per-currency card on the wallet main screen becomes tappable when `canEdit` is true, navigating to `/wallet/set-balance?editId=<id>`. A small pencil icon in the header provides a visual affordance.

- [ ] **Step 1: Add navigation helper in the component body**

After the existing hook calls (around line 25, right after `hasRates`), add:

```tsx
  const walletBalances = useWalletStore((s) => s.walletBalances);

  const handleEditBalance = (currencyCode: string) => {
    const balance = walletBalances.find((b) => b.currencyCode === currencyCode && !b.isDeleted);
    if (!balance) return;
    router.push({ pathname: '/wallet/set-balance', params: { editId: balance.id } });
  };
```

Note: `walletBalances` and `walletSummary` live in the same store — the lookup cost is negligible.

- [ ] **Step 2: Wrap each balance card in `TouchableOpacity` and add pencil icon**

Locate the balance-card `map` block (currently lines 86-147 in `wallet/index.tsx`, the `walletSummary.map((summary) => (...))` section). Replace the outer `<View key={summary.currencyCode} style={styles.balanceCard}>` with:

```tsx
              <TouchableOpacity
                key={summary.currencyCode}
                style={styles.balanceCard}
                onPress={() => handleEditBalance(summary.currencyCode)}
                disabled={!canEdit}
                activeOpacity={canEdit ? 0.7 : 1}
              >
```

Close it with `</TouchableOpacity>` instead of `</View>` at the corresponding line (currently line 147).

Inside `balanceHeader` (currently lines 88-93), add a pencil icon — replace the header block with:

```tsx
                  <View style={styles.balanceHeader}>
                    <View style={styles.balanceHeaderLeft}>
                      <Text style={styles.currencyCode}>{summary.currencyCode}</Text>
                      {canEdit && (
                        <Ionicons
                          name="pencil-outline"
                          size={14}
                          color={theme.colors.textTertiary}
                          style={styles.editHint}
                        />
                      )}
                    </View>
                    <Text style={[styles.currentBalance, summary.currentBalance < 0 && { color: theme.colors.danger }]}>
                      {formatCurrency(summary.currentBalance, summary.currencyCode)}
                    </Text>
                  </View>
```

- [ ] **Step 3: Add new style entries**

In the `createStyles` object, add (near the existing `balanceHeader` / `currencyCode` styles):

```ts
  balanceHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  editHint: {
    opacity: 0.6,
  },
```

- [ ] **Step 4: Verify typecheck**

Run from `apps/mobile/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

From `apps/mobile/` run `npx expo start --web`. Log in with an account that has at least one initial balance set. On the Wallet tab:

- Each balance card shows a small pencil icon next to the currency code
- Tapping the card opens `/wallet/set-balance?editId=...` with the correct currency pre-filled and title "Edit Initial Balance"
- Change amount and press Update → alert shows → navigate back to Wallet → initial balance and current balance both reflect the new amount
- Switch to a viewer-role account → cards are not tappable and the pencil icon is not shown

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/wallet/index.tsx
git commit -m "feat(mobile): make wallet balance cards tap-to-edit with pencil affordance"
```

---

## Task 5: Full integration verification

**Files:**
- No code changes.

- [ ] **Step 1: Run typecheck and lint from monorepo root**

```bash
npm run typecheck
npm run lint
```

Expected: both pass with no errors. If lint surfaces warnings unrelated to these tasks, leave them alone.

- [ ] **Step 2: Full manual test plan (from spec)**

Run `npx expo start --web` from `apps/mobile/`. Confirm each bullet from the spec's manual test plan (`docs/superpowers/specs/2026-04-16-edit-wallet-initial-balance-design.md` § Manual test plan):

- [ ] Wallet main screen: tap USD card → set-balance opens with USD selected and amount pre-filled, title reads "Edit Initial Balance".
- [ ] In edit mode, other currency chips are not visible/interactable.
- [ ] Change amount → tap Update → alert shows, return to wallet → USD initial balance and `currentBalance` reflect the new value.
- [ ] On set-balance screen: tap pencil icon next to a listed balance → form pre-fills with that balance; previously shown form is replaced.
- [ ] Tap Cancel in edit mode → screen goes back or clears `editId`; no mutation happens.
- [ ] Delete icon still works in both modes.
- [ ] Viewer role (`canEdit === false`) on main screen: cards are not tappable, no pencil icon rendered.
- [ ] Offline: editing still updates UI immediately; `syncStatus` becomes `pending`; sync fires when back online.
- [ ] Translations render in at least en, ru, ua.

- [ ] **Step 3: Final commit (if any follow-up fixes were needed during verification)**

If Steps 1–2 surface issues, fix them and commit with a descriptive message. If everything passed clean, skip this step.

---

## Out-of-scope reminders (do NOT do these)

- Do not touch `apps/api/*`, `packages/*`, Prisma schema, or any SQLite schema files.
- Do not modify `walletStore.ts` — `updateInitialBalance` is already wired for SQLite + server sync.
- Do not add unit tests for `wallet/set-balance.tsx` or `wallet/index.tsx` — this project does not test screen components.
- Do not refactor unrelated parts of the wallet screens, even if they look suboptimal.
- Do not add a balance-change history UI.
