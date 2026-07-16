# Inflation Shield — Mobile Home UI (Plan 4 of N) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Inflation Shield visible in the app — a home-screen widget ("Saved X · Buy ahead") and a full screen listing what to stock up on and how much has been saved, driven by the existing free `GET /insights/inflation-shield`.

**Architecture:** A server-only, MMKV-cached Zustand store (`inflationShieldStore`, mirroring `insightsStore`'s safe-to-spend slice) so the widget paints instantly from cache; a thin `useInflationShield` hook; an `InflationShieldWidget` card wired into the existing `WIDGET_KEYS` / `HomeWidgetSwitch`; and a standard-header screen `app/inflation-shield/index.tsx`. No backend changes.

**Tech Stack:** Expo/React Native, Zustand, react-native-mmkv, expo-router, Jest (for the store).

**Design spec:** `docs/superpowers/specs/2026-07-15-inflation-shield-design.md` (§1 Surfaces — Shield screen + Home widget). Builds on Plans 1–3 (engine, tracking, chat tool), all implemented.

## Global Constraints

- **This is Plan 4 of N.** Scope = the MMKV-cached store, the hook, the home widget (+ `WidgetKey` wiring), and the screen (+ i18n). OUT of scope (later plans): the shareable-image card, the shopping-list "buy ahead" strip, community-price boost, and proactive push.
- **The shield endpoint is FREE** — no Pro/upgrade gating anywhere in the store, hook, widget, or screen (unlike `communityPriceStore`/`shoppingListStore`, do NOT wire `useUpgradeStore`).
- **Server-only + MMKV cache** — the store loads from `api.getInflationShield()` and caches the last response in MMKV (`id: 'inflation-shield'`) so the widget shows instantly on next launch; on a load error, KEEP the cached data and only set the error flag (mirror `insightsStore.loadSafeToSpend`). It is NOT offline-first SQLite.
- **New screens MUST have a nav header** — register `app/inflation-shield/index.tsx` in `app/_layout.tsx` with `headerShown: true, title: t('inflationShield.title')` (Pattern A, same as `shopping-list/index` / `purchase-requests/index`). Do NOT locally render a `<Stack.Screen>` override in the screen.
- **Money formatting** — always `formatCurrency(amount, currency)` from `@budget/shared-utils`; never inline `toFixed` + code. All shield amounts are already in `baseCurrency`.
- **Savings copy is an ESTIMATE** — the widget/screen label savedSoFar/projectedSaving with an "estimated" qualifier (`inflationShield.estimated`), never a guarantee.
- **i18n:** the new `inflationShield` namespace goes in ALL 9 locale files (`en/de/es/fr/pl/ru/ua/be/nl`).
- **Adding `'inflationShield'` to `WIDGET_KEYS`** makes it default-visible and auto-inserted into existing users' widget order at its array position (that store's `loadVisibility`/`loadOrder` handle it — no migration needed).
- Commit messages ENGLISH. Verify each task with `cd apps/mobile && npx tsc --noEmit` (0 errors). The store task also runs `npx jest inflationShieldStore`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/mobile/src/services/analytics.api.ts` (modify) | `getInflationShield()` | 1 |
| `apps/mobile/src/stores/inflationShieldStore.ts` (create) | MMKV-cached server store | 2 |
| `apps/mobile/src/stores/__tests__/inflationShieldStore.test.ts` (create) | store unit tests | 2 |
| `apps/mobile/src/features/insights/useInflationShield.ts` (create) | hook | 3 |
| `apps/mobile/src/components/widgets/InflationShieldWidget.tsx` (create) | home widget card | 4 |
| `apps/mobile/src/components/widgets/index.ts` (modify) | barrel export | 4 |
| `apps/mobile/src/stores/widgetVisibilityStore.ts` (modify) | `'inflationShield'` `WidgetKey` | 4 |
| `apps/mobile/src/components/home/HomeWidgetSwitch.tsx` (modify) | switch case | 4 |
| `apps/mobile/app/inflation-shield/index.tsx` (create) | full screen | 5 |
| `apps/mobile/app/_layout.tsx` (modify) | route + header | 5 |
| `apps/mobile/src/i18n/locales/*.ts` (modify ×9) | `inflationShield` namespace | 6 |

---

### Task 1: `getInflationShield` API method

**Files:**
- Modify: `apps/mobile/src/services/analytics.api.ts`

**Interfaces:**
- Produces: `api.getInflationShield(): Promise<InflationShieldResponse>` (consumed by the store in Task 2).

- [ ] **Step 1: Add the import + method**

In `apps/mobile/src/services/analytics.api.ts`, add `InflationShieldResponse` to the `@budget/shared-types` type import, and add the method inside the `analyticsApi` object (next to `getSafeToSpend`/`getWrapped`):

```ts
  getInflationShield() {
    return httpClient.request<InflationShieldResponse>('/insights/inflation-shield');
  },
```
(No barrel change — `analyticsApi` is already spread into the `api` singleton in `api.ts`.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/analytics.api.ts
git commit -m "feat(mobile): api.getInflationShield"
```

---

### Task 2: `inflationShieldStore` (MMKV-cached)

**Files:**
- Create: `apps/mobile/src/stores/inflationShieldStore.ts`
- Create: `apps/mobile/src/stores/__tests__/inflationShieldStore.test.ts`

**Interfaces:**
- Consumes: `api.getInflationShield`.
- Produces: `useInflationShieldStore` with `{ data: InflationShieldResponse | null, loading: boolean, error: boolean, updatedAt: number | null, load(): Promise<void> }`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/stores/__tests__/inflationShieldStore.test.ts`:

```ts
// MMKV has no jest-native binding — mock it with an in-memory map.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string | number>();
  return {
    MMKV: jest.fn().mockImplementation(() => ({
      getString: (k: string) => (store.has(k) ? String(store.get(k)) : undefined),
      getNumber: (k: string) => (typeof store.get(k) === 'number' ? (store.get(k) as number) : undefined),
      set: (k: string, v: string | number) => store.set(k, v),
      delete: (k: string) => store.delete(k),
    })),
  };
});

const getInflationShield = jest.fn();
jest.mock('@/services/api', () => ({ api: { getInflationShield: (...a: any[]) => getInflationShield(...a) } }));

import { useInflationShieldStore } from '../inflationShieldStore';

const SHIELD = { baseCurrency: 'PLN', items: [{ canonicalName: 'Masło' }], savedSoFar: 12, hasEnoughData: true, fxApproximate: false, computedAt: '2026-07-16T00:00:00Z', totalProjectedSaving: 5, basketMonthlyForecastPct: 3 };

describe('inflationShieldStore', () => {
  beforeEach(() => {
    getInflationShield.mockReset();
    useInflationShieldStore.setState({ data: null, loading: false, error: false, updatedAt: null });
  });

  it('load() populates data and clears loading on success', async () => {
    getInflationShield.mockResolvedValue(SHIELD);
    await useInflationShieldStore.getState().load();
    const s = useInflationShieldStore.getState();
    expect(s.data?.savedSoFar).toBe(12);
    expect(s.loading).toBe(false);
    expect(s.error).toBe(false);
    expect(typeof s.updatedAt).toBe('number');
  });

  it('load() keeps existing data and sets error on failure (no wipe)', async () => {
    useInflationShieldStore.setState({ data: SHIELD as any, updatedAt: 1 });
    getInflationShield.mockRejectedValue(new Error('offline'));
    await useInflationShieldStore.getState().load();
    const s = useInflationShieldStore.getState();
    expect(s.data?.savedSoFar).toBe(12); // stale data preserved
    expect(s.error).toBe(true);
    expect(s.loading).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest inflationShieldStore`
Expected: FAIL — "Cannot find module '../inflationShieldStore'".

- [ ] **Step 3: Write the store**

Create `apps/mobile/src/stores/inflationShieldStore.ts`:

```ts
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { InflationShieldResponse } from '@budget/shared-types';
import { api } from '@/services/api';

const storage = new MMKV({ id: 'inflation-shield' });
const DATA_KEY = 'shield_data';
const UPDATED_AT_KEY = 'shield_updated_at';

function loadCached(): InflationShieldResponse | null {
  try {
    const raw = storage.getString(DATA_KEY);
    return raw ? (JSON.parse(raw) as InflationShieldResponse) : null;
  } catch {
    return null;
  }
}

interface InflationShieldState {
  data: InflationShieldResponse | null;
  loading: boolean;
  error: boolean;
  updatedAt: number | null;
  load: () => Promise<void>;
}

export const useInflationShieldStore = create<InflationShieldState>()((set) => ({
  data: loadCached(),
  loading: false,
  error: false,
  updatedAt: storage.getNumber(UPDATED_AT_KEY) ?? null,

  load: async () => {
    set({ loading: true, error: false });
    try {
      const data = await api.getInflationShield();
      const updatedAt = Date.now();
      storage.set(DATA_KEY, JSON.stringify(data));
      storage.set(UPDATED_AT_KEY, updatedAt);
      set({ data, loading: false, updatedAt });
    } catch (e) {
      // Keep any cached data; only flag the error.
      console.warn('[inflationShieldStore] load failed', e);
      set({ loading: false, error: true });
    }
  },
}));
```

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && npx jest inflationShieldStore`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` (exit 0), then:
```bash
git add apps/mobile/src/stores/inflationShieldStore.ts apps/mobile/src/stores/__tests__/inflationShieldStore.test.ts
git commit -m "feat(mobile): MMKV-cached inflationShieldStore"
```

---

### Task 3: `useInflationShield` hook

**Files:**
- Create: `apps/mobile/src/features/insights/useInflationShield.ts`

**Interfaces:**
- Consumes: `useInflationShieldStore`.
- Produces: `useInflationShield(): { data, loading, hasEnoughData }`.

- [ ] **Step 1: Write the hook**

Create `apps/mobile/src/features/insights/useInflationShield.ts`:

```ts
import { useEffect } from 'react';
import type { InflationShieldResponse } from '@budget/shared-types';
import { useInflationShieldStore } from '@/stores/inflationShieldStore';

export interface UseInflationShieldResult {
  data: InflationShieldResponse | null;
  loading: boolean;
  hasEnoughData: boolean;
}

export function useInflationShield(): UseInflationShieldResult {
  const data = useInflationShieldStore((s) => s.data);
  const loading = useInflationShieldStore((s) => s.loading);
  const load = useInflationShieldStore((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  return {
    data,
    loading,
    hasEnoughData: !!data?.hasEnoughData,
  };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` (exit 0), then:
```bash
git add apps/mobile/src/features/insights/useInflationShield.ts
git commit -m "feat(mobile): useInflationShield hook"
```

---

### Task 4: Home widget + `WidgetKey` wiring

**Files:**
- Create: `apps/mobile/src/components/widgets/InflationShieldWidget.tsx`
- Modify: `apps/mobile/src/components/widgets/index.ts` (barrel export)
- Modify: `apps/mobile/src/stores/widgetVisibilityStore.ts` (`WIDGET_KEYS`)
- Modify: `apps/mobile/src/components/home/HomeWidgetSwitch.tsx` (switch case + import)

**Interfaces:**
- Consumes: `useInflationShield`, `formatCurrency`, `router`.
- Produces: `InflationShieldWidget`, the `'inflationShield'` `WidgetKey`, and its `renderHomeWidget` case.

- [ ] **Step 1: Add the `WidgetKey`**

In `apps/mobile/src/stores/widgetVisibilityStore.ts`, add `'inflationShield'` to the `WIDGET_KEYS` array — insert it right after `'safeToSpend'` (so it sits high on the dashboard):
```ts
export const WIDGET_KEYS = [
  'familyFeed',
  'safeToSpend',
  'inflationShield',
  'financialHealth',
  // …rest unchanged…
] as const;
```

- [ ] **Step 2: Write the widget**

Create `apps/mobile/src/components/widgets/InflationShieldWidget.tsx`:

```tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useInflationShield } from '@/features/insights/useInflationShield';

export function InflationShieldWidget() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { data, hasEnoughData } = useInflationShield();

  // Hide the card entirely when there's nothing to show (no rising items AND
  // no realized savings) — nothing to stock up on, nothing to celebrate yet.
  const items = data?.items ?? [];
  const savedSoFar = data?.savedSoFar ?? 0;
  if (!hasEnoughData || (items.length === 0 && savedSoFar <= 0)) return null;

  const currency = data?.baseCurrency ?? 'USD';
  const top = items[0];

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push('/inflation-shield')}
    >
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.titleRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.title}>{t('inflationShield.title')}</Text>
      </View>
      {savedSoFar > 0 && (
        <Text style={styles.saved}>
          {t('inflationShield.savedSoFar')}: {formatCurrency(savedSoFar, currency)}
          <Text style={styles.estimate}> · {t('inflationShield.estimated')}</Text>
        </Text>
      )}
      {top && (
        <Text style={styles.tip} numberOfLines={1}>
          {t('inflationShield.buyAheadTip', {
            product: top.canonicalName,
            save: formatCurrency(top.projectedSaving, currency),
          })}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: { position: 'absolute' as const, top: theme.spacing[3], right: theme.spacing[3] },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  title: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  saved: { ...theme.textStyles.h3, color: theme.colors.success, marginTop: theme.spacing[2] },
  estimate: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  tip: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing[1] },
});
```
> NOTE: before writing, confirm `theme.textStyles` has `h3`/`bodyMedium`/`bodySm` and `theme.colors` has `success`/`borderLight`/`textTertiary` (the sibling widgets use these). If a token name differs, use the exact name the other widgets in this folder use.

- [ ] **Step 3: Barrel export**

In `apps/mobile/src/components/widgets/index.ts`, add:
```ts
export { InflationShieldWidget } from './InflationShieldWidget';
```

- [ ] **Step 4: Wire the switch case**

In `apps/mobile/src/components/home/HomeWidgetSwitch.tsx`:
1. Add `InflationShieldWidget` to the `@/components/widgets` import (line ~11).
2. Add a case in `renderHomeWidget` (next to the `safeToSpend`/`financialHealth` cases):
```ts
    case 'inflationShield':
      return widgetVisibility.inflationShield ? <InflationShieldWidget key="inflationShield" /> : null;
```
(The widget reads its own store/hook, so it needs no `ctx`.)

- [ ] **Step 5: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` (exit 0), then:
```bash
git add apps/mobile/src/components/widgets/InflationShieldWidget.tsx apps/mobile/src/components/widgets/index.ts apps/mobile/src/stores/widgetVisibilityStore.ts apps/mobile/src/components/home/HomeWidgetSwitch.tsx
git commit -m "feat(mobile): Inflation Shield home widget"
```

---

### Task 5: Shield screen

**Files:**
- Create: `apps/mobile/app/inflation-shield/index.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (route + header)

**Interfaces:**
- Consumes: `useInflationShield`, `formatCurrency`.
- Produces: the `inflation-shield/index` route.

- [ ] **Step 1: Write the screen**

Create `apps/mobile/app/inflation-shield/index.tsx`:

```tsx
import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useInflationShield } from '@/features/insights/useInflationShield';
import { useInflationShieldStore } from '@/stores/inflationShieldStore';

export default function InflationShieldScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { data, loading, hasEnoughData } = useInflationShield();
  const load = useInflationShieldStore((s) => s.load);

  const currency = data?.baseCurrency ?? 'USD';
  const items = data?.items ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.primary} />}
      >
        {/* Hero: saved so far */}
        <View style={styles.hero}>
          <Ionicons name="shield-checkmark" size={28} color={theme.colors.primary} />
          <Text style={styles.heroValue}>{formatCurrency(data?.savedSoFar ?? 0, currency)}</Text>
          <Text style={styles.heroLabel}>{t('inflationShield.savedSoFar')} · {t('inflationShield.estimated')}</Text>
          {data?.basketMonthlyForecastPct != null && (
            <Text style={styles.basket}>
              {t('inflationShield.basketForecast', { pct: data.basketMonthlyForecastPct.toFixed(1) })}
            </Text>
          )}
        </View>

        {loading && items.length === 0 ? (
          <ActivityIndicator style={styles.spinner} size="large" color={theme.colors.primary} />
        ) : !hasEnoughData || items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('inflationShield.empty')}</Text>
            <Text style={styles.emptySub}>{t('inflationShield.emptySub')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t('inflationShield.buyAheadTitle')}</Text>
            {items.map((it, idx) => (
              <View key={idx} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.canonicalName}</Text>
                  <Text style={styles.itemRise}>+{it.monthlyChangePct.toFixed(0)}%</Text>
                </View>
                <Text style={styles.itemAction}>
                  {t('inflationShield.buyAheadTip', { product: t('inflationShield.units', { count: it.quantity }), save: formatCurrency(it.projectedSaving, currency) })}
                </Text>
                <View style={styles.itemMeta}>
                  {it.store && <Text style={styles.itemStore}>{t('inflationShield.atStore', { store: it.store })}</Text>}
                  {it.affordableToday && (
                    <View style={styles.affordBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={theme.colors.success} />
                      <Text style={styles.affordText}>{t('inflationShield.affordable')}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
            {data?.fxApproximate && <Text style={styles.approx}>{t('inflationShield.approxRate')}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4] },
  hero: { alignItems: 'center' as const, paddingVertical: theme.spacing[6], gap: theme.spacing[1] },
  heroValue: { ...theme.textStyles.h1, color: theme.colors.success, marginTop: theme.spacing[2] },
  heroLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  basket: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: theme.spacing[2] },
  spinner: { paddingVertical: theme.spacing[10] },
  empty: { alignItems: 'center' as const, paddingVertical: theme.spacing[10], gap: theme.spacing[2] },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  emptySub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, textAlign: 'center' as const },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  itemHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  itemName: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1, marginRight: theme.spacing[2] },
  itemRise: { ...theme.textStyles.bodySmMedium, color: theme.colors.danger },
  itemAction: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing[1] },
  itemMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3], marginTop: theme.spacing[2] },
  itemStore: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  affordBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[1] },
  affordText: { ...theme.textStyles.caption, color: theme.colors.success },
  approx: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: theme.spacing[2], textAlign: 'center' as const },
});
```
> NOTE: confirm the `theme.textStyles` keys used (`h1`/`bodySmMedium`/`caption`) exist; if any differs, use the nearest existing token another screen uses. The i18n key `inflationShield.units` uses an i18next count/plural form — see Task 6.

- [ ] **Step 2: Register the route + header**

In `apps/mobile/app/_layout.tsx`, add a `<Stack.Screen>` entry (next to the `shopping-list/index` / `purchase-requests/index` entries):
```tsx
<Stack.Screen
  name="inflation-shield/index"
  options={{
    headerShown: true,
    title: t('inflationShield.title'),
  }}
