# Smart Merchant Normalization & Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop one retail chain (e.g. Biedronka) from showing up as dozens of separate sellers — by auto-normalizing known brand names at bank import and giving the Merchants screen a fast multi-merge plus suggest-only heuristic grouping.

**Architecture:** API gets a curated PL brand→canonical-name dictionary applied during bank import (preview + commit, idempotent). Mobile gets a `mergeMerchants` store action (one SQL `UPDATE`, then sync/re-encrypt), a pure heuristic `suggestMerchantGroups` util, and an updated Merchants screen with selection mode + merge modal + suggestion banners. No DB schema change — `merchant` is already a text column.

**Tech Stack:** NestJS + Prisma (API), Jest (API specs), React Native + Expo + Zustand + Drizzle/raw SQLite (mobile), Jest (mobile `__tests__`), i18next (9 locales).

**Spec:** `docs/superpowers/specs/2026-06-14-merchant-normalization-and-merge-design.md`

---

## File Structure

**API (Block 1):**
- Modify: `apps/api/src/modules/import-bank/merchants/merchants-pl.ts` — add `MERCHANT_CANONICAL_PL` map + `normalizeMerchantPL()`.
- Modify: `apps/api/src/modules/import-bank/merchants/merchants-pl.spec.ts` — tests for the new function.
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts` — apply `normalizeMerchantPL` in preview build (line ~215) and commit (line ~362).

**Mobile (Blocks 2–3):**
- Modify: `apps/mobile/src/db/expenseRepository.ts` — add `bulkMergeMerchants()`.
- Modify: `apps/mobile/src/utils/merchant.ts` — add `merchantFingerprint()`, `suggestMerchantGroups()`, `MerchantGroup`.
- Modify: `apps/mobile/src/utils/__tests__/merchant.test.ts` — tests for the new util.
- Modify: `apps/mobile/src/stores/expenseStore.ts` — add `mergeMerchants` to the interface + implementation.
- Modify: `apps/mobile/app/settings/merchants.tsx` — selection mode, merge modal, suggestion banners.

**i18n (Block 5):**
- Modify: all 9 locale files under `apps/mobile/src/i18n/locales/` — new `merchants.*` keys.

---

## Task 1: API — brand canonical dictionary + `normalizeMerchantPL`

**Files:**
- Modify: `apps/api/src/modules/import-bank/merchants/merchants-pl.ts`
- Test: `apps/api/src/modules/import-bank/merchants/merchants-pl.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/import-bank/merchants/merchants-pl.spec.ts`:

```typescript
import { normalizeMerchantPL } from './merchants-pl';

