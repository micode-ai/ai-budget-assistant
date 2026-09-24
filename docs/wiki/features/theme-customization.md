# Theme customization — mode and accent colour

*Hub: [mobile-app](../mobile-app.md)*

## What this is

Light and dark stay the built-in bases; on top, the user picks an **accent colour** that recolours
only the brand tokens. Both choices are stored per user on the server, so they follow the user
across devices.

## Entry points

- Schema: `User.themeMode` (`light` / `dark` / `system`, default `system`), `User.accentColor`
  (`#RRGGBB` or null = default `#E37F2B`); validated in `PATCH /users/me`, returned by `getProfile`
  and every auth response
- `apps/mobile/src/theme/ThemeContext.tsx` — resolves mode and accent, merges derived colours
- `apps/mobile/src/theme/deriveAccent.ts` — one accent → the brand tokens
- `apps/mobile/src/theme/presetAccents.ts`, `src/theme/colors.ts` (`onSemantic`)
- `apps/mobile/src/stores/themeStore.ts` — MMKV mirror, `seedLegacyThemeFromLocal`
- `apps/mobile/src/utils/theme.ts` — `applyThemePatch`
- UI: `src/components/settings/appearance/AppearanceSettings.tsx` (behind the thin
  `app/settings/appearance.tsx` route), `src/components/ColorPicker.tsx`

## Key concepts

**Writes mirror the currency pattern**: `setMode` / `setAccent` write MMKV, then `applyThemePatch`
updates `authStore` optimistically and persists with a fire-and-forget `api.updateProfile`
(`console.warn` on failure). `setCustomAccent` — the last custom colour — is MMKV-only.

**Derived tokens.** `deriveAccentColors` maps the accent to `primary`, `primaryDark`,
`primaryLight`, `secondary`, `accent`, `textLink`, `tabBarActive`, `messageBubbleUser`, plus the
on-accent foregrounds `textInverse` and `messageBubbleUserText`, chosen by luminance. `primaryDark`
darkens in light mode and lightens in dark. Navigation themes inherit the accent for free.

**The colour picker is in-house** — hue slider, saturation/lightness square via `PanResponder`, hex
input, live preview — with no native dependency beyond `expo-linear-gradient`. Accent is a personal
preference, so it is not `canEdit`-gated.

## Invariants

**Precedence differs between mode and accent, on purpose.**
`mode = user?.themeMode ?? localMode ?? 'system'` — falls through to the local mirror so a choice
made before the feature existed survives the upgrade.
`accent = user ? (user.accentColor ?? null) : (localAccent ?? null)` — when signed in, the server is
the **only** source; falling through to local would undo an explicit reset to default.

**`textInverse` means two things, and only one follows the accent.** It is the foreground on
`primary` surfaces (accent-derived) and was also the foreground on fixed `success`/`danger` buttons,
which must stay white whatever the accent. Those buttons use the always-white `onSemantic` token; an
audit found `income/*` and `goals/*` were the only sites.

**Seed a pre-feature local mode to the server once** (`seedLegacyThemeFromLocal`, flag
`themeSeededV1`, from `useAuthenticatedBootstrap`). Biometric login overwrites `user.themeMode` from
`getProfile`, so without the seed an old local choice would be reset to `system`.

**Quick-action icons default to `theme.colors.primary`** — the orange baked into their inlined SVG
is a placeholder replaced at render time.

## History

ABA-372.
