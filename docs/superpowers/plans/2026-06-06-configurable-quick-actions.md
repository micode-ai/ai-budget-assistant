# Configurable Home Quick Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home-screen quick-action strip configurable (per-action visibility + drag reorder), with voice-income and scan-invoice hidden by default.

**Architecture:** A new MMKV-backed `quickActionStore` (mirrors `widgetVisibilityStore`) holds visibility + order. The home strip becomes data-driven over the store. A reusable `ReorderableToggleList` component is extracted from `settings/widgets.tsx` and drives two sections (quick actions + widgets) on the same settings screen.

**Tech Stack:** React Native / Expo, Zustand, react-native-mmkv, react-i18next, Jest (jest-expo).

---

## File Structure

- **new** `apps/mobile/src/stores/quickActionStore.ts` — store + pure default-resolution helpers (exported for test)
- **new** `apps/mobile/src/stores/__tests__/quickActionStore.test.ts` — unit tests for default logic
- **new** `apps/mobile/src/components/ReorderableToggleList.tsx` — generic drag + toggle list (extracted from widgets.tsx)
- **modify** `apps/mobile/app/settings/widgets.tsx` — two sections using the new component
- **modify** `apps/mobile/app/(tabs)/index.tsx` — data-driven quick-action strip
- **modify** `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts` — 2 new section-header keys each

---

## Task 1: Quick-action store with per-key default visibility

**Files:**
- Create: `apps/mobile/src/stores/quickActionStore.ts`
- Test: `apps/mobile/src/stores/__tests__/quickActionStore.test.ts`

The store mirrors `apps/mobile/src/stores/widgetVisibilityStore.ts`, but visibility
defaults are per-key (voice_income + scan_invoice default OFF). To make this
testable without mocking MMKV, the merge logic is two pure exported functions
that take the raw stored values; the store wires them to the real MMKV getter.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/stores/__tests__/quickActionStore.test.ts`:

```ts
import {
  QUICK_ACTION_KEYS,
  DEFAULT_VISIBILITY,
  resolveVisibility,
  resolveOrder,
} from '../quickActionStore';

