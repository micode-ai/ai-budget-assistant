# Theme Customization (presets + accent constructor)

**Date:** 2026-07-21
**Status:** Approved design — ready for implementation plan

## Summary

The mobile app already has light and dark themes (`theme/colors.ts` + `theme/ThemeContext.tsx`),
selectable via a `system | light | dark` mode chip on `settings/appearance.tsx`. This feature keeps
those as the built-in defaults and adds a **theme constructor**: the user picks an **accent color**
— from a row of preset swatches or a full custom color picker — and it recolors the app's brand
tokens on top of whichever light/dark base is active.

Both the theme **mode** and the **accent color** are persisted **per-user in the database** so the
theme follows the user across devices (same pattern as `user.currencyCode`, ABA-187). A local MMKV
cache is retained purely as a fallback for instant paint on cold start and pre-auth screens.

### Decisions locked during brainstorming

- **Scope:** ready-made presets + accent color (not a full 44-token editor).
- **Architecture:** accent is **orthogonal** to light/dark. Mode still controls the base
  (backgrounds/text); accent overrides only brand tokens and works in both modes.
- **Input:** preset swatches **+** a full custom picker (built in-house, no native color-picker dep).
- **Custom slot:** a **single** custom accent (not a named library of themes).
- **Persistence:** **both** `themeMode` and `accentColor` stored on the `User` row (synced across devices).

## Non-goals (YAGNI)

- No per-token full palette editor.
- No named/saved library of multiple custom themes.
- No per-preset light/dark full palettes — presets are accent colors, not complete schemes.
- No server-driven theme catalog — presets are a static client-side list.
- No theming of admin (Next.js) or the marketing site.

---

## 1. Data model & persistence

### Source of truth: `User` row

**Prisma** (`apps/api/prisma/schema.prisma`, `User` model):

```prisma
themeMode    String  @default("system") @map("theme_mode")
accentColor  String?                    @map("accent_color")   // null = built-in default (#E37F2B)
```

Defaults reproduce today's behavior exactly, so existing users see no visual change after migration.

Migration name: `20260721000000_add_user_theme_prefs` (authored DB-free via `prisma migrate diff`
if no local DB is available — same approach as the inflation-shield tracking migration).

### shared-types

`packages/shared-types/src/entities/user.ts` — extend `User`:

```ts
themeMode?: 'light' | 'dark' | 'system';
accentColor?: string | null;
```

(Introduce a `ThemeMode` type alias in `entities/primitives.ts` and reference it here and in the
mobile theme code, so the union is defined once.)

### API surface

- **`PATCH /users/me`** (`users.controller.ts` `updateProfile`): accept `themeMode?` and
  `accentColor?` in the body type, and include them in the returned object.
- **Validation** (server-side — the value flows straight into `prisma.user.update` and then into
  RN styles, so it must be sanitized):
  - `themeMode`, if present, must be one of `light | dark | system` → else `BadRequestException`.
  - `accentColor`, if present, must be `null` **or** match `/^#[0-9a-fA-F]{6}$/` → else `BadRequestException`.
  - Implemented as a small inline check in the controller/service (the existing profile body has no
    class-validator DTO; stay consistent with that style but do validate these two fields).
- **`UsersService.update`**: add `themeMode?` / `accentColor?` to the `CreateUserData` interface so
  the `Partial<CreateUserData>` spread into `prisma.user.update` type-checks.
- **`GET /users/me`** (`getProfile`): include `themeMode` and `accentColor` in the response.
- **Auth responses** (`auth.service.ts`): add `themeMode` and `accentColor` to the `user` object in
  **all** response sites (login-verified, login-unverified, register, google, verify — ~5 blocks at
  lines ~118/156/183/267/411) so the theme paints immediately after auth without a second round-trip.
- **`AuthResponse` type**: add the two fields to the `user` shape.

### Mobile local cache (fallback only)

Keep `themeStore` on MMKV id `theme-storage`, holding `mode`, `accent`, and `customAccent`:

- `mode` / `accent` are a **fallback** read only when `authStore.user` is null (cold start before
  `initialize()`, and pre-auth screens). When logged in, `authStore.user.themeMode/accentColor` wins.
