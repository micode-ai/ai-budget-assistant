# Reference Data ("Справочники") Section — Design

**Date:** 2026-05-28
**Status:** Approved (pending spec review)
**Scope:** Mobile app (`apps/mobile`) — navigation/IA only

## Problem

Reference-data CRUD entities are scattered across the app:

- **Categories** — `app/settings/categories.tsx` (Settings row)
- **Merchants** — `app/settings/merchants.tsx` (Settings row)
- **Tags** — `app/tags/manage.tsx` (reached from pickers, not in Settings)
- **Projects** — `app/projects/{index,new,[id]}.tsx` (reached from the project picker, not in Settings)

There is no single place to manage these "dictionary" entities. The user wants them edited from one dedicated section called **Reference data** ("Справочники").

## Goal

Add a single **Reference data** hub in Settings that links to the four existing CRUD screens, and remove the now-redundant individual Settings rows for Categories and Merchants.

## Non-Goals (YAGNI)

- No redesign/unification of the four existing CRUD screens — they keep their current look and routes.
- No file moves / route changes for the existing screens (avoids breaking picker entry points and deep links).
- Inline "quick create" during transaction entry (`CreateCategoryModal`, project "new" from picker, etc.) is **unchanged**.
- Wallets/Accounts are **not** included (they are transactional, not reference data).

## Approach (chosen: A — standalone hub, no file moves)

A new hub screen lists the four entities and navigates to their **existing** routes. Routes stay the same, so picker entry points and deep links keep working. Minimal code, no regression risk.

Rejected alternatives:
- **B — move files into `app/settings/reference/` group.** Changes routes; breaks picker entries for projects/tags; tags/projects can't physically move without editing those call sites. More risk, little benefit.
- **C — top-level destination outside Settings** (tab/home card). Overkill; the user chose to consolidate within Settings.

## Design

### 1. New hub screen — `apps/mobile/app/settings/reference.tsx`

- Reuses the row pattern from `settings/index.tsx` (icon chip + label + description + chevron), wrapped in `SafeAreaView` + `ScrollView` + card.
- Four rows, each `router.push` to an existing route:

  | Row | Label key | Desc key | Route | Icon |
  |---|---|---|---|---|
  | Categories | `settingsNav.categories` | `settingsNav.categoriesDesc` | `/settings/categories` | `pricetags-outline` |
  | Merchants | `settingsNav.merchants` | `settingsNav.merchantsDesc` | `/settings/merchants` | `storefront-outline` |
  | Tags | `settingsNav.tags` | `settingsNav.tagsDesc` | `/tags/manage` | `pricetag-outline` |
  | Projects | `settingsNav.projects` | `settingsNav.projectsDesc` | `/projects` | `folder-outline` |

### 2. `apps/mobile/app/settings/index.tsx`

- Remove the `Categories` (`/settings/categories`) and `Merchants` (`/settings/merchants`) rows from the `categories` array.
- Add one row in their place:
  - icon `library-outline`, label `settingsNav.referenceData`, desc `settingsNav.referenceDataDesc`, route `/settings/reference`.

### 3. `apps/mobile/app/_layout.tsx`

- Register the new route with a header, mirroring the existing settings sub-screens:

  ```tsx
  <Stack.Screen
    name="settings/reference"
    options={{ headerShown: true, title: t('settingsNav.referenceData') }}
  />
  ```

### 4. i18n — all 8 locale files (`en, de, es, fr, pl, ru, ua, be`)

Add to the `settingsNav` block:
- `referenceData` / `referenceDataDesc`
- `tags` / `tagsDesc`
- `projects` / `projectsDesc`

(`categories`/`categoriesDesc`/`merchants`/`merchantsDesc` already exist in `settingsNav` and are reused.)

English source values:
- `referenceData`: "Reference data"
- `referenceDataDesc`: "Categories, merchants, tags and projects"
- `tags`: "Tags"
- `tagsDesc`: "Create, rename, or remove tags"
- `projects`: "Projects"
- `projectsDesc`: "Manage your projects"

Russian: `referenceData` = "Справочники", `referenceDataDesc` = "Категории, продавцы, теги и проекты". The other 6 locales get equivalent translations.

## Files Touched

| File | Change |
|---|---|
| `apps/mobile/app/settings/reference.tsx` | **new** hub screen |
| `apps/mobile/app/settings/index.tsx` | remove 2 rows, add 1 "Reference data" row |
| `apps/mobile/app/_layout.tsx` | register `settings/reference` route with header |
| `apps/mobile/src/i18n/locales/*.ts` (×8) | add `settingsNav` keys |

## Verification

- Settings shows a single **Reference data** row (no separate Categories/Merchants rows).
- Tapping it opens the hub with 4 rows; each opens the correct existing screen with its header + back button.
- Existing flows still work: editing a category/merchant, project picker → "new project", tag picker.
- `npm run typecheck` passes; all 8 locales contain the new keys (no missing-key fallbacks).

## Out-of-scope Follow-ups (not in this task)

- Unifying the four CRUD screens to a single visual style (list + bottom-sheet like categories).
- A help section entry for the new "Reference data" hub.