describe('normalizeMerchantPL', () => {
  it('collapses store-variant names to the canonical brand', () => {
    expect(normalizeMerchantPL('BIEDRONKA 1234 WARSZAWA')).toBe('Biedronka');
    expect(normalizeMerchantPL('BIEDRONKA 5678 KRAKOW')).toBe('Biedronka');
  });
  it('matches case-insensitively and handles diacritic brands', () => {
    expect(normalizeMerchantPL('zabka z5351')).toBe('Żabka');
    expect(normalizeMerchantPL('ŻABKA NANO 99')).toBe('Żabka');
  });
  it('handles multi-word brand keys', () => {
    expect(normalizeMerchantPL('PŁATNOŚĆ MEDIA MARKT GALERIA')).toBe('Media Markt');
  });
  it('returns the original name unchanged for unknown merchants', () => {
    expect(normalizeMerchantPL('Sklep U Janka')).toBe('Sklep U Janka');
  });
  it('passes through undefined', () => {
    expect(normalizeMerchantPL(undefined)).toBeUndefined();
  });
  it('is idempotent on an already-canonical name', () => {
    expect(normalizeMerchantPL('Biedronka')).toBe('Biedronka');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/modules/import-bank/merchants/merchants-pl.spec.ts`
Expected: FAIL — `normalizeMerchantPL is not a function` / no export.

- [ ] **Step 3: Implement the dictionary + function**

In `apps/api/src/modules/import-bank/merchants/merchants-pl.ts`, append (do NOT modify the existing `MERCHANTS_PL` / `suggestCategoryFromMerchantPL`):

```typescript
/**
 * Brand substring (UPPERCASE) -> canonical display name. Used to collapse bank
 * statement variants like "BIEDRONKA 1234 WARSZAWA" to a single "Biedronka" so
 * one chain is one seller in analytics. Dictionary-only (no heuristic) — safe to
 * apply automatically at import. Longer keys are checked first so "MEDIA MARKT"
 * wins over a hypothetical "MEDIA".
 */
export const MERCHANT_CANONICAL_PL: Record<string, string> = {
  // Groceries
  BIEDRONKA: 'Biedronka',
  ŻABKA: 'Żabka',
  ZABKA: 'Żabka',
  LIDL: 'Lidl',
  KAUFLAND: 'Kaufland',
  CARREFOUR: 'Carrefour',
  AUCHAN: 'Auchan',
  TESCO: 'Tesco',
  NETTO: 'Netto',
  STOKROTKA: 'Stokrotka',
  DINO: 'Dino',
  ALDI: 'Aldi',
  // Pharmacy / Health
  ROSSMANN: 'Rossmann',
  HEBE: 'Hebe',
  SUPERPHARM: 'Super-Pharm',
  // Shopping / E-commerce
  ALLEGRO: 'Allegro',
  EMPIK: 'Empik',
  'MEDIA MARKT': 'Media Markt',
  MEDIAMARKT: 'Media Markt',
  'RTV EURO': 'RTV Euro AGD',
  IKEA: 'IKEA',
  ZARA: 'Zara',
  RESERVED: 'Reserved',
  CCC: 'CCC',
  // Transport / Fuel
  ORLEN: 'Orlen',
  LOTOS: 'Lotos',
  SHELL: 'Shell',
  CIRCLE: 'Circle K',
  UBER: 'Uber',
  BOLT: 'Bolt',
  FREENOW: 'FreeNow',
  // Food delivery / Restaurants
  'PYSZNE.PL': 'Pyszne.pl',
  GLOVO: 'Glovo',
  WOLT: 'Wolt',
  MCDONALD: "McDonald's",
  KFC: 'KFC',
  STARBUCKS: 'Starbucks',
  // Subscriptions
  NETFLIX: 'Netflix',
  SPOTIFY: 'Spotify',
  DISNEY: 'Disney+',
};

// Keys sorted longest-first so multi-word brands win over shorter substrings.
const CANONICAL_KEYS_BY_LENGTH = Object.keys(MERCHANT_CANONICAL_PL).sort(
  (a, b) => b.length - a.length,
);

/**
 * If `name` contains a known brand substring, return its canonical display name;
 * otherwise return `name` unchanged. Undefined passes through. Idempotent.
 */
export function normalizeMerchantPL(name: string | undefined): string | undefined {
  if (!name) return name;
  const upper = name.toUpperCase();
  for (const key of CANONICAL_KEYS_BY_LENGTH) {
    if (upper.includes(key)) return MERCHANT_CANONICAL_PL[key];
  }
  return name;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/import-bank/merchants/merchants-pl.spec.ts`
Expected: PASS (all describe blocks, including the pre-existing `suggestCategoryFromMerchantPL` ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/import-bank/merchants/merchants-pl.ts apps/api/src/modules/import-bank/merchants/merchants-pl.spec.ts
git commit -m "feat(import-bank): add PL brand canonical-name normalization"
```

---

## Task 2: API — wire normalization into bank import

**Files:**
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts`

- [ ] **Step 1: Import the function**

At the top of `apps/api/src/modules/import-bank/import-bank.service.ts`, find the existing merchants-pl import (or add one). Ensure it includes `normalizeMerchantPL`:

```typescript
import { normalizeMerchantPL } from './merchants/merchants-pl';
```

(If no import from `./merchants/merchants-pl` exists yet in this file, add the line above near the other relative imports.)

- [ ] **Step 2: Normalize in the preview build (visible to the user)**

In `buildPreviewResponse`, change the `withRefs` map (currently around line 215):

```typescript
const withRefs: ImportRow[] = parsedRows.map((r) => ({
  ...r,
  merchant: normalizeMerchantPL(r.merchant),
  externalRef: buildExternalRef(parser.id, r),
  alreadyImported: false,
}));
```

- [ ] **Step 3: Normalize at commit (defensive — client could send raw rows)**

In `commit`, change the expense create `merchant` line (currently line ~362) from `merchant: row.merchant ?? null,` to:

```typescript
                merchant: normalizeMerchantPL(row.merchant) ?? null,
```

- [ ] **Step 4: Typecheck + build the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the import-bank tests to confirm nothing regressed**

Run: `cd apps/api && npx jest src/modules/import-bank`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/import-bank/import-bank.service.ts
git commit -m "feat(import-bank): normalize merchant names on preview and commit"
```

---

## Task 3: Mobile — `bulkMergeMerchants` repository function

**Files:**
- Modify: `apps/mobile/src/db/expenseRepository.ts`

- [ ] **Step 1: Add the function**

In `apps/mobile/src/db/expenseRepository.ts`, immediately after the existing `bulkRenameMerchant` function (ends ~line 295), add:

```typescript
/**
 * Merge several merchant variants into one canonical name in a single UPDATE.
 * Account-scoped, marks affected rows pending for re-sync (re-encryption).
 * Rows already named `target` are skipped (no-op churn avoided).
 */
export async function bulkMergeMerchants(
  accountId: string,
  sources: string[],
  target: string,
): Promise<void> {
  if (sources.length === 0) return;
  const placeholders = sources.map(() => '?').join(', ');
  await executeSql(
    `UPDATE expenses SET merchant = ?, updated_at = ?, sync_status = 'pending'
     WHERE account_id = ? AND merchant IN (${placeholders}) AND merchant != ? AND is_deleted = 0`,
    [target, Date.now(), accountId, ...sources, target],
  );
}
```

- [ ] **Step 2: Typecheck the mobile package**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/db/expenseRepository.ts
git commit -m "feat(mobile): add bulkMergeMerchants repository helper"
```

---

## Task 4: Mobile — heuristic `suggestMerchantGroups` util

**Files:**
- Modify: `apps/mobile/src/utils/merchant.ts`
- Test: `apps/mobile/src/utils/__tests__/merchant.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/utils/__tests__/merchant.test.ts`:

```typescript
import { merchantFingerprint, suggestMerchantGroups } from '../merchant';

describe('merchantFingerprint', () => {
  it('keys on the first significant (>=4 char) token, ignoring numbers/city', () => {
    expect(merchantFingerprint('BIEDRONKA 1234 WARSZAWA')).toBe('BIEDRONKA');
    expect(merchantFingerprint('Biedronka 5678 Krakow')).toBe('BIEDRONKA');
  });
  it('returns empty when there is no significant token', () => {
    expect(merchantFingerprint('12 99')).toBe('');
    expect(merchantFingerprint('PL 1')).toBe('');
  });
});

describe('suggestMerchantGroups', () => {
  it('groups variants sharing a fingerprint (>=2 members), canonical = title-cased brand', () => {
    const groups = suggestMerchantGroups([
      { merchant: 'BIEDRONKA 1234 WARSZAWA', count: 5 },
      { merchant: 'BIEDRONKA 5678 KRAKOW', count: 3 },
      { merchant: 'Lidl', count: 10 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical).toBe('Biedronka');
    expect(groups[0].members).toEqual(['BIEDRONKA 1234 WARSZAWA', 'BIEDRONKA 5678 KRAKOW']);
    expect(groups[0].totalCount).toBe(8);
  });
  it('does not suggest singletons', () => {
    expect(suggestMerchantGroups([{ merchant: 'Lidl', count: 2 }])).toEqual([]);
  });
  it('sorts groups by total count desc', () => {
    const groups = suggestMerchantGroups([
      { merchant: 'ROSSMANN 1', count: 1 },
      { merchant: 'ROSSMANN 2', count: 1 },
      { merchant: 'BIEDRONKA A', count: 5 },
      { merchant: 'BIEDRONKA B', count: 5 },
    ]);
    expect(groups.map((g) => g.canonical)).toEqual(['Biedronka', 'Rossmann']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts`
Expected: FAIL — `merchantFingerprint`/`suggestMerchantGroups` not exported.

- [ ] **Step 3: Implement the util**

Append to `apps/mobile/src/utils/merchant.ts`:

```typescript
export interface MerchantGroup {
  /** Brand fingerprint key (uppercase). */
  fingerprint: string;
  /** Suggested canonical name (title-cased brand). User can edit before merging. */
  canonical: string;
  /** Variant names in the group, highest-count first. */
  members: string[];
  /** Sum of expense counts across members. */
  totalCount: number;
}

/**
 * Brand key for fuzzy grouping: the first alphabetic token of length >= 4,
 * uppercased. Strips store numbers and short noise tokens. Returns '' when no
 * significant token exists. Intentionally coarse — it powers suggestions the
 * user confirms, never an automatic merge, so over-grouping is acceptable.
 */
export function merchantFingerprint(name: string): string {
  const tokens = name
    .toUpperCase()
    .split(/[^A-ZÀ-ÿĄĆĘŁŃÓŚŹŻ]+/i)
    .filter(Boolean);
  return tokens.find((t) => t.length >= 4) ?? '';
}

const titleCaseBrand = (fp: string): string =>
  fp.charAt(0).toUpperCase() + fp.slice(1).toLowerCase();

/**
 * Group merchant variants that share a fingerprint, returning only groups with
 * >=2 members (something to merge). Each group suggests a title-cased canonical
 * name; members are sorted by count desc. Groups sorted by total count desc.
 */
export function suggestMerchantGroups(
  merchants: { merchant: string; count: number }[],
): MerchantGroup[] {
  const buckets = new Map<string, { merchant: string; count: number }[]>();
  for (const m of merchants) {
    const fp = merchantFingerprint(m.merchant);
    if (!fp) continue;
    const arr = buckets.get(fp) ?? [];
    arr.push(m);
    buckets.set(fp, arr);
  }
  const groups: MerchantGroup[] = [];
  for (const [fp, members] of buckets) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(
      (a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant),
    );
    groups.push({
      fingerprint: fp,
      canonical: titleCaseBrand(fp),
      members: sorted.map((s) => s.merchant),
      totalCount: sorted.reduce((s, x) => s + x.count, 0),
    });
  }
  return groups.sort((a, b) => b.totalCount - a.totalCount);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts`
Expected: PASS (new + pre-existing describe blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/merchant.ts apps/mobile/src/utils/__tests__/merchant.test.ts
git commit -m "feat(mobile): add heuristic merchant grouping suggestions util"
```

---

## Task 5: Mobile — `mergeMerchants` store action

**Files:**
- Modify: `apps/mobile/src/stores/expenseStore.ts`

- [ ] **Step 1: Import the repository function**

In `apps/mobile/src/stores/expenseStore.ts`, find the existing import that brings in `bulkRenameMerchant` (line ~14) and add `bulkMergeMerchants` to it:

```typescript
  bulkRenameMerchant,
  bulkMergeMerchants,
```

- [ ] **Step 2: Add to the interface**

In the `ExpenseState` interface, immediately after the `renameMerchant` line (~line 93), add:

```typescript
  mergeMerchants: (sources: string[], target: string) => Promise<number>;
```

- [ ] **Step 3: Implement the action**

In the store body, immediately after the `renameMerchant` implementation (ends ~line 686, before `getExpensesByCategory`), add:

```typescript
    mergeMerchants: async (sources, target) => {
      const trimmed = target.trim();
      if (!trimmed || sources.length === 0) return 0;
      const sourceSet = new Set(sources);
      const accountId = useAccountStore.getState().currentAccountId || '';
      const matches = (e: Expense) =>
        !e.isDeleted && e.merchant != null && sourceSet.has(e.merchant) && e.merchant !== trimmed;
      const affected = get().expenses.filter(matches);
      if (affected.length === 0) return 0;
      const now = new Date();
      set((state) => ({
        expenses: state.expenses.map((e) =>
          matches(e)
            ? { ...e, merchant: trimmed, updatedAt: now, syncStatus: 'pending' as SyncStatus }
            : e,
        ),
      }));
      try {
        await bulkMergeMerchants(accountId, sources, trimmed);
      } catch (e) {
        console.error('Failed to bulk-merge merchants in SQLite:', e);
      }
      get().syncPendingExpenses().catch((e) =>
        console.warn('Merchant merge sync deferred (offline?):', e),
      );
      return affected.length;
    },
```

- [ ] **Step 4: Typecheck the mobile package**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (confirms `Expense` and `SyncStatus` are already imported in this file — they are, used by `renameMerchant`).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/expenseStore.ts
git commit -m "feat(mobile): add mergeMerchants store action"
```

---

## Task 6: Mobile — Merchants screen selection, merge modal & suggestions

**Files:**
- Modify: `apps/mobile/app/settings/merchants.tsx`

- [ ] **Step 1: Replace the screen with the selection-aware version**

Overwrite `apps/mobile/app/settings/merchants.tsx` with:

```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { getMerchantCounts, suggestMerchantGroups } from '@/utils/merchant';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function MerchantsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canEdit = useAccountStore((s) => s.canEdit());
  const expenses = useExpenseStore((s) => s.expenses);
  const renameMerchant = useExpenseStore((s) => s.renameMerchant);
  const mergeMerchants = useExpenseStore((s) => s.mergeMerchants);
  const merchants = useMemo(() => getMerchantCounts(expenses), [expenses]);
  const countByMerchant = useMemo(
    () => new Map(merchants.map((m) => [m.merchant, m.count])),
    [merchants],
  );

  // Single rename modal
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Multi-select + merge
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeSources, setMergeSources] = useState<string[] | null>(null);
  const [mergeName, setMergeName] = useState('');

  // Suggestions (session-dismissed by fingerprint)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const suggestions = useMemo(
    () => suggestMerchantGroups(merchants).filter((g) => !dismissed.has(g.fingerprint)),
    [merchants, dismissed],
  );

  const openRename = (merchant: string) => {
    setEditing(merchant);
    setName(merchant);
  };
  const closeRename = () => {
    setEditing(null);
    setName('');
  };

  const handleSaveRename = async () => {
    if (!editing) return;
    const next = name.trim();
    if (!next) { showAlert(t('common.error'), t('merchants.nameRequired')); return; }
    if (next === editing) { closeRename(); return; }
    setSaving(true);
    const count = await renameMerchant(editing, next);
    setSaving(false);
    closeRename();
    showAlert('', t('merchants.renamed', { count }));
  };

  const handleDelete = (merchant: string, count: number) => {
    showAlert(t('merchants.delete'), t('merchants.deleteConfirm', { count }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchants.delete'), style: 'destructive',
        onPress: async () => {
          const n = await renameMerchant(merchant, null);
          showAlert('', t('merchants.deleted', { count: n }));
        },
      },
    ]);
  };

  const toggleSelect = (merchant: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) next.delete(merchant); else next.add(merchant);
      return next;
    });
  };
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // Default canonical = highest-count name among the given sources
  const defaultCanonical = (sources: string[]) =>
    [...sources].sort((a, b) => (countByMerchant.get(b) ?? 0) - (countByMerchant.get(a) ?? 0))[0] ?? '';

  const openMergeFromSelection = () => {
    const sources = [...selected];
    if (sources.length < 2) { showAlert('', t('merchants.selectToMerge')); return; }
    setMergeSources(sources);
    setMergeName(defaultCanonical(sources));
  };
  const openMergeFromSuggestion = (members: string[], canonical: string) => {
    setMergeSources(members);
    setMergeName(canonical);
  };
  const closeMerge = () => {
    setMergeSources(null);
    setMergeName('');
  };

  const mergeExpenseCount = useMemo(
    () => (mergeSources ?? []).reduce((s, m) => s + (countByMerchant.get(m) ?? 0), 0),
    [mergeSources, countByMerchant],
  );

  const handleConfirmMerge = async () => {
    if (!mergeSources) return;
    const target = mergeName.trim();
    if (!target) { showAlert(t('common.error'), t('merchants.nameRequired')); return; }
    setSaving(true);
    const count = await mergeMerchants(mergeSources, target);
    setSaving(false);
    closeMerge();
    exitSelect();
    showAlert('', t('merchants.merged', { name: target, count }));
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Section header — switches to selection controls in select mode */}
        <View style={styles.sectionHeader}>
          {selecting ? (
            <>
              <Text style={styles.sectionTitle}>{t('merchants.selected', { count: selected.size })}</Text>
              <TouchableOpacity onPress={exitSelect}>
                <Text style={styles.headerAction}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>{t('settingsNav.merchants')}</Text>
              {canEdit && merchants.length > 1 && (
                <TouchableOpacity onPress={() => setSelecting(true)}>
                  <Text style={styles.headerAction}>{t('merchants.select')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Suggestion banners (hidden during selection mode) */}
        {canEdit && !selecting && suggestions.map((g) => (
          <View key={g.fingerprint} style={styles.suggestion}>
            <View style={styles.suggestionHeader}>
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.suggestionTitle}>{t('merchants.suggestionTitle')}</Text>
            </View>
            <Text style={styles.suggestionBody} numberOfLines={2}>
              {g.members.join(', ')}
            </Text>
            <View style={styles.suggestionActions}>
              <TouchableOpacity onPress={() => setDismissed((p) => new Set(p).add(g.fingerprint))}>
                <Text style={styles.dismissText}>{t('merchants.dismiss')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.suggestionMergeButton}
                onPress={() => openMergeFromSuggestion(g.members, g.canonical)}
              >
                <Text style={styles.suggestionMergeText}>{t('merchants.suggestionMerge', { name: g.canonical })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.card}>
          {merchants.length === 0 ? (
            <Text style={styles.empty}>{t('merchants.empty')}</Text>
          ) : (
            merchants.map(({ merchant, count }, i) => {
              const isSelected = selected.has(merchant);
              return (
                <React.Fragment key={merchant}>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowContent}
                      onPress={
                        !canEdit
                          ? undefined
                          : selecting
                            ? () => toggleSelect(merchant)
                            : () => openRename(merchant)
                      }
                      activeOpacity={canEdit ? 0.7 : 1}
                    >
                      {selecting ? (
                        <Ionicons
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={isSelected ? theme.colors.primary : theme.colors.textTertiary}
                        />
                      ) : (
                        <View style={styles.iconWrap}>
                          <Ionicons name="storefront-outline" size={18} color={theme.colors.primary} />
                        </View>
                      )}
                      <View style={styles.nameContainer}>
                        <Text style={styles.name} numberOfLines={1}>{merchant}</Text>
                        <Text style={styles.sub}>{t('merchants.expensesCount', { count })}</Text>
                      </View>
                    </TouchableOpacity>
                    {canEdit && !selecting && (
                      <TouchableOpacity onPress={() => handleDelete(merchant, count)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {i < merchants.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Bottom merge bar in selection mode */}
      {selecting && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.mergeButton, selected.size < 2 && styles.mergeButtonDisabled]}
            onPress={openMergeFromSelection}
            disabled={selected.size < 2}
          >
            <Ionicons name="git-merge-outline" size={18} color={theme.colors.textInverse} />
            <Text style={styles.mergeButtonText}>{t('merchants.merge')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Single rename modal */}
      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={closeRename}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeRename} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.handle} />
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
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeRename}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveRename}
                disabled={saving}
              >
                <Text style={styles.saveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Merge modal */}
      <Modal visible={mergeSources !== null} transparent animationType="slide" onRequestClose={closeMerge}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeMerge} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t('merchants.mergeTitle')}</Text>
            <Text style={styles.mergeLabel}>{t('merchants.mergeInto')}</Text>
            <TextInput
              style={styles.input}
              value={mergeName}
              onChangeText={setMergeName}
              placeholder={t('merchants.renamePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              autoCapitalize="words"
            />
            <Text style={styles.mergeCount}>{t('merchants.mergeCount', { count: mergeExpenseCount })}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeMerge}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleConfirmMerge}
                disabled={saving}
              >
                <Text style={styles.saveText}>{t('merchants.merge')}</Text>
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
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  headerAction: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  rowContent: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const, alignItems: 'center' as const,
  },
  nameContainer: { flex: 1, marginLeft: theme.spacing[3] },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  divider: {
    height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.body, color: theme.colors.textTertiary,
    textAlign: 'center' as const, paddingVertical: theme.spacing[4],
  },
  // Suggestion banner
  suggestion: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  suggestionHeader: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  suggestionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  suggestionBody: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[3] },
  suggestionActions: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    justifyContent: 'flex-end' as const, gap: theme.spacing[4],
  },
  dismissText: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  suggestionMergeButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  suggestionMergeText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  // Bottom merge bar
  bottomBar: {
    paddingHorizontal: theme.spacing[4], paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1, borderTopColor: theme.colors.divider,
  },
  mergeButton: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
  },
  mergeButtonDisabled: { opacity: 0.5 },
  mergeButtonText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
  // Modals
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const, marginBottom: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  mergeLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16, color: theme.colors.textPrimary, marginBottom: theme.spacing[4],
  },
  mergeCount: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginBottom: theme.spacing[4] },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelButton: {
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveButton: {
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
```

- [ ] **Step 2: Typecheck the mobile package**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors. (If `theme.spacing[3.5]` reports a type error, it is already used by the original file's styles, so it is valid for this theme.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/settings/merchants.tsx
git commit -m "feat(mobile): merchant multi-merge + grouping suggestions UI"
```

---

## Task 7: i18n — add `merchants.*` keys to all 9 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

- [ ] **Step 1: Add the new keys (English source)**

These keys must be added inside the existing `merchants: { ... }` object in EVERY locale file. English source values:

```typescript
    select: 'Select',
    selected: '{{count}} selected',
    selectAll: 'Select all',
    merge: 'Merge',
    mergeTitle: 'Merge merchants',
    mergeInto: 'Merge into',
    mergeCount: '{{count}} expenses will be moved',
    merged: 'Merged {{count}} expenses into {{name}}',
    selectToMerge: 'Select 2 or more merchants to merge',
    suggestionTitle: 'Looks like one seller',
    suggestionMerge: 'Merge into {{name}}',
    dismiss: 'Dismiss',
```

Invoke the **i18n-add-strings** skill to add these 12 keys under `merchants` to all 9 locale files with proper translations (en/de/es/fr/pl/ru/ua/be/nl), keeping the `{{count}}` / `{{name}}` interpolation tokens intact.

- [ ] **Step 2: Verify key parity across locales**

Run (from project root):

```bash
node -e "const langs=['en','de','es','fr','pl','ru','ua','be','nl'];const need=['select','selected','selectAll','merge','mergeTitle','mergeInto','mergeCount','merged','selectToMerge','suggestionTitle','suggestionMerge','dismiss'];for(const l of langs){const src=require('fs').readFileSync('apps/mobile/src/i18n/locales/'+l+'.ts','utf8');const missing=need.filter(k=>!new RegExp('\\\\b'+k+'\\\\s*:').test(src));console.log(l, missing.length?('MISSING '+missing.join(',')):'ok');}"
```

Expected: every locale prints `ok`.

- [ ] **Step 3: Typecheck the mobile package**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "i18n(merchants): add merge + suggestion strings (9 locales)"
```

---

## Task 8: Full verification + finish

**Files:** none (verification only)

- [ ] **Step 1: Run the affected test suites**

Run: `cd apps/api && npx jest src/modules/import-bank` — Expected: PASS.
Run: `cd apps/mobile && npx jest src/utils/__tests__/merchant.test.ts` — Expected: PASS.

- [ ] **Step 2: Typecheck both packages**

Run: `cd apps/api && npx tsc --noEmit` — Expected: no errors.
Run: `cd apps/mobile && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 3: Lint the changed files**

Run: `npm run lint`
Expected: no new errors in the changed files (`console.warn`/`console.error` are allowed by the `no-console` rule).

- [ ] **Step 4: Manual smoke test (mobile)**

Start the app (`npm run dev:web` from root) and:
1. Settings → Merchants: with ≥2 Biedronka variants present, confirm a suggestion banner appears.
2. Tap "Merge into Biedronka" → confirm modal shows the moved-expenses count → Merge → variants collapse to one row.
3. Tap "Select" → check 2+ merchants → "Merge" → edit target → Merge → rows collapse.
4. Analytics tab → "By merchant": confirm the merged brand is a single slice/sum.

- [ ] **Step 5: Finish the task**

Invoke the **finish-aba-task** skill to create the ABA-{N} GitHub issue (replace `ABA-XXX` in the spec) and update `CLAUDE.md` + `user_docs/` documenting: PL brand normalization at bank import, `mergeMerchants` / `bulkMergeMerchants`, `suggestMerchantGroups`, and the Merchants-screen multi-merge + suggestions.

---

## Self-Review Notes

- **Spec coverage:** Block 1 → Tasks 1–2; Block 2 → Tasks 3, 5, 6; Block 3 → Tasks 4, 6; Block 4 → no code (verified in Task 8 step 4); Block 5 (i18n/scope) → Task 7. All covered.
- **Type consistency:** `mergeMerchants(sources, target)` and `bulkMergeMerchants(accountId, sources, target)` signatures match across Tasks 3/5/6; `MerchantGroup` (fingerprint/canonical/members/totalCount) consistent across Tasks 4/6; `suggestMerchantGroups` / `getMerchantCounts` inputs are `{ merchant, count }[]` everywhere.
- **No schema change** — `merchant` is an existing text column on both Prisma and SQLite; no migration task needed.
