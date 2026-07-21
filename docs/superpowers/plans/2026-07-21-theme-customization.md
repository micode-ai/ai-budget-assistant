# Theme Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user pick an accent color (from preset swatches or a custom picker) that recolors the app's brand tokens on top of the existing light/dark themes, persisted per-user in the DB so it syncs across devices.

**Architecture:** The accent is orthogonal to light/dark mode: mode still controls the base palette; the accent overrides only brand tokens via a pure color-derivation function merged into `ThemeContext`. Both `themeMode` and `accentColor` live on the `User` row and are set with the same optimistic-local + fire-and-forget-persist pattern as `user.currencyCode` (ABA-187), with a local MMKV cache as a pre-auth/cold-start fallback.

**Tech Stack:** NestJS + Prisma (API), React Native / Expo + Zustand + MMKV (mobile), `expo-linear-gradient` + `PanResponder` for the in-house color picker (no native color-picker dependency), Jest for tests.

## Global Constraints

- **No new native modules.** The color picker uses only `PanResponder` + `expo-linear-gradient` (already a dependency, `~15.0.8`) + `react-native-svg` if needed. Reason: Windows MAX_PATH codegen risk (per CLAUDE.md).
- **shared-types / shared-utils are type-only for `apps/api`.** Never `import` a runtime value from `@budget/shared-*` in `apps/api/src` — `import type` only. (Breaks prod ESM, per memory `reference_shared_types_runtime_values`.)
- **i18n: all 9 locale files must stay in sync** — `en, de, es, fr, pl, ru, ua, be, nl` in `apps/mobile/src/i18n/locales/`. `en.ts` is the source.
- **`accentColor` values are `#RRGGBB` hex (uppercase) or `null`.** `null` = built-in default `#E37F2B`. Validate on the server (`/^#[0-9a-fA-F]{6}$/` or null) — the value flows into `prisma.user.update` and then into RN styles.
- **`themeMode` ∈ `{ 'light', 'dark', 'system' }`.** Default `'system'`.
- **Defaults reproduce today's behavior** (`themeMode='system'`, `accentColor=null`) so existing users see no change.
- **Offline-first logging:** a failed server persist is expected offline — log with `console.warn`, never `console.error`.
- **GitHub artifacts (issues/PRs/commits) in English.** Chat may be Russian.

---

### Task 1: shared-types — `ThemeMode` + `User` + `AuthResponse` fields

**Files:**
- Modify: `packages/shared-types/src/entities/primitives.ts`
- Modify: `packages/shared-types/src/entities/user.ts`
- Modify: `packages/shared-types/src/dto/auth.ts:20-26`

**Interfaces:**
- Produces: `type ThemeMode = 'light' | 'dark' | 'system'`; `User.themeMode?: ThemeMode`; `User.accentColor?: string | null`; `AuthResponse.user.themeMode?: ThemeMode`; `AuthResponse.user.accentColor?: string | null`.

- [ ] **Step 1: Add the `ThemeMode` alias to primitives**

In `packages/shared-types/src/entities/primitives.ts`, add near the other UI-ish aliases (after `AiModel`):

```ts
export type ThemeMode = 'light' | 'dark' | 'system';
```

- [ ] **Step 2: Add the two fields to the `User` entity**

In `packages/shared-types/src/entities/user.ts`, update the import and interface:

```ts
import type { Currency, AiResponseMode, AiModel, ThemeMode } from './primitives';
```

Add inside `interface User` (after `contributeCommunityPrices?`):

```ts
  themeMode?: ThemeMode;
  accentColor?: string | null;
```

- [ ] **Step 3: Add the fields to `AuthResponse.user`**

In `packages/shared-types/src/dto/auth.ts`, update the import line 1 and the `user` shape (lines 20-26):

```ts
import type { Currency, ThemeMode, Account } from '../entities';
```

```ts
  user: {
    id: string;
    email: string;
    name: string;
    currencyCode: Currency;
    defaultAccountId?: string;
    themeMode?: ThemeMode;
    accentColor?: string | null;
  };
```

Verify `ThemeMode` is re-exported from `../entities`. Open `packages/shared-types/src/entities/index.ts` and confirm it does `export * from './primitives'` (it does — all primitives flow through). If not, add `ThemeMode` to the export.

- [ ] **Step 4: Typecheck the package**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/entities/primitives.ts packages/shared-types/src/entities/user.ts packages/shared-types/src/dto/auth.ts
git commit -m "feat(shared-types): add ThemeMode + User.themeMode/accentColor + AuthResponse fields"
```

---

### Task 2: API — Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`User` model, after `contributeCommunityPrices`, ~line 170)
- Create: `apps/api/prisma/migrations/20260721000000_add_user_theme_prefs/migration.sql`

**Interfaces:**
- Produces: `User.themeMode String @default("system")` (column `theme_mode`), `User.accentColor String?` (column `accent_color`).

- [ ] **Step 1: Add the columns to the Prisma schema**

In `apps/api/prisma/schema.prisma`, inside `model User`, add right after the `contributeCommunityPrices` line (~170):

```prisma
  themeMode                 String  @default("system") @map("theme_mode")
  accentColor               String? @map("accent_color")
```

- [ ] **Step 2: Create the migration**

Preferred (if a local Postgres is reachable via `DATABASE_URL`):

Run: `cd apps/api && npx prisma migrate dev --name add_user_theme_prefs`
Expected: creates `prisma/migrations/20260721000000_add_user_theme_prefs/migration.sql` and regenerates the client.

If **no local DB** is available (this repo runs migrations against prod via the deploy migrator — same situation as the inflation-shield tracking migration), author the migration by hand. Create `apps/api/prisma/migrations/20260721000000_add_user_theme_prefs/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "users" ADD COLUMN "theme_mode" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "users" ADD COLUMN "accent_color" TEXT;
```

Then regenerate the client:

Run: `cd apps/api && npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