- `customAccent` (last "custom color" chosen, for the custom swatch preview) is **local only**, never
  sent to the DB.

`authStore` — the user object built in `login`, `register`, `googleLogin`, `verifyEmail`, and
`initialize` must carry `themeMode` / `accentColor` from `response.user` (and the `getProfile` merge
in `login`/`biometricLogin` should refresh them). `updateUser` already persists the user JSON to
secureStorage, so cold-start restore gets the theme for free.

### Setters

Theme setters live in `themeStore` and mirror `authStore.setCurrency` / `applyCurrencyChange`:

- `setMode(mode)`: write MMKV; if logged in, optimistic `authStore.updateUser({ themeMode })` +
  fire-and-forget `api.updateProfile({ themeMode })`, `console.warn` on failure.
- `setAccent(hex | null)`: write MMKV; if logged in, optimistic `authStore.updateUser({ accentColor })`
  + fire-and-forget `api.updateProfile({ accentColor })`, `console.warn` on failure.
- `setCustomAccent(hex)`: MMKV only (local preview memory).

`api.updateProfile` (`users.api.ts`) signature gains `themeMode?: string; accentColor?: string | null`.

Offline tolerance is identical to currency: the change applies locally instantly and the network
write is best-effort.

---

## 2. Color derivation (pure core)

New pure module `apps/mobile/src/theme/deriveAccent.ts`:

```ts
deriveAccentColors(base: ThemeColors, accentHex: string, isDark: boolean): Partial<ThemeColors>
```

- Self-contained hex↔HSL helpers (no dependency).
- Overrides brand tokens from the single accent:
  - `primary = accent`
  - `primaryDark` = darken in light mode / lighten in dark mode (mirrors the existing palette, where
    dark `primaryDark` is a lighter "pop" — `#FFBA60`)
  - `primaryLight` = a very light tint of accent in light mode / a dark tint in dark mode
  - `secondary`, `accent` (token) = accent-derived shades
  - `textLink`, `tabBarActive`, `messageBubbleUser` = accent (with a readability nudge for `textLink`
    when the accent is very light on a light background)
  - `textInverse`, `messageBubbleUserText` (text sitting **on** the accent) = white or dark
    (`#1A1D26`) chosen by the accent's relative luminance, so buttons/bubbles stay legible even for a
    light accent.
- `ThemeContext` merges: `colors = accent ? { ...base, ...deriveAccentColors(base, accent, isDark) } : base`.

`textInverse` is used broadly (not only on-accent surfaces). During implementation, verify its
non-accent usages still read correctly under the luminance-derived value; if a conflict is found,
scope the on-accent foreground to `messageBubbleUserText` (+ a dedicated `onPrimary` token) rather
than globally overriding `textInverse`. Note this in the plan as a verification step.

---

## 3. ThemeContext wiring

`theme/ThemeContext.tsx`:

- Read `mode` and `accent` preferring `authStore.user` then `themeStore` fallback:
  - `mode = user?.themeMode ?? themeStore.mode ?? 'system'`
  - `accent = user?.accentColor ?? themeStore.accent ?? null`
- `isDark` computed from `mode` + `useColorScheme()` as today.
- `colors` = base (light/dark) with accent overrides merged when `accent` is set.
- `useMemo` deps: `[isDark, accent, user?.themeMode, user?.accentColor, themeStore.mode, themeStore.accent, systemScheme]`.
- Navigation theming (`getTabBarTheme`, `getStackHeaderTheme`) receives the accent-derived colors so
  the tab bar / header tints match.

---

## 4. Constructor UI

Extend `apps/mobile/app/settings/appearance.tsx` with an **Accent** section below the existing theme
mode row (keep the mode chips unchanged):

```
Accent
( ● )  ○ ○ ○ ○ ○ ○ ○ ○ ○ ○   [ + Custom ]
default    preset swatches       (opens picker)
```

- Preset swatches: `default` (the built-in orange, = `setAccent(null)`) + ~10–12 curated hexes from
  a new static `theme/presetAccents.ts`. The active swatch shows a ring / checkmark. Selecting a
  swatch calls `setAccent(hex)` (or `null` for default).