/>
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` (exit 0), then:
```bash
git add apps/mobile/app/inflation-shield/index.tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): Inflation Shield screen"
```

---

### Task 6: i18n namespace ×9

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Produces: the `inflationShield` translation namespace consumed by Tasks 4–5.

- [ ] **Step 1: Add the namespace to each locale**

In EACH of the 9 locale files, add an `inflationShield` namespace next to the existing `safeToSpend` namespace. English (`en.ts`):
```ts
    inflationShield: {
      title: 'Inflation Shield',
      savedSoFar: 'Saved so far',
      estimated: 'estimated',
      basketForecast: 'Your basket: ~{{pct}}% next month',
      buyAheadTitle: 'Buy ahead & save',
      buyAheadTip: 'Buy {{product}} now — save ~{{save}}',
      units: '{{count}} unit',
      units_other: '{{count}} units',
      atStore: 'at {{store}}',
      affordable: 'Affordable today',
      approxRate: 'Amounts use approximate exchange rates',
      empty: 'Nothing to stock up on right now',
      emptySub: 'Scan a few receipts so we can spot rising prices for you',
    },
```
Provide the same keys in the other 8 locales (de/es/fr/pl/ru/ua/be/nl), translating each value. For Slavic plurals (ru/ua/be/pl), i18next uses `units_one`/`units_few`/`units_many` — provide those forms instead of `units`/`units_other` (e.g. ru: `units_one: '{{count}} шт'`, `units_few: '{{count}} шт'`, `units_many: '{{count}} шт'` — "шт" is invariant, so all three can be the same). For de/es/fr/nl use `units`/`units_other`. Keep `{{pct}}`, `{{save}}`, `{{store}}`, `{{product}}`, `{{count}}` placeholders identical across all locales.
> NOTE: use the i18n-add-strings conventions — every key present in all 9 files, placeholders identical. Translate naturally; keep "estimated"/"approximate" qualifiers so savings never read as guaranteed.

- [ ] **Step 2: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` (exit 0), then:
```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): inflationShield i18n (9 locales)"
```

---

## Definition of Done (Plan 4)

- The home dashboard shows an **Inflation Shield** widget (when there's data) with "Saved X (estimated)" + a top buy-ahead tip; tapping opens the full screen.
- `app/inflation-shield/index.tsx` lists rising products with "Buy N — save ~X", store hint, and an "affordable today" badge, plus a hero "saved so far" and basket forecast; pull-to-refresh reloads; empty state prompts scanning receipts.
- Store is MMKV-cached (instant paint) and free (no upgrade gate); savings framed as estimates; `inflationShield` i18n in all 9 locales.
- Mobile `tsc` clean; store unit tests pass.

## Out of scope / Follow-ups (later plans)

- **Shareable-image card** (WrappedShareCard-style hidden-webview → canvas → PNG → expo-sharing, with text fallback).
- **Shopping-list "buy ahead" strip** (add K units to the active list).
- **Community-price boost** (cheapest store).
- **Proactive push** (`notifyInflationShield` + cron + `notification-i18n` × 9).
- A Settings-hub entry to reach the screen even when the widget is hidden (empty-data users).