> Note: confirm the `User` model maps to the `users` table (it does via Prisma's default pluralization / `@@map` — check the top of the model; the column names above use the `@map` snake_case values).

- [ ] **Step 3: Typecheck the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors (the generated client now knows the two fields).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260721000000_add_user_theme_prefs/
git commit -m "feat(api): add theme_mode + accent_color columns to users"
```

---

### Task 3: API — profile/auth theme fields + server validation (TDD)

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts:4-16` (`CreateUserData`)
- Modify: `apps/api/src/modules/users/users.controller.ts:36-68` (`getProfile` return, `updateProfile` body + validation + return)
- Modify: `apps/api/src/modules/auth/auth.service.ts` (all response `user` blocks: ~118, ~156, ~183, ~267, ~411)
- Create: `apps/api/src/modules/users/users.controller.spec.ts`

**Interfaces:**
- Consumes: `UsersService.update(id, data)` (unchanged signature — `data: Partial<CreateUserData>`).
- Produces: `PATCH /users/me` accepts `{ themeMode?: string; accentColor?: string | null }`, validates them, and returns them; `GET /users/me` returns them; auth responses' `user` object includes them.

- [ ] **Step 1: Write the failing controller spec**

Create `apps/api/src/modules/users/users.controller.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';

function makeController(update = jest.fn()) {
  const usersService = {
    update,
    findById: jest.fn(),
    updateLastSync: jest.fn().mockResolvedValue(null),
  } as any;
  const controller = new UsersController(
    usersService,
    {} as any, // telegramLinkService
    {} as any, // telegramBotService
    {} as any, // whatsAppLinkService
    {} as any, // slackLinkService
  );
  return { controller, usersService, update };
}

const req = { user: { id: 'u1' } } as any;

describe('UsersController.updateProfile theme prefs', () => {
  it('rejects an invalid accentColor', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { accentColor: 'red' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid themeMode', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { themeMode: 'blue' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid themeMode + accentColor and returns them', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'dark', accentColor: '#AABBCC',
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { themeMode: 'dark', accentColor: '#AABBCC' });
    expect(update).toHaveBeenCalledWith('u1', { themeMode: 'dark', accentColor: '#AABBCC' });
    expect(res.themeMode).toBe('dark');
    expect(res.accentColor).toBe('#AABBCC');
  });

  it('accepts accentColor null (reset to default)', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { accentColor: null });
    expect(update).toHaveBeenCalledWith('u1', { accentColor: null });
    expect(res.accentColor).toBeNull();
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd apps/api && npx jest src/modules/users/users.controller.spec.ts`
Expected: FAIL — `updateProfile` does not yet validate (invalid values don't throw) and does not return `themeMode`/`accentColor`.

- [ ] **Step 3: Extend `CreateUserData`**

In `apps/api/src/modules/users/users.service.ts`, add to the `CreateUserData` interface (after `contributeCommunityPrices?`):

```ts
  themeMode?: string;
  accentColor?: string | null;
```

- [ ] **Step 4: Add validation + fields to the controller**

In `apps/api/src/modules/users/users.controller.ts`:

`BadRequestException` is already importable from `@nestjs/common` — add it to the existing import if missing:

```ts
import { Controller, Get, Post, Patch, Delete, Body, Query, UseGuards, Req, NotFoundException, BadRequestException } from '@nestjs/common';
```

Add a module-scope constant near the top of the file (after imports):

```ts
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const THEME_MODES = ['light', 'dark', 'system'];
```

Replace the `updateProfile` handler (lines ~57-68) with:

```ts
  @Patch('me')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name?: string; currencyCode?: string; timezone?: string; language?: string; contributeCommunityPrices?: boolean; themeMode?: string; accentColor?: string | null },
  ) {
    if (body.themeMode !== undefined && !THEME_MODES.includes(body.themeMode)) {
      throw new BadRequestException('Invalid themeMode');
    }
    if (body.accentColor !== undefined && body.accentColor !== null && !HEX_COLOR.test(body.accentColor)) {
      throw new BadRequestException('Invalid accentColor');
    }
    const user = await this.usersService.update(req.user.id, body);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
      contributeCommunityPrices: user.contributeCommunityPrices,
      themeMode: user.themeMode,
      accentColor: user.accentColor,
    };
  }
```

Also add the two fields to the `getProfile` return object (after `contributeCommunityPrices: user.contributeCommunityPrices,`, ~line 44):

```ts
      themeMode: user.themeMode,
      accentColor: user.accentColor,
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `cd apps/api && npx jest src/modules/users/users.controller.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Add the fields to every auth response `user` block**

In `apps/api/src/modules/auth/auth.service.ts`, each response has a `user: { id, email, name, currencyCode, defaultAccountId, ... }` object (blocks near lines ~118, ~156, ~183, ~267, ~411). In **each** block, add:

```ts
        themeMode: user.themeMode,
        accentColor: user.accentColor,
```

(Match each block's indentation. The `user` variable in scope is the Prisma user row, which now has these fields.) Use a grep to find all sites: `grep -n "currencyCode: user.currencyCode" apps/api/src/modules/auth/auth.service.ts` and add the two lines right after each.

- [ ] **Step 7: Typecheck the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/users/ apps/api/src/modules/auth/auth.service.ts
git commit -m "feat(api): accept/return themeMode+accentColor on profile & auth, validate on write"
```

---

### Task 4: Mobile — `deriveAccent` pure module (TDD)

**Files:**
- Create: `apps/mobile/src/theme/deriveAccent.ts`
- Create: `apps/mobile/src/theme/__tests__/deriveAccent.test.ts`

**Interfaces:**
- Consumes: `ThemeColors` from `./colors`.
- Produces:
  - `hexToHsl(hex: string): { h: number; s: number; l: number }`
  - `hslToHex(hsl: { h: number; s: number; l: number }): string`
  - `relativeLuminance(hex: string): number` (0..1)
  - `readableOn(hex: string): string` (`'#1A1D26'` or `'#FFFFFF'`)
  - `deriveAccentColors(base: ThemeColors, accentHex: string, isDark: boolean): Partial<ThemeColors>`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/theme/__tests__/deriveAccent.test.ts`:

```ts
import { hexToHsl, hslToHex, relativeLuminance, readableOn, deriveAccentColors } from '../deriveAccent';
import { lightColors, darkColors } from '../colors';

describe('hex <-> hsl', () => {
  it('round-trips clean colors within 1 unit', () => {
    for (const hex of ['#3B82F6', '#E37F2B', '#10B981', '#EC4899']) {
      const back = hslToHex(hexToHsl(hex));
      // allow ±1 per channel from rounding
      const a = parseInt(hex.slice(1), 16);
      const b = parseInt(back.slice(1), 16);
      const dr = Math.abs(((a >> 16) & 255) - ((b >> 16) & 255));
      const dg = Math.abs(((a >> 8) & 255) - ((b >> 8) & 255));
      const db = Math.abs((a & 255) - (b & 255));
      expect(Math.max(dr, dg, db)).toBeLessThanOrEqual(1);
    }
  });

  it('parses white and black', () => {
    expect(hexToHsl('#FFFFFF').l).toBeGreaterThan(99);
    expect(hexToHsl('#000000').l).toBeLessThan(1);
  });
});

describe('readableOn', () => {
  it('returns dark text on light backgrounds', () => {
    expect(readableOn('#FFFFFF')).toBe('#1A1D26');
    expect(readableOn('#FFD54A')).toBe('#1A1D26');
  });
  it('returns white text on dark backgrounds', () => {
    expect(readableOn('#000000')).toBe('#FFFFFF');
    expect(readableOn('#E37F2B')).toBe('#FFFFFF'); // current orange keeps white text
    expect(readableOn('#3B82F6')).toBe('#FFFFFF');
  });
});

describe('deriveAccentColors', () => {
  it('sets primary to the accent and picks a readable on-accent foreground', () => {
    const out = deriveAccentColors(lightColors, '#3B82F6', false);
    expect(out.primary).toBe('#3B82F6');
    expect(out.tabBarActive).toBe('#3B82F6');
    expect(out.messageBubbleUser).toBe('#3B82F6');
    expect(out.textInverse).toBe('#FFFFFF');
    expect(out.messageBubbleUserText).toBe('#FFFFFF');
  });

  it('uses dark on-accent text for a light accent', () => {
    const out = deriveAccentColors(lightColors, '#FFD54A', false);
    expect(out.textInverse).toBe('#1A1D26');
  });

  it('darkens primaryDark in light mode and lightens it in dark mode', () => {
    const accent = '#3B82F6';
    const accentL = hexToHsl(accent).l;
    const light = deriveAccentColors(lightColors, accent, false);
    const dark = deriveAccentColors(darkColors, accent, true);
    expect(hexToHsl(light.primaryDark!).l).toBeLessThan(accentL);
    expect(hexToHsl(dark.primaryDark!).l).toBeGreaterThan(accentL);
  });

  it('only returns brand tokens (no surfaces/borders)', () => {
    const out = deriveAccentColors(lightColors, '#3B82F6', false);
    expect(out.background).toBeUndefined();
    expect(out.border).toBeUndefined();
    expect(out.textPrimary).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && npx jest src/theme/__tests__/deriveAccent.test.ts`
Expected: FAIL with "Cannot find module '../deriveAccent'".

- [ ] **Step 3: Implement `deriveAccent.ts`**

Create `apps/mobile/src/theme/deriveAccent.ts`:

```ts
import type { ThemeColors } from './colors';

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function hexToHsl(hex: string): HSL {
  const int = parseInt(hex.slice(1), 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: HSL): string {
  const hn = (h % 360) / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }
  const toHex = (x: number): string =>
    Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function relativeLuminance(hex: string): number {
  const int = parseInt(hex.slice(1), 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((int >> 16) & 255);
  const g = channel((int >> 8) & 255);
  const b = channel(int & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? '#1A1D26' : '#FFFFFF';
}

function adjustL(hex: string, delta: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: clamp(hsl.l + delta, 0, 100) });
}

/**
 * Derives brand-token overrides from a single accent color. Surfaces, text,
 * and borders come from the light/dark base and are NOT touched here.
 * The on-accent foreground (textInverse, messageBubbleUserText) is chosen by
 * luminance so buttons and chat bubbles stay legible for any accent.
 */
export function deriveAccentColors(
  base: ThemeColors,
  accentHex: string,
  isDark: boolean,
): Partial<ThemeColors> {
  const { h, s } = hexToHsl(accentHex);
  const onAccent = readableOn(accentHex);
  const primaryDark = isDark ? adjustL(accentHex, 14) : adjustL(accentHex, -12);
  const primaryLight = isDark
    ? hslToHex({ h, s: clamp(s, 0, 55), l: 14 })
    : hslToHex({ h, s: clamp(s, 0, 70), l: 93 });
  const accentToken = adjustL(accentHex, isDark ? 10 : 12);
  const textLink = isDark
    ? accentHex
    : relativeLuminance(accentHex) > 0.4
      ? adjustL(accentHex, -18)
      : accentHex;
  return {
    primary: accentHex,
    primaryDark,
    primaryLight,
    secondary: accentHex,
    accent: accentToken,
    textLink,
    tabBarActive: accentHex,
    messageBubbleUser: accentHex,
    textInverse: onAccent,
    messageBubbleUserText: onAccent,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/theme/__tests__/deriveAccent.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/theme/deriveAccent.ts apps/mobile/src/theme/__tests__/deriveAccent.test.ts
git commit -m "feat(mobile): add pure accent color-derivation util"
```

---

### Task 5: Mobile — preset accents + `applyThemePatch` persist helper (TDD)

**Files:**
- Create: `apps/mobile/src/theme/presetAccents.ts`
- Create: `apps/mobile/src/utils/theme.ts`
- Create: `apps/mobile/src/utils/__tests__/theme.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_ACCENT = '#E37F2B'`, `PRESET_ACCENTS: string[]` (curated non-default swatches).
  - `interface ThemePatch { themeMode?: ThemeMode; accentColor?: string | null }`
  - `interface ThemePersistDeps { isLoggedIn: boolean; applyLocal: (p: ThemePatch) => void; persist: (p: ThemePatch) => Promise<unknown>; onPersistError?: (e: unknown) => void }`
  - `applyThemePatch(patch: ThemePatch, deps: ThemePersistDeps): void`

- [ ] **Step 1: Write the failing test for `applyThemePatch`**

Create `apps/mobile/src/utils/__tests__/theme.test.ts`:

```ts
import { applyThemePatch } from '../theme';

describe('applyThemePatch', () => {
  it('always applies locally', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    applyThemePatch({ themeMode: 'dark' }, { isLoggedIn: false, applyLocal, persist });
    expect(applyLocal).toHaveBeenCalledWith({ themeMode: 'dark' });
  });

  it('does not persist when logged out', () => {
    const persist = jest.fn().mockResolvedValue(undefined);
    applyThemePatch({ accentColor: '#AABBCC' }, { isLoggedIn: false, applyLocal: jest.fn(), persist });
    expect(persist).not.toHaveBeenCalled();
  });

  it('persists when logged in', () => {
    const persist = jest.fn().mockResolvedValue(undefined);
    applyThemePatch({ accentColor: null }, { isLoggedIn: true, applyLocal: jest.fn(), persist });
    expect(persist).toHaveBeenCalledWith({ accentColor: null });
  });

  it('routes a rejected persist to onPersistError (non-fatal)', async () => {
    const err = new Error('offline');
    const persist = jest.fn().mockRejectedValue(err);
    const onPersistError = jest.fn();
    applyThemePatch({ themeMode: 'light' }, { isLoggedIn: true, applyLocal: jest.fn(), persist, onPersistError });
    await Promise.resolve();
    await Promise.resolve();
    expect(onPersistError).toHaveBeenCalledWith(err);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/utils/__tests__/theme.test.ts`
Expected: FAIL with "Cannot find module '../theme'".

- [ ] **Step 3: Implement `utils/theme.ts`**

Create `apps/mobile/src/utils/theme.ts`:

```ts
import type { ThemeMode } from '@budget/shared-types';

export interface ThemePatch {
  themeMode?: ThemeMode;
  accentColor?: string | null;
}

export interface ThemePersistDeps {
  /** Whether a user session exists (drives whether we persist to the server). */
  isLoggedIn: boolean;
  /** Apply optimistically to local state (MMKV + authStore user). Always runs. */
  applyLocal: (patch: ThemePatch) => void;
  /** Persist server-side. May reject (offline). */
  persist: (patch: ThemePatch) => Promise<unknown>;
  /** Non-fatal persist failure handler. */
  onPersistError?: (error: unknown) => void;
}

/**
 * Mirrors applyCurrencyChange: optimistic local update first, then a
 * fire-and-forget server persist (only when logged in) whose failure is
 * non-fatal (works offline).
 */
export function applyThemePatch(patch: ThemePatch, deps: ThemePersistDeps): void {
  deps.applyLocal(patch);
  if (deps.isLoggedIn) {
    deps.persist(patch).catch((error) => deps.onPersistError?.(error));
  }
}
```

- [ ] **Step 4: Implement `presetAccents.ts`**

Create `apps/mobile/src/theme/presetAccents.ts`:

```ts
/** Built-in default accent (matches lightColors/darkColors.primary). null selects this. */
export const DEFAULT_ACCENT = '#E37F2B';

/** Curated preset accents shown as swatches (excludes the default, which has its own swatch). */
export const PRESET_ACCENTS: string[] = [
  '#EF4444', // red
  '#EC4899', // pink
  '#A855F7', // purple
  '#6366F1', // indigo
  '#3B82F6', // blue
  '#06B6D4', // cyan
  '#10B981', // emerald
  '#22C55E', // green
  '#EAB308', // amber
  '#F97316', // deep orange
  '#8B5CF6', // violet
  '#0EA5E9', // sky
];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/mobile && npx jest src/utils/__tests__/theme.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/theme/presetAccents.ts apps/mobile/src/utils/theme.ts apps/mobile/src/utils/__tests__/theme.test.ts
git commit -m "feat(mobile): add preset accents + applyThemePatch persist helper"
```

---

### Task 6: Mobile — `api.updateProfile` signature + `themeStore` extension

**Files:**
- Modify: `apps/mobile/src/services/users.api.ts:15-20` (`updateProfile` signature)
- Modify: `apps/mobile/src/stores/themeStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `applyThemePatch`, `ThemePatch` from `@/utils/theme`; `useAuthStore` from `@/stores/authStore`; `api` from `@/services/api`.
- Produces: `useThemeStore` with `{ mode: ThemeMode; accent: string | null; customAccent: string | null; setMode; setAccent; setCustomAccent }`.

- [ ] **Step 1: Widen `api.updateProfile`**

In `apps/mobile/src/services/users.api.ts`, update the `updateProfile` param type (line ~15):

```ts
  updateProfile(data: { name?: string; currencyCode?: string; timezone?: string; language?: string; contributeCommunityPrices?: boolean; themeMode?: string; accentColor?: string | null }) {
    return httpClient.request<any>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
```

- [ ] **Step 2: Rewrite `themeStore.ts`**

Replace the entire contents of `apps/mobile/src/stores/themeStore.ts`:

```ts
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { ThemeMode } from '@budget/shared-types';
import { api } from '../services/api';
import { useAuthStore } from './authStore';
import { applyThemePatch } from '../utils/theme';

interface ThemeState {
  mode: ThemeMode;
  accent: string | null;      // local fallback / mirror; null = default
  customAccent: string | null; // last custom color chosen (local only)
  setMode: (mode: ThemeMode) => void;
  setAccent: (hex: string | null) => void;
  setCustomAccent: (hex: string) => void;
}

const mmkv = new MMKV({ id: 'theme-storage' });

export const useThemeStore = create<ThemeState>((set) => ({
  mode: (mmkv.getString('themeMode') as ThemeMode) || 'system',
  accent: mmkv.getString('accentColor') ?? null,
  customAccent: mmkv.getString('customAccent') ?? null,

  setMode: (mode) => {
    mmkv.set('themeMode', mode);
    set({ mode });
    applyThemePatch(
      { themeMode: mode },
      {
        isLoggedIn: !!useAuthStore.getState().user,
        applyLocal: (p) => useAuthStore.getState().updateUser(p),
        persist: (p) => api.updateProfile(p),
        onPersistError: (e) => console.warn('Failed to persist theme mode:', e),
      },
    );
  },

  setAccent: (hex) => {
    if (hex === null) {
      mmkv.delete('accentColor');
    } else {
      mmkv.set('accentColor', hex);
    }
    set({ accent: hex });
    applyThemePatch(
      { accentColor: hex },
      {
        isLoggedIn: !!useAuthStore.getState().user,
        applyLocal: (p) => useAuthStore.getState().updateUser(p),
        persist: (p) => api.updateProfile(p),
        onPersistError: (e) => console.warn('Failed to persist accent color:', e),
      },
    );
  },

  setCustomAccent: (hex) => {
    mmkv.set('customAccent', hex);
    set({ customAccent: hex });
  },
}));
```

> `updateUser` (authStore) accepts `Partial<User>`; `{ themeMode }` / `{ accentColor }` are valid User keys after Task 1. When logged out, `updateUser` no-ops (user is null) — harmless.
> Circular-import check: `authStore` does NOT import `themeStore`, so importing `useAuthStore` here is safe. If a cycle ever appears, switch to a lazy `require('./authStore')` inside the setters.

- [ ] **Step 3: Typecheck the mobile app**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/users.api.ts apps/mobile/src/stores/themeStore.ts
git commit -m "feat(mobile): themeStore persists mode+accent (optimistic + fire-and-forget)"
```

---

### Task 7: Mobile — `authStore` user object carries theme fields

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts` (the `const user: User = {...}` blocks in `login`, `register`, `googleLogin`, `verifyEmail`; the `getProfile` merge in `login`/`biometricLogin`).

**Interfaces:**
- Consumes: `AuthResponse.user.themeMode/accentColor` (Task 1), `getProfile` returning `themeMode/accentColor` (Task 3).
- Produces: `authStore.user.themeMode` / `authStore.user.accentColor` populated after auth.

- [ ] **Step 1: Add theme fields to each `user` object built from an auth response**

In `apps/mobile/src/stores/authStore.ts`, in `login` (~line 126), `register` (~238), `googleLogin` (~305), and `verifyEmail` (~531), each builds a `const user: User = { ... }` from `response.user`. Add to **each** object (after `isVerified:`):

```ts
            themeMode: (response.user.themeMode as User['themeMode']) ?? 'system',
            accentColor: (response.user.accentColor as string | null) ?? null,
```

(In `verifyEmail`, the object is indented differently — match its indentation.)

- [ ] **Step 2: Refresh theme fields in the `getProfile` merges**

In `login` (~166) and `googleLogin` (~339), the `try { const profile = await api.getProfile(); ... }` block builds an `updatedUser`. Extend the merged object to also pull theme fields when present. For `login`'s block, change:

```ts
            if (profile.isAdmin || profile.aiResponseMode || profile.aiModel) {
              const updatedUser = { ...user, isAdmin: profile.isAdmin, aiResponseMode: profile.aiResponseMode || 'balanced', aiModel: profile.aiModel || 'balanced' };
```

to:

```ts
            if (profile.isAdmin || profile.aiResponseMode || profile.aiModel || profile.themeMode || profile.accentColor !== undefined) {
              const updatedUser = { ...user, isAdmin: profile.isAdmin, aiResponseMode: profile.aiResponseMode || 'balanced', aiModel: profile.aiModel || 'balanced', themeMode: profile.themeMode ?? user.themeMode, accentColor: profile.accentColor ?? user.accentColor };
```

Apply the same edit to the `googleLogin` block. In `biometricLogin` (~388), the `updatedUser` is built unconditionally — add `themeMode: profile.themeMode ?? user.themeMode, accentColor: profile.accentColor ?? user.accentColor,` to it.

> `initialize()` restores `user` from the secureStorage JSON, which already includes `themeMode`/`accentColor` (written by `updateUser`), so cold-start needs no change.

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts
git commit -m "feat(mobile): carry themeMode+accentColor through auth flows"
```

---

### Task 8: Mobile — `ThemeContext` reads user theme + merges accent

**Files:**
- Modify: `apps/mobile/src/theme/ThemeContext.tsx`

**Interfaces:**
- Consumes: `useThemeStore` (mode/accent fallback), `useAuthStore` (user), `deriveAccentColors`.
- Produces: `useTheme()` colors already include the accent override; `getTabBarTheme`/`getStackHeaderTheme` inherit it (no change needed — verified: they read `theme.colors.tabBarActive/primary/textInverse`).

- [ ] **Step 1: Rewrite the provider body**

Replace `ThemeProvider` in `apps/mobile/src/theme/ThemeContext.tsx` (keep imports at top, add the two new ones):

```tsx
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { lightColors, darkColors, type ThemeColors } from './colors';
import { deriveAccentColors } from './deriveAccent';
import { shadows, darkShadows, type ShadowPresets } from './shadows';
import { spacing } from './spacing';
import { borderRadius } from './borderRadius';
import { textStyles, fontFamilies } from './typography';
```

```tsx
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const localMode = useThemeStore((s) => s.mode);
  const localAccent = useThemeStore((s) => s.accent);
  const user = useAuthStore((s) => s.user);
  const systemScheme = useColorScheme();

  // When authenticated, the user row is the sole source of truth; otherwise
  // fall back to the local MMKV mirror (instant paint / pre-auth screens).
  const mode = user ? (user.themeMode ?? 'system') : (localMode ?? 'system');
  const accent = user ? (user.accentColor ?? null) : (localAccent ?? null);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const theme = useMemo<Theme>(() => {
    const base = isDark ? darkColors : lightColors;
    const colors: ThemeColors = accent
      ? { ...base, ...deriveAccentColors(base, accent, isDark) }
      : base;
    return {
      colors,
      shadows: isDark ? darkShadows : shadows,
      spacing,
      borderRadius,
      textStyles,
      fonts: fontFamilies,
      isDark,
    };
  }, [isDark, accent]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}
```

(Leave the `Theme` interface, `defaultTheme`, `ThemeContext`, and `useTheme` export unchanged.)

- [ ] **Step 2: Verify navigation theming inherits the accent (no code change expected)**

Open `apps/mobile/src/theme/navigationTheme.ts` and confirm `getTabBarTheme`/`getStackHeaderTheme` read `theme.colors.*` (they do). Since `theme.colors` now carries the accent override, the tab bar active tint + header background follow the accent automatically. No edit needed.

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the derivation doesn't break non-accent `textInverse` usages**

Run: `cd apps/mobile && grep -rn "textInverse" src app | grep -v "__tests__"`
Read the hits. `textInverse` should only appear on colored/primary/emphasis surfaces (buttons, badges, chips on `primary`). If you find a usage on a genuinely dark **non-accent** surface (where dark text would be wrong for a light accent), do NOT ship the global override for it — instead remove `textInverse` from `deriveAccentColors`'s return, add a dedicated `onPrimary` token to `ThemeColors` (default `'#FFFFFF'` in both palettes, derived = `readableOn(accent)`), and switch only that one component to `onPrimary`. Record the decision in the commit message. (Expected outcome from the audit: all uses are on-accent, so the global override is fine — but verify, don't assume.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/theme/ThemeContext.tsx
git commit -m "feat(mobile): merge user accent into theme colors, prefer user theme over local"
```

---

### Task 9: Mobile — `ColorPicker` component

**Files:**
- Create: `apps/mobile/src/components/ColorPicker.tsx`

**Interfaces:**
- Consumes: `hexToHsl`, `hslToHex`, `readableOn` from `@/theme/deriveAccent`; `useTheme`, `useStyles` from `@/theme`; `expo-linear-gradient`.
- Produces: `<ColorPicker initialColor={string} onApply={(hex: string) => void} onReset={() => void} onClose={() => void} />` (rendered inside a bottom-sheet Modal by the caller).

- [ ] **Step 1: Implement the picker**

Create `apps/mobile/src/components/ColorPicker.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, PanResponder, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { hexToHsl, hslToHex, readableOn } from '@/theme/deriveAccent';

interface Props {
  initialColor: string;
  onApply: (hex: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ColorPicker({ initialColor, onApply, onReset, onClose }: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { t } = useTranslation();

  const init = useMemo(() => hexToHsl(HEX_RE.test(initialColor) ? initialColor : '#E37F2B'), [initialColor]);
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [l, setL] = useState(init.l);
  const [hexText, setHexText] = useState(hslToHex(init));

  const [hueW, setHueW] = useState(1);
  const [sqW, setSqW] = useState(1);
  const [sqH, setSqH] = useState(1);

  const current = hslToHex({ h, s, l });

  const syncFromHsl = (nh: number, ns: number, nl: number) => {
    setHexText(hslToHex({ h: nh, s: ns, l: nl }));
  };

  const huePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const x = Math.max(0, Math.min(hueW, e.nativeEvent.locationX));
          const nh = (x / hueW) * 360;
          setH(nh);
          syncFromHsl(nh, s, l);
        },
        onPanResponderMove: (e) => {
          const x = Math.max(0, Math.min(hueW, e.nativeEvent.locationX));
          const nh = (x / hueW) * 360;
          setH(nh);
          syncFromHsl(nh, s, l);
        },
      }),
    [hueW, s, l],
  );

  const squarePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => handleSquare(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: (e) => handleSquare(e.nativeEvent.locationX, e.nativeEvent.locationY),
      }),
    [sqW, sqH, h],
  );

  function handleSquare(x: number, y: number) {
    const ns = Math.max(0, Math.min(100, (x / sqW) * 100));
    const nl = Math.max(0, Math.min(100, 100 - (y / sqH) * 100));
    setS(ns);
    setL(nl);
    syncFromHsl(h, ns, nl);
  }

  const onHexChange = (text: string) => {
    setHexText(text);
    if (HEX_RE.test(text)) {
      const parsed = hexToHsl(text);
      setH(parsed.h);
      setS(parsed.s);
      setL(parsed.l);
    }
  };

  const hueThumbX = (h / 360) * hueW;
  const sqThumbX = (s / 100) * sqW;
  const sqThumbY = (1 - l / 100) * sqH;
  const hexValid = HEX_RE.test(hexText);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('settings.pickColor')}</Text>

      {/* Saturation / lightness square */}
      <View
        style={styles.square}
        onLayout={(ev: LayoutChangeEvent) => {
          setSqW(ev.nativeEvent.layout.width);
          setSqH(ev.nativeEvent.layout.height);
        }}
        {...squarePan.panHandlers}
      >
        <View style={[styles.squareFill, { backgroundColor: hslToHex({ h, s: 100, l: 50 }) }]} />
        <LinearGradient
          colors={['#FFFFFF', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.squareFill}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.squareFill}
        />
        <View pointerEvents="none" style={[styles.squareThumb, { left: sqThumbX - 8, top: sqThumbY - 8 }]} />
      </View>

      {/* Hue slider */}
      <View style={styles.hue} onLayout={(ev) => setHueW(ev.nativeEvent.layout.width)} {...huePan.panHandlers}>
        <LinearGradient
          colors={HUE_STOPS as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.hueFill}
        />
        <View pointerEvents="none" style={[styles.hueThumb, { left: Math.max(0, Math.min(hueW - 4, hueThumbX - 2)) }]} />
      </View>

      {/* Hex input + preview */}
      <View style={styles.row}>
        <TextInput
          value={hexText}
          onChangeText={onHexChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={[styles.hexInput, !hexValid && styles.hexInputInvalid]}
          placeholder="#RRGGBB"
          placeholderTextColor={theme.colors.textTertiary}
        />
        <View style={styles.previewRow}>
          <View style={[styles.previewBtn, { backgroundColor: current }]}>
            <Text style={{ color: readableOn(current), fontSize: 12, fontWeight: '600' }}>Aa</Text>
          </View>
          <View style={[styles.previewDot, { backgroundColor: current }]} />
        </View>
      </View>
      {!hexValid && <Text style={styles.invalid}>{t('settings.invalidColor')}</Text>}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onReset}>
          <Text style={styles.secondaryText}>{t('settings.resetAccent')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: current }, !hexValid && styles.disabledBtn]}
          disabled={!hexValid}
          onPress={() => { onApply(current); onClose(); }}
        >
          <Text style={[styles.primaryText, { color: readableOn(current) }]}>{t('settings.applyColor')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: { gap: theme.spacing[3] },
  title: { ...theme.textStyles.h4, color: theme.colors.textPrimary },
  square: { width: '100%' as const, height: 170, borderRadius: theme.borderRadius.md, overflow: 'hidden' as const, position: 'relative' as const },
  squareFill: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const) },
  squareThumb: { position: 'absolute' as const, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF' },
  hue: { width: '100%' as const, height: 24, borderRadius: 12, overflow: 'hidden' as const, justifyContent: 'center' as const },
  hueFill: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const) },
  hueThumb: { position: 'absolute' as const, width: 4, height: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#00000033' },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  hexInput: { flex: 1, ...theme.textStyles.body, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.borderRadius.md, paddingHorizontal: theme.spacing[3], paddingVertical: theme.spacing[2], borderWidth: 1, borderColor: theme.colors.border },
  hexInputInvalid: { borderColor: theme.colors.danger },
  previewRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  previewBtn: { width: 40, height: 32, borderRadius: theme.borderRadius.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  previewDot: { width: 16, height: 16, borderRadius: 8 },
  invalid: { ...theme.textStyles.bodySmMedium, color: theme.colors.danger },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3], marginTop: theme.spacing[2] },
  secondaryBtn: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: theme.spacing[3], borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border },
  secondaryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  primaryBtn: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: theme.spacing[3], borderRadius: theme.borderRadius.lg },
  primaryText: { ...theme.textStyles.bodyMedium },
  disabledBtn: { opacity: 0.5 },
});
```

> If `theme.textStyles.h4` / `bodyMedium` / `bodySmMedium` don't exist, open `apps/mobile/src/theme/typography.ts` and substitute the nearest existing keys (the appearance screen uses `body`, `bodySmMedium`). Keep the component compiling.

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors. (No render test — this codebase does not unit-test WebView/gesture components, only their pure helpers, per CLAUDE.md `ShareImageCard` note.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/ColorPicker.tsx
git commit -m "feat(mobile): add in-house color picker (hue + S/L + hex, no native dep)"
```