describe('quickActionStore default resolution', () => {
  it('defaults voice_income and scan_invoice to hidden, everything else visible', () => {
    const vis = resolveVisibility(() => undefined);
    expect(vis.voice_income).toBe(false);
    expect(vis.scan_invoice).toBe(false);
    expect(vis.add_expense).toBe(true);
    expect(vis.scan_receipt).toBe(true);
    expect(vis.voice_expense).toBe(true);
    expect(vis.exchange).toBe(true);
    expect(vis.converter).toBe(true);
    expect(vis.transfers).toBe(true);
  });

  it('DEFAULT_VISIBILITY covers every key', () => {
    for (const k of QUICK_ACTION_KEYS) {
      expect(typeof DEFAULT_VISIBILITY[k]).toBe('boolean');
    }
  });

  it('explicit stored value wins over the default', () => {
    const read = (k: string) => (k === 'voice_income' ? 'true' : undefined);
    expect(resolveVisibility(read).voice_income).toBe(true);
  });

  it('explicit "false" hides a default-on action', () => {
    const read = (k: string) => (k === 'add_expense' ? 'false' : undefined);
    expect(resolveVisibility(read).add_expense).toBe(false);
  });

  it('order defaults to QUICK_ACTION_KEYS when unset', () => {
    expect(resolveOrder(undefined)).toEqual([...QUICK_ACTION_KEYS]);
  });

  it('order drops unknown keys and appends missing ones', () => {
    const stored = JSON.stringify(['transfers', 'bogus', 'add_expense']);
    const out = resolveOrder(stored);
    expect(out[0]).toBe('transfers');
    expect(out[1]).toBe('add_expense');
    expect(out).not.toContain('bogus');
    expect([...out].sort()).toEqual([...QUICK_ACTION_KEYS].sort());
  });

  it('order falls back to default on malformed JSON', () => {
    expect(resolveOrder('{not json')).toEqual([...QUICK_ACTION_KEYS]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/stores/__tests__/quickActionStore.test.ts`
Expected: FAIL — cannot find module `../quickActionStore`.

- [ ] **Step 3: Write the store**

Create `apps/mobile/src/stores/quickActionStore.ts`:

```ts
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

export const QUICK_ACTION_KEYS = [
  'add_expense',
  'scan_receipt',
  'voice_expense',
  'voice_income',
  'scan_invoice',
  'exchange',
  'converter',
  'transfers',
] as const;

export type QuickActionKey = (typeof QUICK_ACTION_KEYS)[number];

// Per-key default visibility. Income-capture actions ship hidden.
export const DEFAULT_VISIBILITY: Record<QuickActionKey, boolean> = {
  add_expense: true,
  scan_receipt: true,
  voice_expense: true,
  voice_income: false,
  scan_invoice: false,
  exchange: true,
  converter: true,
  transfers: true,
};

const mmkv = new MMKV({ id: 'quick-actions' });

// Pure: resolve visibility from a raw string getter (MMKV or a test fake).
export const resolveVisibility = (
  read: (key: string) => string | undefined,
): Record<QuickActionKey, boolean> => {
  const result = {} as Record<QuickActionKey, boolean>;
  for (const key of QUICK_ACTION_KEYS) {
    const val = read(key);
    result[key] = val === undefined ? DEFAULT_VISIBILITY[key] : val === 'true';
  }
  return result;
};

// Pure: resolve order from the raw stored JSON string (or undefined).
export const resolveOrder = (raw: string | undefined): QuickActionKey[] => {
  if (!raw) return [...QUICK_ACTION_KEYS];
  try {
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((k): k is QuickActionKey =>
      (QUICK_ACTION_KEYS as readonly string[]).includes(k),
    );
    const missing = QUICK_ACTION_KEYS.filter((k) => !valid.includes(k));
    return [...valid, ...missing];
  } catch {
    return [...QUICK_ACTION_KEYS];
  }
};

interface QuickActionState {
  visibility: Record<QuickActionKey, boolean>;
  order: QuickActionKey[];
  toggle: (key: QuickActionKey) => void;
  setVisible: (key: QuickActionKey, visible: boolean) => void;
  reorder: (newOrder: QuickActionKey[]) => void;
  resetOrder: () => void;
}

export const useQuickActionStore = create<QuickActionState>((set) => ({
  visibility: resolveVisibility((k) => mmkv.getString(k)),
  order: resolveOrder(mmkv.getString('quick-action-order')),

  toggle: (key) =>
    set((s) => {
      const next = !s.visibility[key];
      mmkv.set(key, String(next));
      return { visibility: { ...s.visibility, [key]: next } };
    }),

  setVisible: (key, visible) =>
    set((s) => {
      mmkv.set(key, String(visible));
      return { visibility: { ...s.visibility, [key]: visible } };
    }),

  reorder: (newOrder) =>
    set(() => {
      const valid = newOrder.filter((k): k is QuickActionKey =>
        (QUICK_ACTION_KEYS as readonly string[]).includes(k),
      );
      const missing = QUICK_ACTION_KEYS.filter((k) => !valid.includes(k));
      const finalOrder = [...valid, ...missing];
      mmkv.set('quick-action-order', JSON.stringify(finalOrder));
      return { order: finalOrder };
    }),

  resetOrder: () =>
    set(() => {
      const defaultOrder = [...QUICK_ACTION_KEYS];
      mmkv.set('quick-action-order', JSON.stringify(defaultOrder));
      return { order: defaultOrder };
    }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/stores/__tests__/quickActionStore.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/quickActionStore.ts apps/mobile/src/stores/__tests__/quickActionStore.test.ts
git commit -m "Add quickActionStore with per-key default visibility"
```

---

## Task 2: Extract reusable ReorderableToggleList component

**Files:**
- Create: `apps/mobile/src/components/ReorderableToggleList.tsx`

Extract the drag-reorder + toggle UI from `apps/mobile/app/settings/widgets.tsx`
verbatim (same PanResponder math), parameterized by key set / order / labels and
callbacks. It owns its local-order drag state and reports drag start/stop via
`onDraggingChange` so the parent can disable scrolling.

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/components/ReorderableToggleList.tsx`:

```tsx
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  Animated,
  PanResponder,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const ITEM_HEIGHT = 56;

interface ReorderableToggleListProps<K extends string> {
  keys: readonly K[];
  order: K[];
  visibility: Record<K, boolean>;
  labels: Record<K, string>;
  onReorder: (next: K[]) => void;
  onToggle: (key: K, visible: boolean) => void;
  onDraggingChange?: (dragging: boolean) => void;
}

export function ReorderableToggleList<K extends string>({
  keys,
  order,
  visibility,
  labels,
  onReorder,
  onToggle,
  onDraggingChange,
}: ReorderableToggleListProps<K>) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [localOrder, setLocalOrder] = useState<K[]>(order);
  const [activeKey, setActiveKey] = useState<K | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const localOrderRef = useRef<K[]>(order);
  const storeOrderRef = useRef<K[]>(order);
  storeOrderRef.current = order;
  const dragStartIndex = useRef(-1);
  const dragKey = useRef<K | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    onDraggingChange?.(isDragging);
  }, [isDragging, onDraggingChange]);

  // Keep localOrder in sync with the store when not dragging.
  const latestOrder = useRef(order);
  if (!isDragging && order !== latestOrder.current) {
    latestOrder.current = order;
    setLocalOrder(order);
    localOrderRef.current = order;
  }

  const createDragResponder = useCallback(
    (key: K) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: () => {
          dragKey.current = key;
          dragStartIndex.current = localOrderRef.current.indexOf(key);
          translateY.setValue(0);
          setActiveKey(key);
          setIsDragging(true);
        },

        onPanResponderMove: (_, gs) => {
          const dy = gs.dy;
          const total = localOrderRef.current.length;
          const currentIdx = localOrderRef.current.indexOf(dragKey.current!);

          const logicalIdx = Math.max(
            0,
            Math.min(total - 1, Math.round(dragStartIndex.current + dy / ITEM_HEIGHT)),
          );

          const visualOffset = dy - (logicalIdx - dragStartIndex.current) * ITEM_HEIGHT;
          translateY.setValue(visualOffset);

          if (logicalIdx !== currentIdx) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setLocalOrder((prev) => {
              const next = [...prev];
              next.splice(currentIdx, 1);
              next.splice(logicalIdx, 0, dragKey.current!);
              localOrderRef.current = next;
              return next;
            });
          }
        },

        onPanResponderRelease: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          setActiveKey(null);
          setIsDragging(false);
          onReorder(localOrderRef.current);
        },

        onPanResponderTerminate: () => {
          translateY.setValue(0);
          setActiveKey(null);
          setIsDragging(false);
          const restored = storeOrderRef.current;
          setLocalOrder(restored);
          localOrderRef.current = restored;
        },
      }).panHandlers,
    [translateY, onReorder],
  );

  // Per-key responder cache; invalidate when createDragResponder identity changes.
  const responders = useRef<Partial<Record<K, ReturnType<typeof createDragResponder>>>>({});
  const lastCreateFn = useRef(createDragResponder);
  if (lastCreateFn.current !== createDragResponder) {
    lastCreateFn.current = createDragResponder;
    responders.current = {};
  }
  for (const key of keys) {
    if (!responders.current[key]) {
      responders.current[key] = createDragResponder(key);
    }
  }

  return (
    <View style={styles.card}>
      {localOrder.map((key, index) => {
        const isActive = activeKey === key;
        const isHidden = !visibility[key];

        return (
          <View key={key}>
            <Animated.View
              style={[
                styles.fieldRow,
                isHidden && styles.fieldRowHidden,
                isActive && styles.fieldRowActive,
                isActive && { transform: [{ translateY }] },
              ]}
            >
              <View style={styles.dragHandle} {...(responders.current[key] ?? {})}>
                <Ionicons
                  name="reorder-three-outline"
                  size={24}
                  color={isHidden ? theme.colors.textDisabled : theme.colors.textTertiary}
                />
              </View>

              <Text style={[styles.fieldLabel, isHidden && styles.fieldLabelHidden]}>
                {labels[key]}
              </Text>

              <Switch
                value={visibility[key]}
                onValueChange={(v) => onToggle(key, v)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </Animated.View>
            {index < localOrder.length - 1 && <View style={styles.divider} />}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: ITEM_HEIGHT,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  fieldRowHidden: {
    opacity: 0.45,
  },
  fieldRowActive: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: theme.isDark ? 0.4 : 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  dragHandle: {
    width: 40,
    height: ITEM_HEIGHT,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing[2],
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  fieldLabelHidden: {
    color: theme.colors.textDisabled,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginLeft: 40 + theme.spacing[2],
  },
});
```

- [ ] **Step 2: Typecheck the new component**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors referencing `ReorderableToggleList.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/ReorderableToggleList.tsx
git commit -m "Extract ReorderableToggleList component"
```

---

## Task 3: Rebuild settings/widgets.tsx with two sections

**Files:**
- Modify: `apps/mobile/app/settings/widgets.tsx` (full rewrite of the screen body)

Replace the inline drag machinery with two `ReorderableToggleList` instances —
Quick actions first, then Widgets — each with its own reset button. The screen
disables scroll while either list drags.

- [ ] **Step 1: Replace the screen file**

Overwrite `apps/mobile/app/settings/widgets.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  useWidgetVisibilityStore,
  WIDGET_KEYS,
  type WidgetKey,
} from '@/stores/widgetVisibilityStore';
import {
  useQuickActionStore,
  QUICK_ACTION_KEYS,
  type QuickActionKey,
} from '@/stores/quickActionStore';
import { ReorderableToggleList } from '@/components/ReorderableToggleList';
import { useStyles, useTheme, type Theme } from '@/theme';

export default function WidgetsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const widgets = useWidgetVisibilityStore();
  const quickActions = useQuickActionStore();

  const [quickDragging, setQuickDragging] = useState(false);
  const [widgetDragging, setWidgetDragging] = useState(false);

  const quickActionLabels: Record<QuickActionKey, string> = {
    add_expense: t('dashboard.addExpense'),
    scan_receipt: t('dashboard.scanReceipt'),
    voice_expense: t('dashboard.voiceInput'),
    voice_income: t('dashboard.voiceIncome'),
    scan_invoice: t('dashboard.scanInvoice'),
    exchange: t('dashboard.exchangeCurrency'),
    converter: t('dashboard.currencyConverter'),
    transfers: t('dashboard.transfers'),
  };

  const widgetLabels: Record<WidgetKey, string> = {
    financialHealth: t('settings.widget.financialHealth'),
    gamification: t('settings.widget.gamification'),
    monthlyBudget: t('settings.widget.monthlyBudget'),
    incomeExpenses: t('settings.widget.incomeExpenses'),
    debts: t('settings.widget.debts'),
    netProfit: t('settings.widget.netProfit'),
    netCapital: t('settings.widget.netCapital'),
    fatFinder: t('settings.widget.fatFinder'),
    calendar: t('settings.widget.calendar'),
    goals: t('settings.widget.goals'),
    wallets: t('settings.widget.wallets'),
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        scrollEnabled={!quickDragging && !widgetDragging}
      >
        <Text style={styles.hint}>{t('settings.widgetsReorderHint')}</Text>

        <Text style={styles.sectionTitle}>{t('settings.quickActionsTitle')}</Text>
        <ReorderableToggleList
          keys={QUICK_ACTION_KEYS}
          order={quickActions.order}
          visibility={quickActions.visibility}
          labels={quickActionLabels}
          onReorder={quickActions.reorder}
          onToggle={quickActions.setVisible}
          onDraggingChange={setQuickDragging}
        />
        <TouchableOpacity
          style={styles.resetButton}
          onPress={quickActions.resetOrder}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={theme.colors.textTertiary} />
          <Text style={styles.resetButtonText}>{t('settings.widgetsResetOrder')}</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
          {t('settings.widgetsTitle')}
        </Text>
        <ReorderableToggleList
          keys={WIDGET_KEYS}
          order={widgets.order}
          visibility={widgets.visibility}
          labels={widgetLabels}
          onReorder={widgets.reorder}
          onToggle={widgets.setVisible}
          onDraggingChange={setWidgetDragging}
        />
        <TouchableOpacity
          style={styles.resetButton}
          onPress={widgets.resetOrder}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={theme.colors.textTertiary} />
          <Text style={styles.resetButtonText}>{t('settings.widgetsResetOrder')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
    textAlign: 'center' as const,
  },
  sectionTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
    textTransform: 'uppercase' as const,
  },
  sectionTitleSpaced: {
    marginTop: theme.spacing[6],
  },
  resetButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  resetButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors. (`settings.quickActionsTitle` / `settings.widgetsTitle` are
plain `t()` string keys, not typed — added in Task 5; no compile dependency.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/settings/widgets.tsx
git commit -m "Use ReorderableToggleList for quick actions + widgets sections"
```

---

## Task 4: Data-driven quick-action strip on the home screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx:106-184` (the `ICON_BOX` const + quick-actions block)

Replace the 8 hardcoded buttons with a render over the store's filtered order.
Icons stay keyed by action (images vs Ionicons differ), kept in a render helper.

- [ ] **Step 1: Add the store import**

In `apps/mobile/app/(tabs)/index.tsx`, after the existing widget-store import
(line 32 `import { useWidgetVisibilityStore } ...`), add:

```tsx
import { useQuickActionStore, type QuickActionKey } from '@/stores/quickActionStore';
```

- [ ] **Step 2: Read the store in the component**

After the existing line:
```tsx
  const { visibility: widgetVisibility, order: widgetOrder } = useWidgetVisibilityStore();
```
add:
```tsx
  const { visibility: quickActionVisibility, order: quickActionOrder } = useQuickActionStore();
```

- [ ] **Step 3: Define route map + icon renderer above the return**

Immediately before `const ICON_BOX = 48;` insert:

```tsx
  const quickActionRoutes: Record<QuickActionKey, string> = {
    add_expense: '/expense/new',
    scan_receipt: '/expense/receipt',
    voice_expense: '/expense/voice',
    voice_income: '/income/voice',
    scan_invoice: '/income/receipt',
    exchange: '/wallet/exchange',
    converter: '/converter',
    transfers: '/wallet/transfer',
  };

  const quickActionLabelKey: Record<QuickActionKey, string> = {
    add_expense: 'dashboard.addExpense',
    scan_receipt: 'dashboard.scanReceipt',
    voice_expense: 'dashboard.voiceInput',
    voice_income: 'dashboard.voiceIncome',
    scan_invoice: 'dashboard.scanInvoice',
    exchange: 'dashboard.exchangeCurrency',
    converter: 'dashboard.currencyConverter',
    transfers: 'dashboard.transfers',
  };

  const renderQuickActionIcon = (key: QuickActionKey) => {
    switch (key) {
      case 'add_expense':
        return <Image source={quickActionIcons.add_expense} style={styles.quickActionImage} />;
      case 'scan_receipt':
        return <Image source={quickActionIcons.scan_receipt} style={styles.quickActionImage} />;
      case 'voice_expense':
        return <Image source={quickActionIcons.voice_input} style={styles.quickActionImage} />;
      case 'voice_income':
        return (
          <Image
            source={quickActionIcons.voice_input}
            style={[styles.quickActionImage, { tintColor: theme.colors.success }]}
          />
        );
      case 'scan_invoice':
        return (
          <Image
            source={quickActionIcons.scan_receipt}
            style={[styles.quickActionImage, { tintColor: theme.colors.success }]}
          />
        );
      case 'exchange':
        return <Image source={quickActionIcons.exchange} style={styles.quickActionImage} />;
      case 'converter':
        return <Image source={quickActionIcons.converter} style={{ width: 28, height: 28 }} />;
      case 'transfers':
        return <Ionicons name="swap-horizontal-outline" size={28} color={theme.colors.primary} />;
    }
  };

  const visibleQuickActions = quickActionOrder.filter((k) => quickActionVisibility[k]);
```

- [ ] **Step 4: Replace the hardcoded strip**

Replace the whole quick-actions block (currently lines ~127-184, from
`{canEdit && (` through its closing `)}` that wraps `styles.quickActionsWrapper`)
with:

```tsx
      {canEdit && visibleQuickActions.length > 0 && (
        <View style={styles.quickActionsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsRow}
          >
            {visibleQuickActions.map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.quickActionButton}
                onPress={() => router.push(quickActionRoutes[key] as any)}
              >
                <View style={[styles.quickActionIcon, { width: ICON_BOX, height: ICON_BOX }]}>
                  {renderQuickActionIcon(key)}
                </View>
                <Text style={styles.quickActionText} numberOfLines={2}>
                  {t(quickActionLabelKey[key])}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/(tabs)/index.tsx
git commit -m "Render home quick-action strip from quickActionStore"
```

---

## Task 5: Add section-header i18n keys to all 9 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts` (+ de, es, fr, pl, ru, ua, be, nl)

Add two keys inside the `settings` object, next to `widgetsResetOrder`
(after the `widgetsResetOrder: ...` line, before `widget: {`):

- [ ] **Step 1: Add keys to each locale**

`en.ts`:
```ts
    quickActionsTitle: 'Quick actions',
    widgetsTitle: 'Widgets',
```

`ru.ts`:
```ts
    quickActionsTitle: 'Быстрые действия',
    widgetsTitle: 'Виджеты',
```

`ua.ts`:
```ts
    quickActionsTitle: 'Швидкі дії',
    widgetsTitle: 'Віджети',
```

`be.ts`:
```ts
    quickActionsTitle: 'Хуткія дзеянні',
    widgetsTitle: 'Віджэты',
```

`de.ts`:
```ts
    quickActionsTitle: 'Schnellaktionen',
    widgetsTitle: 'Widgets',
```

`es.ts`:
```ts
    quickActionsTitle: 'Acciones rápidas',
    widgetsTitle: 'Widgets',
```

`fr.ts`:
```ts
    quickActionsTitle: 'Actions rapides',
    widgetsTitle: 'Widgets',
```

`pl.ts`:
```ts
    quickActionsTitle: 'Szybkie akcje',
    widgetsTitle: 'Widżety',
```

`nl.ts`:
```ts
    quickActionsTitle: 'Snelle acties',
    widgetsTitle: 'Widgets',
```

Insert each pair immediately after that locale's `widgetsResetOrder:` line. If a
locale's `settings` object uses a different key for the reset label, place the
pair just before its `widget: {` sub-object instead.

- [ ] **Step 2: Verify all 9 locales have both keys**

Run:
```bash
cd apps/mobile && for f in en de es fr pl ru ua be nl; do \
  printf "%s: " "$f"; \
  grep -c "quickActionsTitle\|widgetsTitle" "src/i18n/locales/$f.ts"; \
done
```
Expected: each line ends in `2`.

- [ ] **Step 3: Typecheck (locale shape parity)**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (locale files share a type; a missing key in one would fail).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "i18n: quick actions + widgets section headers (9 locales)"
```

---

## Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the store unit tests**

Run: `cd apps/mobile && npx jest src/stores/__tests__/quickActionStore.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 2: Typecheck the whole mobile app**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint the touched files**

Run: `cd apps/mobile && npx eslint app/\(tabs\)/index.tsx app/settings/widgets.tsx src/components/ReorderableToggleList.tsx src/stores/quickActionStore.ts`
Expected: no errors.

- [ ] **Step 4: Manual smoke (device/emulator or web)**

Verify:
1. Fresh state (clear app data / new MMKV): home strip shows 6 actions; **Voice Income** and **Scan Invoice** are absent.
2. Settings → Dashboard Widgets: a **Quick actions** section lists all 8 actions; voice-income + scan-invoice toggles are OFF.
3. Toggle Voice Income ON → it appears on the home strip immediately.
4. Drag to reorder a quick action → order persists after app restart.
5. Reorder a widget (second section) → still works (regression check).
6. "Reset to default order" under Quick actions restores `QUICK_ACTION_KEYS` order.
7. Turn every quick action OFF → the strip bar disappears (no empty bar).

---

## Task 7: Finish the task (issue + docs)

- [ ] **Step 1:** Invoke the `finish-aba-task` skill to create the ABA-{N} GitHub issue and update `CLAUDE.md` (mobile section: note the new `quickActionStore`, the data-driven strip, the `ReorderableToggleList` component, and the two-section widgets settings screen) + any relevant `user_docs/` help section. Bump CHANGELOG only if a version bump is part of this work (it is not by default).