- **Custom** swatch/button: shows the current `customAccent` (or a plus icon) and opens the picker
  bottom-sheet. All accent affordances are `canEdit`-independent (theme is a personal preference, not
  account-scoped — available to viewers too, like currency).

### Color picker component

New `apps/mobile/src/components/ColorPicker.tsx` (+ a `ColorPicker.web.tsx` only if a native module
is used — plan uses none, so a single file should suffice), rendered inside a bottom-sheet `Modal`:

- Hue slider: horizontal rainbow bar (`expo-linear-gradient`, already a dependency) with a draggable
  thumb via `PanResponder`.
- Saturation/Lightness square: a 2D gradient area with a draggable thumb (`PanResponder`).
- Hex text input (validates `#RRGGBB`; two-way synced with the sliders).
- Live preview: a sample primary button, an active tab dot, and a chat bubble rendered with the
  derived colors.
- Actions: **Apply** (`setAccent(hex)` + `setCustomAccent(hex)`) and **Reset to default**
  (`setAccent(null)`).

Follow the "new screens need a header" convention only if this becomes a routed screen; as a
bottom-sheet modal it uses the sheet's own title/close affordance.

---

## 5. Edge cases

- **Contrast / readability:** on-accent foreground chosen by luminance; `textLink` nudged toward a
  readable shade on light backgrounds.
- **Invalid hex** from the picker/input: never applied locally; server also rejects.
- **Web:** everything is JS; MMKV-web (localStorage) and the picker (PanResponder + linear-gradient)
  work in the web build. No native color-picker module.
- **Offline:** theme change applies locally immediately; DB write is best-effort (`console.warn` on
  failure), re-synced on the next successful `updateProfile`.
- **Migration safety:** defaults (`system`, `null`) mean zero visual change for existing users.

---

## 6. Files touched

**API**
- `apps/api/prisma/schema.prisma` (+ migration `20260721000000_add_user_theme_prefs`)
- `apps/api/src/modules/users/users.service.ts` (`CreateUserData` fields)
- `apps/api/src/modules/users/users.controller.ts` (body type, validation, return shape)
- `apps/api/src/modules/auth/auth.service.ts` (all response `user` blocks)
- `AuthResponse` type (shared-types api/dto)

**shared-types**
- `packages/shared-types/src/entities/primitives.ts` (`ThemeMode` alias)
- `packages/shared-types/src/entities/user.ts` (`themeMode`, `accentColor`)

**Mobile**
- `apps/mobile/src/theme/deriveAccent.ts` (new, pure)
- `apps/mobile/src/theme/presetAccents.ts` (new)
- `apps/mobile/src/theme/ThemeContext.tsx`
- `apps/mobile/src/theme/index.ts` (exports)
- `apps/mobile/src/components/ColorPicker.tsx` (new)
- `apps/mobile/src/stores/themeStore.ts`
- `apps/mobile/src/stores/authStore.ts` (user object carries theme fields)
- `apps/mobile/src/services/users.api.ts` (`updateProfile` signature)
- `apps/mobile/app/settings/appearance.tsx`
- `apps/mobile/src/i18n/locales/*.ts` (all 9 locales)

---

## 7. Testing

- **Mobile (unit):**
  - `deriveAccent.ts` — hex↔HSL round-trip; on-accent foreground picks dark vs white by luminance;
    light vs dark mode branches (`primaryDark`/`primaryLight` direction); returns only brand tokens.
  - `themeStore` setters — write MMKV; when logged in, call `updateUser` + `api.updateProfile`
    (mocked); `setCustomAccent` does not hit the API; `setAccent(null)` resets to default.
- **API (unit):**
  - `updateProfile` accepts valid `themeMode`/`accentColor` and rejects invalid hex / invalid mode
    (`BadRequestException`).

---

## 8. i18n keys (all 9 locales)

Approximate set (finalize names in the plan): `settings.accentColor`, `settings.accentDefault`,
`settings.customColor`, `settings.pickColor`, `settings.applyColor`, `settings.resetAccent`,
`settings.invalidColor`. English is the source; keep all of en/de/es/fr/pl/ru/ua/be/nl in sync.