---

### Task 10: Mobile — Accent section on the appearance screen + i18n

**Files:**
- Modify: `apps/mobile/app/settings/appearance.tsx`
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Consumes: `useThemeStore` (`accent`, `customAccent`, `setAccent`, `setCustomAccent`), `DEFAULT_ACCENT`, `PRESET_ACCENTS`, `ColorPicker`.

- [ ] **Step 1: Add the 7 i18n keys to all 9 locales**

Use the `i18n-add-strings` skill to keep files in sync. Add these keys **inside the existing `settings` object** of each locale. Values:

| key | en | de | es | fr | pl | ru | ua | be | nl |
|---|---|---|---|---|---|---|---|---|---|
| accentColor | Accent color | Akzentfarbe | Color de acento | Couleur d’accent | Kolor akcentu | Акцентный цвет | Акцентний колір | Акцэнтны колер | Accentkleur |
| accentDefault | Default | Standard | Predeterminado | Par défaut | Domyślny | По умолчанию | За замовчуванням | Па змаўчанні | Standaard |
| customColor | Custom | Eigene | Personalizado | Personnalisée | Własny | Свой | Власний | Свой | Aangepast |
| pickColor | Pick a color | Farbe wählen | Elegir un color | Choisir une couleur | Wybierz kolor | Выберите цвет | Виберіть колір | Выберыце колер | Kies een kleur |
| applyColor | Apply | Übernehmen | Aplicar | Appliquer | Zastosuj | Применить | Застосувати | Ужыць | Toepassen |
| resetAccent | Reset to default | Auf Standard zurücksetzen | Restablecer | Réinitialiser | Przywróć domyślny | Сбросить | Скинути | Скінуць | Terug naar standaard |
| invalidColor | Invalid color | Ungültige Farbe | Color no válido | Couleur invalide | Nieprawidłowy kolor | Неверный цвет | Невірний колір | Няправільны колер | Ongeldige kleur |

