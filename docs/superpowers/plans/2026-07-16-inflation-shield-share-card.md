# Inflation Shield — Shareable Image Card (Plan 5 of N) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user share a "My Inflation Shield — saved X" story-card image (with a plain-text fallback), for viral growth — mirroring the proven zero-native-module `WrappedShareCard` pattern.

**Architecture:** A self-contained `InflationShieldShareCard` (a near-copy of `WrappedShareCard`: an off-screen `react-native-webview` hosting a fixed HTML/canvas doc that draws a 1080×1920 card from an injected payload → PNG → `expo-file-system` cache → `expo-sharing`), with a `.web.tsx` no-op stub. The payload + text-fallback are built by PURE, unit-tested functions. The Shield screen gains a Share button + a hide-amounts toggle that tries the image and falls back to `Share.share({ message })`.

**Tech Stack:** Expo/React Native, react-native-webview, expo-file-system (`File`/`Paths`), expo-sharing, Jest. **No new dependencies** — all are already in `apps/mobile/package.json` (webview 13.15.0, expo-file-system ~19.0.21, expo-sharing ~14.0.8).

**Design spec:** `docs/superpowers/specs/2026-07-15-inflation-shield-design.md` (§1 — Shield screen shareable card). Builds on Plan 4 (the screen `app/inflation-shield/index.tsx`), implemented. Reference implementation to MIRROR: `apps/mobile/src/components/wrapped/WrappedShareCard.tsx` + `apps/mobile/app/wrapped/index.tsx`'s share flow.

## Global Constraints

