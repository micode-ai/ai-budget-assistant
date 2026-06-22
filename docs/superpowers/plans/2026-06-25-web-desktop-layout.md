# Web Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Expo-web SPA a centered desktop layout (left sidebar + max-width content column) on screens ≥1024px wide, while leaving native mobile and narrow-web UI byte-for-byte unchanged.

**Architecture:** A single new `WebShell` component wraps the root `<Stack>` in `app/_layout.tsx`. On native or narrow web it is a pure pass-through (renders `children` unchanged — this is the mobile guarantee). On `web && width ≥ 1024` it renders a left `WebSidebar` (when authenticated and off the auth routes) plus a centered, max-width column around the screen content. The bottom tab bar hides on desktop. A `useContentWidth()` hook lets the four width-measuring chart components fit the column instead of the full window.

**Tech Stack:** Expo Router, React Native + react-native-web, Zustand (`useAuthStore`), `useWindowDimensions`, `usePathname` / `router` from expo-router, TypeScript.

## Global Constraints

- Desktop behavior is gated on `Platform.OS === 'web' && width >= 1024` — copied verbatim everywhere. Native iOS/Android must never enter the desktop branch.
- `DESKTOP_MIN_WIDTH = 1024`, `CONTENT_MAX_WIDTH = 760`, `SIDEBAR_WIDTH = 240` — single source of truth in `src/components/webLayout.constants.ts`; never hardcode these numbers elsewhere.
- No changes to theming, business logic, API, stores, SQLite, or i18n copy. Reuse existing i18n keys for nav labels (`nav.dashboard`, `nav.expenses`, `nav.budgets`, `nav.analytics`, `nav.aiChat`, `alerts.title`, `nav.settings`).
- Home / Analytics stay single-column — no widget-grid reflow.
- The mobile app has no automated RN render-test harness for screens; verification for layout is manual via `npm run dev:web`. Pure helper logic (the width math, the gate) gets unit tests where the repo already runs Jest (`apps/mobile` uses `jest` — see existing `src/stores/__tests__`).
- Follow the project rule: any new screen/component that is navigable must keep its existing header; we are not adding navigable screens here, only a chrome wrapper.

---

## File Structure

- `src/components/webLayout.constants.ts` (new) — shared constants + the `useIsDesktopWeb()` gate hook.
- `src/hooks/useContentWidth.ts` (new) — returns the width charts should size against.
- `src/components/WebSidebar.tsx` (new) — presentational desktop sidebar (web-only, mounted only by WebShell on desktop).
- `src/components/WebShell.tsx` (new) — wrapper around the root `<Stack>`; pass-through on mobile/narrow, sidebar+column on desktop.
- `app/_layout.tsx` (modify) — wrap `<Stack>` in `<WebShell>`.
- `app/(tabs)/_layout.tsx` (modify) — hide bottom tab bar on desktop web.
- `src/components/wallet/WalletMonthlyChart.tsx` (modify) — use `useContentWidth()`.
- `src/components/interactive-charts/InteractiveLineChart.tsx` (modify) — use `useContentWidth()`.
- `src/components/interactive-charts/InteractiveBarChart.tsx` (modify) — use `useContentWidth()`.
- `src/components/insights/InsightCarousel.tsx` (modify) — use `useContentWidth()`.

---

### Task 1: Shared constants + desktop gate hook

**Files:**
- Create: `apps/mobile/src/components/webLayout.constants.ts`
- Test: `apps/mobile/src/components/__tests__/webLayout.constants.test.ts`

**Interfaces:**
- Produces:
  - `export const DESKTOP_MIN_WIDTH = 1024`
  - `export const CONTENT_MAX_WIDTH = 760`
  - `export const SIDEBAR_WIDTH = 240`
  - `export const COLUMN_HORIZONTAL_PADDING = 16`
  - `export function isDesktopWeb(width: number): boolean` — pure: `Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH`
  - `export function useIsDesktopWeb(): boolean` — calls `useWindowDimensions()` and returns `isDesktopWeb(width)`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/components/__tests__/webLayout.constants.test.ts