- [ ] **Step 2: Add the Accent section + picker modal to `appearance.tsx`**

Extend `apps/mobile/app/settings/appearance.tsx`. Add imports at the top:

```tsx
import { Modal } from 'react-native';
import { DEFAULT_ACCENT, PRESET_ACCENTS } from '@/theme/presetAccents';
import { ColorPicker } from '@/components/ColorPicker';
```

Inside the component, read the accent state and add picker visibility:

```tsx
  const { mode, setMode, accent, customAccent, setAccent, setCustomAccent } = useThemeStore();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const activeAccent = accent ?? DEFAULT_ACCENT;
  const isPreset = accent !== null && PRESET_ACCENTS.includes(accent);
  const isCustom = accent !== null && !PRESET_ACCENTS.includes(accent);
```

After the existing theme `themeRow` block (before `</ScrollView>`), add:

```tsx
        {/* Accent */}
        <Text style={styles.sectionTitle}>{t('settings.accentColor')}</Text>
        <View style={styles.swatchGrid}>
          {/* Default swatch */}
          <TouchableOpacity
            style={[styles.swatch, { backgroundColor: DEFAULT_ACCENT }, accent === null && styles.swatchActive]}
            onPress={() => setAccent(null)}
          >
            {accent === null && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
          </TouchableOpacity>

          {/* Preset swatches */}
          {PRESET_ACCENTS.map((hex) => (
            <TouchableOpacity
              key={hex}
              style={[styles.swatch, { backgroundColor: hex }, accent === hex && styles.swatchActive]}
              onPress={() => setAccent(hex)}
            >
              {accent === hex && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </TouchableOpacity>
          ))}

          {/* Custom swatch */}
          <TouchableOpacity
            style={[
              styles.swatch,
              styles.customSwatch,
              { backgroundColor: customAccent ?? theme.colors.surfaceSecondary },
              isCustom && styles.swatchActive,
            ]}
            onPress={() => setPickerOpen(true)}
          >
            <Ionicons
              name={isCustom ? 'checkmark' : 'add'}
              size={16}
              color={customAccent ? '#FFFFFF' : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />
              <ColorPicker
                initialColor={customAccent ?? activeAccent}
                onApply={(hex) => { setCustomAccent(hex); setAccent(hex); }}
                onReset={() => { setAccent(null); setPickerOpen(false); }}
                onClose={() => setPickerOpen(false)}
              />
            </View>
          </View>
        </Modal>
```