- **This is Plan 5 of N.** Scope = the shield share card + the screen's share button/flow + i18n. OUT of scope: community-price boost, proactive push, home-widget-share.
- **Do NOT modify `WrappedShareCard.tsx`** — build a separate `InflationShieldShareCard` (accepted duplication for isolation; the proven Wrapped path must stay untouched). A "extract a generic ShareImageCard" refactor is a documented follow-up, not this plan.
- **Mirror the WrappedShareCard contract EXACTLY:** `forwardRef` exposing `share(payload): Promise<boolean>` that NEVER throws (resolves `false` on any failure), an 8s timeout (`SHARE_TIMEOUT_MS = 8000`), a single-in-flight guard (finish a stale resolver before starting a new share), off-screen hidden WebView (`position:'absolute', top:-2000, left:-2000, width:4, height:4, opacity:0`), `injectJavaScript` with a queued-until-loaded fallback, `File(Paths.cache, fileName)` + `file.write(base64, { encoding: 'base64' })`, `Sharing.isAvailableAsync()` guard, `Sharing.shareAsync(file.uri, { mimeType:'image/png', dialogTitle })`.
- **`.web.tsx` stub** returns `share: async () => false` and renders `null` (keeps webview/file-system out of the web bundle; mirrors `WrappedShareCard.web.tsx`).
- **hide-amounts masking flows through a `money()` that both builders share** — so the image and the text fallback mask identically (mirror Wrapped's `money = hideAmounts ? '•••' : formatCurrency(...)`).
- **Savings copy is an ESTIMATE** — share lines say "saved ~X" / "could save ~X"; never a guarantee.
- **Native-only mount** — mount the card `{Platform.OS !== 'web' && <InflationShieldShareCard ref={…} />}`; the `onShare` handler falls back to the text `Share.share` on web AND on any image failure.
- **i18n:** `inflationShield.share*` keys in ALL 9 locale files (`en/de/es/fr/pl/ru/ua/be/nl`).
- Commit messages ENGLISH. Verify with `cd apps/mobile && npx tsc --noEmit` (0). Task 1 also runs `npx jest shieldShare`. **Runtime/visual verification requires a device/Expo (not available in the build session) — correctness is bounded to tsc + the pure-builder tests + faithful mirroring of the working WrappedShareCard.**

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/mobile/src/features/insights/shieldShare.ts` (create) | pure `buildShieldSharePayload` + `buildShieldShareMessage` + types | 1 |
| `apps/mobile/src/features/insights/__tests__/shieldShare.test.ts` (create) | unit tests | 1 |
| `apps/mobile/src/components/insights/InflationShieldShareCard.tsx` (create) | native image renderer | 2 |
| `apps/mobile/src/components/insights/InflationShieldShareCard.web.tsx` (create) | web no-op stub | 2 |
| `apps/mobile/app/inflation-shield/index.tsx` (modify) | Share button + hide toggle + onShare | 3 |
| `apps/mobile/src/i18n/locales/*.ts` (modify ×9) | `inflationShield.share*` | 4 |

---

### Task 1: Pure share builders

**Files:**
- Create: `apps/mobile/src/features/insights/shieldShare.ts`
- Create: `apps/mobile/src/features/insights/__tests__/shieldShare.test.ts`

**Interfaces:**
- Produces: `ShieldShareLine`, `ShieldSharePayload`, `buildShieldSharePayload(data, opts)`, `buildShieldShareMessage(data, opts)`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/insights/__tests__/shieldShare.test.ts`:

```ts
import { buildShieldSharePayload, buildShieldShareMessage } from '../shieldShare';
import type { InflationShieldResponse } from '@budget/shared-types';

const DATA: InflationShieldResponse = {
  baseCurrency: 'PLN',
  items: [
    { canonicalName: 'Masło', monthlyChangePct: 12, currentPrice: 5.9, projectedPrice: 6.5, quantity: 2, projectedSaving: 0.6, store: 'Lidl', currencyOriginal: 'PLN', affordableToday: true },
  ],
  basketMonthlyForecastPct: 3.4,
  totalProjectedSaving: 8,
  savedSoFar: 42,
  hasEnoughData: true,
  fxApproximate: false,
  computedAt: '2026-07-16T00:00:00Z',
};

// Fake i18n + money: `t` echoes "key|param1=val1" so tests assert composition, not translations.
const t = (k: string, p?: Record<string, unknown>) =>
  p ? `${k}|${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(',')}` : k;

describe('buildShieldSharePayload', () => {
  it('returns null when there is not enough data', () => {
    expect(buildShieldSharePayload({ ...DATA, hasEnoughData: false }, { hideAmounts: false, money: String, t })).toBeNull();
  });

  it('builds title, saved/basket/item/total lines, and a footer', () => {
    const p = buildShieldSharePayload(DATA, { hideAmounts: false, money: (n) => `${n}zł`, t })!;
    expect(p.title).toBe('inflationShield.shareTitle');
    expect(p.footer).toBe('inflationShield.shareCta');
    const labels = p.lines.map((l) => l.label);
    expect(labels.some((l) => l.startsWith('inflationShield.shareSaved') && l.includes('42zł'))).toBe(true);
    expect(labels.some((l) => l.startsWith('inflationShield.shareBasket') && l.includes('3.4'))).toBe(true);
    expect(labels.some((l) => l.startsWith('inflationShield.shareItem') && l.includes('Masło') && l.includes('0.6zł'))).toBe(true);
    expect(labels.some((l) => l.startsWith('inflationShield.shareTotal') && l.includes('8zł'))).toBe(true);
  });

  it('masks all amounts when hideAmounts is set', () => {
    const money = (n: number) => (true ? '•••' : String(n)); // caller passes a masking money
    const p = buildShieldSharePayload(DATA, { hideAmounts: true, money, t })!;
    const joined = p.lines.map((l) => l.label).join(' ');
    expect(joined).toContain('•••');
    expect(joined).not.toContain('42');
    expect(joined).not.toContain('0.6');
  });
});

describe('buildShieldShareMessage', () => {
  it('returns a newline-joined text with the same content, or "" below the data threshold', () => {
    expect(buildShieldShareMessage({ ...DATA, hasEnoughData: false }, { hideAmounts: false, money: String, t })).toBe('');
    const msg = buildShieldShareMessage(DATA, { hideAmounts: false, money: (n) => `${n}zł`, t });
    expect(msg).toContain('inflationShield.shareTitle');
    expect(msg).toContain('42zł');
    expect(msg).toContain('inflationShield.shareCta');
    expect(msg.split('\n').length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest shieldShare`
Expected: FAIL — "Cannot find module '../shieldShare'".

- [ ] **Step 3: Write the builders**

Create `apps/mobile/src/features/insights/shieldShare.ts`:

```ts
import type { InflationShieldResponse } from '@budget/shared-types';

export interface ShieldShareLine {
  emoji: string;
  label: string;
  value: string; // reserved for the image renderer's optional bold value column; usually ''
}

export interface ShieldSharePayload {
  fileTag: string; // used only to name the file (inflation-shield-<fileTag>.png)
  title: string;
  lines: ShieldShareLine[];
  footer: string;
}

interface BuildOpts {
  hideAmounts: boolean;
  money: (n: number) => string; // already hide-aware in callers; tests pass their own
  t: (key: string, params?: Record<string, unknown>) => string;
}

// Up to 3 rising items on the card, biggest projected saving first (server already sorts,
// but we defensively slice).
const MAX_ITEMS = 3;

function buildLines(data: InflationShieldResponse, { money, t }: BuildOpts): ShieldShareLine[] {
  const lines: ShieldShareLine[] = [];
  if (data.savedSoFar > 0) {
    lines.push({ emoji: '💰', label: t('inflationShield.shareSaved', { value: money(data.savedSoFar) }), value: '' });
  }
  if (data.basketMonthlyForecastPct != null) {
    lines.push({ emoji: '📈', label: t('inflationShield.shareBasket', { pct: data.basketMonthlyForecastPct.toFixed(1) }), value: '' });
  }
  for (const it of data.items.slice(0, MAX_ITEMS)) {
    lines.push({
      emoji: '🛒',
      label: t('inflationShield.shareItem', {
        product: it.canonicalName,
        pct: it.monthlyChangePct.toFixed(0),
        save: money(it.projectedSaving),
      }),
      value: '',
    });
  }
  if (data.totalProjectedSaving > 0) {
    lines.push({ emoji: '🛡️', label: t('inflationShield.shareTotal', { value: money(data.totalProjectedSaving) }), value: '' });
  }
  return lines;
}

/** Story-card payload, or null when there's nothing worth sharing. */
export function buildShieldSharePayload(data: InflationShieldResponse, opts: BuildOpts): ShieldSharePayload | null {
  if (!data.hasEnoughData) return null;
  const lines = buildLines(data, opts);
  if (lines.length === 0) return null;
  return {
    fileTag: 'shield',
    title: opts.t('inflationShield.shareTitle'),
    lines,
    footer: opts.t('inflationShield.shareCta'),
  };
}

/** Plain-text fallback for Share.share, or "" below the data threshold. */
export function buildShieldShareMessage(data: InflationShieldResponse, opts: BuildOpts): string {
  if (!data.hasEnoughData) return '';
  const lines = buildLines(data, opts);
  if (lines.length === 0) return '';
  return [opts.t('inflationShield.shareTitle'), ...lines.map((l) => `${l.emoji} ${l.label}`), opts.t('inflationShield.shareCta')].join('\n');
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/mobile && npx jest shieldShare && npx tsc --noEmit`
Expected: tests PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/insights/shieldShare.ts apps/mobile/src/features/insights/__tests__/shieldShare.test.ts
git commit -m "feat(mobile): pure shield share payload/message builders"
```

---

### Task 2: `InflationShieldShareCard` (native renderer + web stub)

**Files:**
- Create: `apps/mobile/src/components/insights/InflationShieldShareCard.tsx`
- Create: `apps/mobile/src/components/insights/InflationShieldShareCard.web.tsx`

**Interfaces:**
- Consumes: `ShieldSharePayload` (Task 1).
- Produces: `InflationShieldShareCard` (forwardRef), `InflationShieldShareCardHandle` = `{ share(payload: ShieldSharePayload): Promise<boolean> }`.

- [ ] **Step 1: Read the reference, then write the native card**

FIRST read `apps/mobile/src/components/wrapped/WrappedShareCard.tsx` in full — this task is a faithful mirror of it. Then create `apps/mobile/src/components/insights/InflationShieldShareCard.tsx`, IDENTICAL in structure/plumbing to `WrappedShareCard.tsx`, with exactly these differences:
1. Import the payload type from Task 1: `import type { ShieldSharePayload } from '@/features/insights/shieldShare';` and export the handle:
   ```ts
   export interface InflationShieldShareCardHandle { share: (payload: ShieldSharePayload) => Promise<boolean>; }
   ```
   (Do NOT redeclare `ShieldShareLine`/`ShieldSharePayload` — import them from `shieldShare.ts`.)
2. The canvas `draw(payload)` gradient uses a **savings/green** theme instead of Wrapped's purple→pink: top color `#065F46`, bottom color `#10B981` (dark-green → emerald). Everything else in `draw()` (title wrap, divider, per-line emoji+label+optional value, footer) stays byte-identical to WrappedShareCard's draw.
3. Rename the injected global to avoid any collision: `window.__renderShield` (instead of `__renderWrapped`), and the injected JS `\`window.__renderShield(${JSON.stringify(JSON.stringify(payload))}); true;\``.
4. The file name in `onMessage` uses the shield tag: `const fileName = \`inflation-shield-${tagRef.current}.png\`;` where `tagRef.current = payload.fileTag` (replace WrappedShareCard's `yearRef`/`payload.year` with `tagRef`/`payload.fileTag`).
5. Keep `SHARE_TIMEOUT_MS = 8000`, the single-in-flight guard, the `pendingJsRef` queue-until-loaded, `File(Paths.cache, fileName)` + `file.write(base64, { encoding:'base64' })`, `Sharing.isAvailableAsync()` guard, `Sharing.shareAsync(...)`, the try/catch that resolves `false` and NEVER throws, and the identical off-screen hidden `<View style={styles.hidden}>` + `<WebView>` props (`originWhitelist`, `source={{ html: CARD_HTML }}`, `onMessage`, `onLoadEnd`, `javaScriptEnabled`, `setSupportMultipleWindows={false}`).

Imports (identical to the reference):
```ts
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ShieldSharePayload } from '@/features/insights/shieldShare';
```

- [ ] **Step 2: Write the web stub**

Create `apps/mobile/src/components/insights/InflationShieldShareCard.web.tsx` (mirror `WrappedShareCard.web.tsx`):

```tsx
import { forwardRef, useImperativeHandle } from 'react';
import type { ShieldSharePayload } from '@/features/insights/shieldShare';

// Web has no react-native-webview / expo-file-system — this no-op keeps them out of
// the web bundle (mirrors WrappedShareCard.web.tsx / ExpenseMapView.web.tsx). The
// screen never mounts it on web, but Metro still resolves the import.
export interface InflationShieldShareCardHandle { share: (payload: ShieldSharePayload) => Promise<boolean>; }

export const InflationShieldShareCard = forwardRef<InflationShieldShareCardHandle>(function InflationShieldShareCard(_props, ref) {
  useImperativeHandle(ref, () => ({ share: async () => false }));
  return null;
});
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0. (The `.web.tsx`/native split resolves via Metro platform extensions; tsc checks the native file.)
```bash
git add apps/mobile/src/components/insights/InflationShieldShareCard.tsx apps/mobile/src/components/insights/InflationShieldShareCard.web.tsx
git commit -m "feat(mobile): InflationShieldShareCard image renderer"
```

---

### Task 3: Wire share into the Shield screen

**Files:**
- Modify: `apps/mobile/app/inflation-shield/index.tsx`

**Interfaces:**
- Consumes: `InflationShieldShareCard`, `buildShieldSharePayload`, `buildShieldShareMessage`, `formatCurrency`, RN `Share`/`Switch`/`Platform`.

- [ ] **Step 1: Add the imports + share plumbing**

In `apps/mobile/app/inflation-shield/index.tsx`:
1. Extend the RN import to include `Share, Switch, Platform, TouchableOpacity` (whichever aren't already imported).
2. Add:
```tsx
import { useRef, useState, useCallback } from 'react';
import { formatCurrency } from '@budget/shared-utils';
import { InflationShieldShareCard, type InflationShieldShareCardHandle } from '@/components/insights/InflationShieldShareCard';
import { buildShieldSharePayload, buildShieldShareMessage } from '@/features/insights/shieldShare';
```
3. Inside the component, add state + the ref + a `money` helper + builders + `onShare` (mirror `app/wrapped/index.tsx`'s `money`/`buildSharePayload`/`onShare`):
```tsx
  const shareCardRef = useRef<InflationShieldShareCardHandle>(null);
  const [hideAmounts, setHideAmounts] = useState(false);

  const money = useCallback(
    (n: number) => (hideAmounts ? '•••' : formatCurrency(n, currency)),
    [hideAmounts, currency],
  );

  const onShare = useCallback(async () => {
    if (!data) return;
    if (Platform.OS !== 'web') {
      const payload = buildShieldSharePayload(data, { hideAmounts, money, t });
      if (payload) {
        try {
          const ok = await shareCardRef.current?.share(payload);
          if (ok) return;
        } catch {
          // fall through to text share
        }
      }
    }
    const message = buildShieldShareMessage(data, { hideAmounts, money, t });
    if (!message) return;
    try {
      await Share.share({ message });
    } catch {
      // user dismissed / unavailable — no-op
    }
  }, [data, hideAmounts, money, t]);
```
(`currency` and `data`/`hasEnoughData` are already in scope from Plan 4's screen.)

- [ ] **Step 2: Add the Share button, hide toggle, and mount the card**

In the JSX, when `hasEnoughData` and there is something to share, render a Share button + a hide-amounts row (place them in the hero area, below the basket line), and mount the hidden card once (native only):

```tsx
        {hasEnoughData && (data.items.length > 0 || (data.savedSoFar ?? 0) > 0) && (
          <>
            <TouchableOpacity style={styles.shareBtn} onPress={onShare} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={18} color={theme.colors.textInverse} />
              <Text style={styles.shareBtnText}>{t('inflationShield.share')}</Text>
            </TouchableOpacity>
            <View style={styles.hideRow}>
              <Text style={styles.hideLabel}>{t('inflationShield.hideAmounts')}</Text>
              <Switch value={hideAmounts} onValueChange={setHideAmounts} />
            </View>
          </>
        )}
```
And near the end of the returned tree (inside the SafeAreaView, after the ScrollView):
```tsx
      {Platform.OS !== 'web' && <InflationShieldShareCard ref={shareCardRef} />}
```
Add the styles (reuse the token conventions already in this file):
```ts
  shareBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: theme.spacing[2], alignSelf: 'center' as const, marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[2.5], paddingHorizontal: theme.spacing[5],
    backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg,
  },
  shareBtnText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  hideRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: theme.spacing[2], marginTop: theme.spacing[2] },
  hideLabel: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
```
> NOTE: confirm `theme.colors.textInverse` and `theme.spacing[2.5]` exist (they're used elsewhere in the app); if a token differs, use the exact name a sibling screen uses. `npx tsc --noEmit` must be 0.

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0.
```bash
git add apps/mobile/app/inflation-shield/index.tsx
git commit -m "feat(mobile): share the Inflation Shield (image + text fallback)"
```

---

### Task 4: `inflationShield.share*` i18n ×9

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Produces: the share strings used by Tasks 1 + 3.

- [ ] **Step 1: Add the keys to the `inflationShield` namespace in each locale**

In EACH of the 9 locale files, add these keys inside the existing `inflationShield` namespace (added in Plan 4). English (`en.ts`):
```ts
      share: 'Share',
      hideAmounts: 'Hide amounts',
      shareTitle: '🛡️ My Inflation Shield — AI Budget',
      shareSaved: 'Saved so far: ~{{value}}',
      shareBasket: 'My basket forecast: +{{pct}}%/mo',
      shareItem: '{{product}} rising +{{pct}}% — save ~{{save}} by stocking up',
      shareTotal: 'Could save ~{{value}} by buying ahead',
      shareCta: 'Beat inflation → ai-budget.pl',
```
Provide the same keys in the other 8 locales (de/es/fr/pl/ru/ua/be/nl), translating naturally. Keep every placeholder token IDENTICAL across all 9: `{{value}}`, `{{pct}}`, `{{product}}`, `{{save}}`. Keep the "~"/"forecast"/estimate qualifier so savings never read as guaranteed.
> NOTE: mirror the i18n-add-strings convention — every key in all 9 files, placeholders identical.

- [ ] **Step 2: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0.
```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): inflationShield share i18n (9 locales)"
```

---

## Definition of Done (Plan 5)

- The Shield screen shows a **Share** button + a **Hide amounts** toggle (when there's data); tapping shares a green "My Inflation Shield — saved ~X" story-card image, falling back to a plain-text share on web or any image failure.
- Payload/message builders are pure + unit-tested (masking + line composition + empty gating).
- The card mirrors the proven `WrappedShareCard` contract (never throws, 8s timeout, single-in-flight, off-screen webview, cache-file → expo-sharing); `.web.tsx` no-op keeps webview out of the web bundle.
- Mobile `tsc` clean; `shieldShare` tests pass. **(Runtime/visual look must be confirmed on a device — not verifiable in the build session.)**

## Out of scope / Follow-ups (later plans)

- **Extract a generic `ShareImageCard`** from `WrappedShareCard` + `InflationShieldShareCard` (remove the accepted duplication).
- **Community-price boost** in `getShield` (cheapest store).
- **Proactive push** (`notifyInflationShield` + cron + `notification-i18n` × 9).
- Share directly from the home widget (not just the screen).