import { Platform } from 'react-native';
import {
  DESKTOP_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  SIDEBAR_WIDTH,
  isDesktopWeb,
} from '../webLayout.constants';

describe('webLayout constants', () => {
  it('exposes the agreed dimensions', () => {
    expect(DESKTOP_MIN_WIDTH).toBe(1024);
    expect(CONTENT_MAX_WIDTH).toBe(760);
    expect(SIDEBAR_WIDTH).toBe(240);
  });
});

describe('isDesktopWeb', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });

  it('is false on native regardless of width', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    expect(isDesktopWeb(1920)).toBe(false);
  });

  it('is false on narrow web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(isDesktopWeb(800)).toBe(false);
  });

  it('is true on wide web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(isDesktopWeb(1024)).toBe(true);
    expect(isDesktopWeb(1600)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/components/__tests__/webLayout.constants.test.ts`
Expected: FAIL — cannot find module `../webLayout.constants`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/components/webLayout.constants.ts
import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_MIN_WIDTH = 1024;
export const CONTENT_MAX_WIDTH = 760;
export const SIDEBAR_WIDTH = 240;
export const COLUMN_HORIZONTAL_PADDING = 16;

/** Pure gate — true only on web at desktop width. Native never qualifies. */
export function isDesktopWeb(width: number): boolean {
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

/** Reactive hook form: re-evaluates on browser resize. */
export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return isDesktopWeb(width);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/components/__tests__/webLayout.constants.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/webLayout.constants.ts apps/mobile/src/components/__tests__/webLayout.constants.test.ts
git commit -m "feat(web): add desktop layout constants and gate hook"
```

---

### Task 2: `useContentWidth` hook

**Files:**
- Create: `apps/mobile/src/hooks/useContentWidth.ts`
- Test: `apps/mobile/src/hooks/__tests__/contentWidth.test.ts`

**Interfaces:**
- Consumes: `isDesktopWeb`, `CONTENT_MAX_WIDTH`, `COLUMN_HORIZONTAL_PADDING` from `webLayout.constants`.
- Produces:
  - `export function contentWidthFor(windowWidth: number): number` — pure: on desktop web returns `CONTENT_MAX_WIDTH - COLUMN_HORIZONTAL_PADDING * 2`; otherwise returns `windowWidth`.
  - `export function useContentWidth(): number` — hook wrapping `useWindowDimensions()` + `contentWidthFor`.

Note: charts already subtract their own paddings from the returned width (e.g. `width - 64`). `contentWidthFor` returns the **column content width**, so on desktop the chart's own subtraction still applies on top — this is intentional and matches how the window-width value was used before.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/hooks/__tests__/contentWidth.test.ts
import { Platform } from 'react-native';
import { contentWidthFor } from '../useContentWidth';
import { CONTENT_MAX_WIDTH, COLUMN_HORIZONTAL_PADDING } from '../../components/webLayout.constants';

describe('contentWidthFor', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });

  it('returns the window width on native (mobile unchanged)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    expect(contentWidthFor(412)).toBe(412);
  });

  it('returns the window width on narrow web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(contentWidthFor(800)).toBe(800);
  });

  it('returns the padded column width on desktop web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(contentWidthFor(1600)).toBe(CONTENT_MAX_WIDTH - COLUMN_HORIZONTAL_PADDING * 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/hooks/__tests__/contentWidth.test.ts`
Expected: FAIL — cannot find module `../useContentWidth`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/hooks/useContentWidth.ts
import { useWindowDimensions } from 'react-native';
import {
  isDesktopWeb,
  CONTENT_MAX_WIDTH,
  COLUMN_HORIZONTAL_PADDING,
} from '@/components/webLayout.constants';

/** Width that measured content (charts, carousels) should size against. */
export function contentWidthFor(windowWidth: number): number {
  if (isDesktopWeb(windowWidth)) {
    return CONTENT_MAX_WIDTH - COLUMN_HORIZONTAL_PADDING * 2;
  }
  return windowWidth;
}

export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return contentWidthFor(width);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/hooks/__tests__/contentWidth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/useContentWidth.ts apps/mobile/src/hooks/__tests__/contentWidth.test.ts
git commit -m "feat(web): add useContentWidth hook for desktop column sizing"
```

---

### Task 3: `WebSidebar` component

**Files:**
- Create: `apps/mobile/src/components/WebSidebar.tsx`

**Interfaces:**
- Consumes: `SIDEBAR_WIDTH` from `webLayout.constants`; `useTheme` from `@/theme`; `usePathname`, `router` from `expo-router`; `useTranslation`; `useAlertStore` from `@/stores/alertStore` (unread badge).
- Produces: `export function WebSidebar(): JSX.Element` — a fixed-width vertical nav. No props.

Pattern reference: nav icons/labels mirror `app/(tabs)/_layout.tsx`. Active-route detection uses `usePathname()` and `startsWith` on each item's route base.

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/src/components/WebSidebar.tsx
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useAlertStore } from '@/stores/alertStore';
import { SIDEBAR_WIDTH } from '@/components/webLayout.constants';

const tabIcons = {
  home: require('../../assets/widget-icons/home.png'),
  transactions: require('../../assets/widget-icons/transactions.png'),
  budget: require('../../assets/widget-icons/budget.png'),
  analytics: require('../../assets/widget-icons/analytics.png'),
  ai_chat: require('../../assets/widget-icons/ai_chat.png'),
};

export function WebSidebar() {
  const theme = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname();
  const unreadAlertCount = useAlertStore((s) => s.unreadCount);

  // route base used for both navigation and active-state matching
  const primary = [
    { key: 'home', route: '/(tabs)', match: ['/', '/index'], label: t('nav.dashboard'), img: tabIcons.home },
    { key: 'expenses', route: '/(tabs)/expenses', match: ['/expenses'], label: t('nav.expenses'), img: tabIcons.transactions },
    { key: 'budgets', route: '/(tabs)/budgets', match: ['/budgets'], label: t('nav.budgets'), img: tabIcons.budget },
    { key: 'analytics', route: '/(tabs)/analytics', match: ['/analytics'], label: t('nav.analytics'), img: tabIcons.analytics },
    { key: 'chat', route: '/(tabs)/chat', match: ['/chat'], label: t('nav.aiChat'), img: tabIcons.ai_chat },
  ] as const;

  const isActive = (match: readonly string[]) =>
    match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)));

  return (
    <View style={[styles.sidebar, { width: SIDEBAR_WIDTH, backgroundColor: theme.colors.primary }]}>
      <Text style={[styles.brand, { color: theme.colors.textInverse, fontFamily: theme.fonts.bold }]}>
        AI Budget
      </Text>

      {primary.map((item) => {
        const active = isActive(item.match);
        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.row, active && { backgroundColor: 'rgba(255,255,255,0.18)' }]}
            onPress={() => router.push(item.route as never)}
          >
            <Image
              source={item.img}
              style={{ width: 22, height: 22, resizeMode: 'contain', tintColor: theme.colors.textInverse, opacity: active ? 1 : 0.8 }}
            />
            <Text style={[styles.label, { color: theme.colors.textInverse, opacity: active ? 1 : 0.85, fontFamily: theme.fonts.regular }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}

      <View style={styles.divider} />

      <TouchableOpacity style={styles.row} onPress={() => router.push('/alerts')}>
        <Ionicons name="notifications-outline" size={22} color={theme.colors.textInverse} />
        <Text style={[styles.label, { color: theme.colors.textInverse, fontFamily: theme.fonts.regular }]}>
          {t('alerts.title')}
        </Text>
        {unreadAlertCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadAlertCount > 9 ? '9+' : unreadAlertCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={22} color={theme.colors.textInverse} />
        <Text style={[styles.label, { color: theme.colors.textInverse, fontFamily: theme.fonts.regular }]}>
          {t('nav.settings')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { height: '100%', paddingTop: 24, paddingHorizontal: 12 },
  brand: { fontSize: 20, paddingHorizontal: 12, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  label: { fontSize: 15 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 12, marginHorizontal: 12 },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep WebSidebar || echo "no WebSidebar type errors"`
Expected: `no WebSidebar type errors`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/WebSidebar.tsx
git commit -m "feat(web): add WebSidebar desktop navigation component"
```

---

### Task 4: `WebShell` wrapper

**Files:**
- Create: `apps/mobile/src/components/WebShell.tsx`

**Interfaces:**
- Consumes: `useIsDesktopWeb`, `CONTENT_MAX_WIDTH`, `COLUMN_HORIZONTAL_PADDING` from `webLayout.constants`; `WebSidebar`; `useAuthStore` from `@/stores/authStore`; `usePathname` from `expo-router`; `useTheme`.
- Produces: `export function WebShell({ children }: { children: React.ReactNode }): JSX.Element`.

Behavior:
- Not desktop web → return `<>{children}</>` (pure pass-through; **mobile/narrow-web render tree is identical to today**).
- Desktop web → row layout: optional `<WebSidebar />` (only when authenticated AND pathname is not an auth route) + a flex column whose child is a centered, `CONTENT_MAX_WIDTH`-capped wrapper around `children`, on a `theme.colors.background` backdrop.

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/src/components/WebShell.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme';
import { WebSidebar } from '@/components/WebSidebar';
import {
  useIsDesktopWeb,
  CONTENT_MAX_WIDTH,
  COLUMN_HORIZONTAL_PADDING,
} from '@/components/webLayout.constants';

export function WebShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktopWeb();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pathname = usePathname();
  const theme = useTheme();

  // Mobile / narrow web: render exactly what we render today.
  if (!isDesktop) {
    return <>{children}</>;
  }

  const onAuthRoute = pathname.startsWith('/(auth)') || pathname.includes('login') || pathname.includes('register') || pathname.includes('forgot-password') || pathname.includes('reset-password');
  const showSidebar = isAuthenticated && !onAuthRoute;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {showSidebar && <WebSidebar />}
      <View style={styles.contentArea}>
        <View
          style={[
            styles.column,
            { maxWidth: CONTENT_MAX_WIDTH, paddingHorizontal: COLUMN_HORIZONTAL_PADDING, backgroundColor: theme.colors.background },
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  contentArea: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', alignSelf: 'center' },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep WebShell || echo "no WebShell type errors"`
Expected: `no WebShell type errors`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/WebShell.tsx
git commit -m "feat(web): add WebShell pass-through/desktop wrapper"
```

---

### Task 5: Mount `WebShell` in the root layout

**Files:**
- Modify: `apps/mobile/app/_layout.tsx` (the `return (...)` inside `RootNavigator`, around lines 204–743)

**Interfaces:**
- Consumes: `WebShell` from `@/components/WebShell`.

- [ ] **Step 1: Add the import**

Add near the other component imports (after line 33 `import { UpgradeGate } ...`):

```tsx
import { WebShell } from '@/components/WebShell';
```

- [ ] **Step 2: Wrap the `<Stack>`**

In `RootNavigator`'s return, wrap only the `<Stack>...</Stack>` element with `<WebShell>`. Leave `<UpdatePrompt />`, `<UpgradeGate />`, `<StatusBar />` outside it. The fragment now reads:

```tsx
  return (
    <>
      <WebShell>
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle,
            headerTintColor,
            headerTitleStyle,
            headerTitleAlign: 'center',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          {/* ...all existing <Stack.Screen /> entries unchanged... */}
        </Stack>
      </WebShell>
      <UpdatePrompt />
      <UpgradeGate />
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
    </>
  );
```

(Do not modify any `<Stack.Screen>` entry — only add the opening `<WebShell>` before `<Stack` and the closing `</WebShell>` after `</Stack>`, plus the matching indentation.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "_layout" || echo "no _layout type errors"`
Expected: `no _layout type errors`.

- [ ] **Step 4: Verify native render tree is unchanged (smoke)**

Run: `cd apps/mobile && npx jest src/components/__tests__/webLayout.constants.test.ts src/hooks/__tests__/contentWidth.test.ts`
Expected: PASS — confirms the gate that keeps native a pass-through still holds.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(web): mount WebShell around root navigator"
```

---

### Task 6: Hide the bottom tab bar on desktop web

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx:127-139` (the `screenOptions.tabBarStyle` block) and add a width read in `TabLayout`.

**Interfaces:**
- Consumes: `useIsDesktopWeb` from `@/components/webLayout.constants`.

- [ ] **Step 1: Import the hook**

Add to the imports at the top of `app/(tabs)/_layout.tsx`:

```tsx
import { useIsDesktopWeb } from '@/components/webLayout.constants';
```

- [ ] **Step 2: Read the gate in `TabLayout`**

Inside `export default function TabLayout()` (after `const theme = useTheme();`, ~line 109) add:

```tsx
  const isDesktopWeb = useIsDesktopWeb();
```

- [ ] **Step 3: Conditionally hide the tab bar**

Replace the `tabBarStyle` object (currently lines ~130–139) with one that collapses to `display: 'none'` on desktop web. Keep all existing native/narrow-web values intact:

```tsx
        tabBarStyle: isDesktopWeb
          ? { display: 'none' }
          : {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.borderLight,
              paddingTop: 8,
              // Web needs more vertical room: react-native-web renders the icon +
              // label taller than native, so the label was clipped by the fixed
              // 60px height. Give it extra height + bottom padding on web only.
              paddingBottom: Platform.OS === 'web' ? 12 : 8 + insets.bottom,
              height: (Platform.OS === 'web' ? 74 : 60) + insets.bottom,
            },
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "(tabs)" || echo "no tabs layout type errors"`
Expected: `no tabs layout type errors`.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(web): hide bottom tab bar on desktop web (sidebar replaces it)"
```

---

### Task 7: Point the four chart components at `useContentWidth`

**Files:**
- Modify: `apps/mobile/src/components/wallet/WalletMonthlyChart.tsx:2,24,33`
- Modify: `apps/mobile/src/components/interactive-charts/InteractiveLineChart.tsx:2,18,53`
- Modify: `apps/mobile/src/components/interactive-charts/InteractiveBarChart.tsx:2,30,54`
- Modify: `apps/mobile/src/components/insights/InsightCarousel.tsx:7,24,28`

**Interfaces:**
- Consumes: `useContentWidth` from `@/hooks/useContentWidth`.

Behavior is identical on mobile/narrow web (the hook returns window width there); on desktop web each chart now sizes to the 760px column.

- [ ] **Step 1: WalletMonthlyChart**

Line 2 — remove `useWindowDimensions` from the `react-native` import (keep `View`, `Text`):

```tsx
import { View, Text } from 'react-native';
```

Add the hook import below the existing imports:

```tsx
import { useContentWidth } from '@/hooks/useContentWidth';
```

Replace line 24:

```tsx
  const screenWidth = useContentWidth();
```

Line 33 (`const chartWidth = screenWidth - 64 - yAxisLabelWidth;`) stays unchanged.

- [ ] **Step 2: InteractiveLineChart**

Line 2 — drop `Dimensions` from the import (keep `View`, `Text`):

```tsx
import { View, Text } from 'react-native';
```

Add:

```tsx
import { useContentWidth } from '@/hooks/useContentWidth';
```

Delete the module-level line 18 (`const screenWidth = Dimensions.get('window').width;`). Inside the component body (after `const theme = useTheme();`, ~line 30) add:

```tsx
  const screenWidth = useContentWidth();
```

Line 53 (`const chartWidth = screenWidth - 120;`) stays unchanged.

- [ ] **Step 3: InteractiveBarChart**

Line 2 — drop `useWindowDimensions` (keep `View`, `Text`):

```tsx
import { View, Text } from 'react-native';
```

Add:

```tsx
import { useContentWidth } from '@/hooks/useContentWidth';
```

Replace line 30:

```tsx
  const screenWidth = useContentWidth();
```

Line 54 stays unchanged.

- [ ] **Step 4: InsightCarousel**

Remove `useWindowDimensions` from the `react-native` import block (line 7). Add:

```tsx
import { useContentWidth } from '@/hooks/useContentWidth';
```

Replace line 24:

```tsx
  const windowWidth = useContentWidth();
```

Line 28 (`const cardWidth = windowWidth - 32;`) stays unchanged.

- [ ] **Step 5: Typecheck all four**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "WalletMonthlyChart|InteractiveLineChart|InteractiveBarChart|InsightCarousel" || echo "no chart type errors"`
Expected: `no chart type errors`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/wallet/WalletMonthlyChart.tsx apps/mobile/src/components/interactive-charts/InteractiveLineChart.tsx apps/mobile/src/components/interactive-charts/InteractiveBarChart.tsx apps/mobile/src/components/insights/InsightCarousel.tsx
git commit -m "feat(web): size charts to content column on desktop web"
```

---

### Task 8: Manual web verification + full typecheck

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck passes**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors introduced by this branch (compare against a pre-branch baseline if the repo already has pre-existing errors).

- [ ] **Step 2: Full Jest run for the new helpers**

Run: `cd apps/mobile && npx jest src/components/__tests__/webLayout.constants.test.ts src/hooks/__tests__/contentWidth.test.ts`
Expected: PASS.

- [ ] **Step 3: Launch web dev server**

Run (from repo root): `npm run dev:web`
Open `http://localhost:8081`.

- [ ] **Step 4: Verify desktop (≥1024)**

At a wide browser window (e.g. 1440px):
- Sidebar visible on the left; clicking Home/Transactions/Budgets/Analytics/AI chat navigates and highlights the active item.
- Bottom tab bar is gone.
- Content sits in a centered ~760px column with background filling the sides.
- Alerts + Settings rows in the sidebar navigate correctly; unread badge shows.
- Open Analytics and Wallet: charts fit inside the column (no horizontal overflow/scroll).

- [ ] **Step 5: Verify narrow web (<1024)**

Resize the browser below 1024px (e.g. 800px):
- Layout reverts to bottom tabs, full-width content (current behavior). No sidebar.
- Crossing 1024 toggles the layout live without reload.

- [ ] **Step 6: Verify auth screens on desktop**

Log out. On desktop width the login form is centered (no sidebar). Logging back in shows the sidebar.

- [ ] **Step 7: Sanity-check native is untouched**

Confirm no native files outside the gated paths changed: `git diff --stat main -- apps/mobile/app apps/mobile/src` should list only the files from Tasks 1–7. The gate (`Platform.OS === 'web'`) guarantees native runtime behavior is unchanged.

- [ ] **Step 8: Commit any verification notes (optional)**

If you tweaked spacing/column width during verification, commit those adjustments:

```bash
git add -A
git commit -m "fix(web): desktop layout spacing adjustments from manual verification"
```

---

## Self-Review

**Spec coverage:**
- Breakpoint & gate → Task 1. ✓
- `useContentWidth` → Task 2. ✓
- Sidebar (5 primary + Alerts + Settings, active highlight, badge) → Task 3. ✓
- Top bar = existing header (left untouched) → no task needed; covered by not hiding it (only the bottom tab bar is hidden, Task 6). ✓
- WebShell pass-through on mobile/narrow + sidebar+column on desktop + auth-route handling → Task 4. ✓
- Mount point (single insertion in `_layout.tsx`) → Task 5. ✓
- Hide bottom tabs on desktop → Task 6. ✓
- 4 chart components migrated → Task 7. ✓
- Verification (native unchanged, narrow web, desktop, auth) → Task 8. ✓

**Placeholder scan:** No TBD/TODO; all code steps show full code. ✓

**Type consistency:** `isDesktopWeb`/`useIsDesktopWeb`, `contentWidthFor`/`useContentWidth`, `CONTENT_MAX_WIDTH`, `COLUMN_HORIZONTAL_PADDING`, `SIDEBAR_WIDTH` used identically across Tasks 1–7. `WebShell`/`WebSidebar` names consistent. ✓

**Note for implementer:** `usePathname()` on web returns the URL path (e.g. `/expenses`), so the sidebar's `startsWith` matching and WebShell's auth-route detection are reliable on the web target (the only place they run). If a primary route's active state mis-highlights during verification, adjust the `match` arrays in Task 3 — this is the one spot that may need a small tweak against real pathnames.