Add the missing style keys to `createStyles`:

```ts
  swatchGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: theme.colors.textPrimary,
  },
  customSwatch: {
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.border,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end' as const,
  },
  modalSheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[3],
  },
  sheetHandle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing[2],
  },
```

> If `theme.borderRadius.xl` doesn't exist, use `.lg`. Confirm against `apps/mobile/src/theme/borderRadius.ts`.

- [ ] **Step 3: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.
Run: `npm run lint`
Expected: no errors in touched files (`console.warn` is allowed).

- [ ] **Step 4: Manual smoke test (web is fastest)**

Run: `npm run dev:web` (from repo root)
Verify on `settings/appearance`: default + preset swatches render; tapping a preset recolors the app instantly (tab bar active tint, primary buttons); the custom swatch opens the picker; dragging hue/SL + typing a hex updates the preview; Apply recolors the app and remembers the custom swatch; Reset returns to the orange default. Toggle light/dark — the accent persists across both. (SQLite offline flows are degraded on web, but theme + profile PATCH work.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/settings/appearance.tsx apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add accent swatches + custom color picker to appearance settings"
```

---

### Task 11: Finalize — full verification + docs + ABA issue

**Files:**
- Modify: `CLAUDE.md` (add a theme-customization bullet under Mobile)
- Modify: `user_docs/<lang>/*.md` help for appearance/settings, if a section exists (then `npm run generate:help`)

- [ ] **Step 1: Run the full verification suite**

Run: `cd apps/api && npx jest src/modules/users/users.controller.spec.ts`
Expected: PASS.
Run: `cd apps/mobile && npx jest src/theme/__tests__/deriveAccent.test.ts src/utils/__tests__/theme.test.ts`
Expected: PASS.
Run: `npm run typecheck` (repo root)
Expected: no errors across packages.
Run: `npm run lint` (repo root)
Expected: clean.

- [ ] **Step 2: Update CLAUDE.md**

Add a concise bullet under the Mobile section describing: accent color on top of light/dark, stored on `User.themeMode`/`accentColor` (synced, currency pattern), MMKV fallback, `deriveAccent` pure util, preset swatches + in-house `ColorPicker`, the `PATCH /users/me` validation, and the files involved.

- [ ] **Step 3: Update in-app help (if applicable)**

If `user_docs/*/` has an appearance/settings section covering theme, add a short paragraph about the accent color in all 9 languages, then run `npm run generate:help` from the repo root (never hand-edit `apps/mobile/src/help/content.ts`). If no such section exists, skip.

- [ ] **Step 4: Create the ABA issue**

Use the `finish-aba-task` skill: run `gh issue list --limit 1`, compute the next `ABA-{N}`, create the issue (English), and confirm the URL. Reference the spec and plan paths in the issue body.

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md apps/mobile/src/help/ user_docs/
git commit -m "docs: document theme customization (ABA-<N>)"
```

---

## Self-Review

**Spec coverage:**
- §1 Data model & persistence → Tasks 1 (types), 2 (schema/migration), 3 (API + validation + auth responses), 6 (api client + themeStore setters), 7 (authStore carries fields). ✓
- §2 Color derivation → Task 4 (`deriveAccent`, incl. on-accent luminance + light/dark `primaryDark` direction). ✓
- §3 ThemeContext wiring (user-preferred source, accent merge, navigation inherit) → Task 8. ✓
- §4 Constructor UI (swatches + picker) → Tasks 9 (picker) + 10 (swatches + modal). ✓
- §5 Edge cases: contrast (Task 4 `readableOn`/`textLink`), invalid hex (Task 3 server + Task 9 client), web (Task 10 smoke), offline (`applyThemePatch` in Task 5, `console.warn`). ✓
- §6 Files touched → covered across tasks. ✓
- §7 Testing → Task 3 (API validation), Task 4 (`deriveAccent`), Task 5 (`applyThemePatch`). ✓ (themeStore MMKV writes intentionally not unit-tested — logic extracted to the pure `applyThemePatch`, matching the repo's "test the pure helper" ethos.)
- §8 i18n keys → Task 10 (all 9 locales, concrete values). ✓

**Placeholder scan:** No TBD/TODO. The two "if a token/radius key doesn't exist, substitute the nearest" notes are concrete fallbacks with named files to check, not deferred work.

**Type consistency:** `ThemeMode`, `ThemePatch`, `deriveAccentColors`, `hexToHsl/hslToHex/readableOn/relativeLuminance`, `applyThemePatch`, `useThemeStore` shape, and `ColorPicker` props are used with identical names/signatures across the tasks that define and consume them.
