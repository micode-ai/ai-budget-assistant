# Reference Data ("Справочники") Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single "Reference data" hub in mobile Settings that links to the four existing reference-data CRUD screens (Categories, Merchants, Tags, Projects), and remove the redundant individual Settings rows.

**Architecture:** Navigation/IA only. A new standalone hub screen (`settings/reference.tsx`) navigates to the existing routes — no files moved, no routes changed, so picker entry points and deep links keep working. Settings index swaps two rows for one. New route registered with a header in `_layout.tsx`.

**Tech Stack:** Expo Router, React Native, `react-i18next` (8 locales), Zustand (unaffected), jest (`jest-expo` preset) for the i18n key-presence test.

**Spec:** `docs/superpowers/specs/2026-05-28-reference-data-section-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts` | Add 6 keys to each `settingsNav` block |
| `apps/mobile/src/i18n/locales/__tests__/settingsNav-reference.test.ts` | **New** — assert the 6 keys exist in all 8 locales |
| `apps/mobile/app/settings/reference.tsx` | **New** — the hub screen (4 rows → existing routes) |
| `apps/mobile/app/settings/index.tsx` | Remove Categories + Merchants rows, add one "Reference data" row |
| `apps/mobile/app/_layout.tsx` | Register `settings/reference` route with a header |

---

## Task 1: i18n keys for the hub (all 8 locales) + presence test

**Files:**
- Create: `apps/mobile/src/i18n/locales/__tests__/settingsNav-reference.test.ts`
- Modify: `apps/mobile/src/i18n/locales/en.ts`, `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts` (each has a `settingsNav: { ... }` object containing `categories`/`merchants`)

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/i18n/locales/__tests__/settingsNav-reference.test.ts`:

```ts
import en from '../en';
import de from '../de';
import es from '../es';
import fr from '../fr';
import pl from '../pl';
import ru from '../ru';
import ua from '../ua';
import be from '../be';

const locales = { en, de, es, fr, pl, ru, ua, be } as const;
const keys = [
  'referenceData',
  'referenceDataDesc',
  'tags',
  'tagsDesc',
  'projects',
  'projectsDesc',
] as const;

describe('settingsNav reference-data i18n keys', () => {
  for (const [name, loc] of Object.entries(locales)) {
    const nav = (loc as any).settingsNav;
    for (const key of keys) {
      it(`${name}.settingsNav.${key} is a non-empty string`, () => {
        expect(nav).toBeDefined();
        expect(typeof nav[key]).toBe('string');
        expect(nav[key].length).toBeGreaterThan(0);
      });
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/i18n/locales/__tests__/settingsNav-reference.test.ts`
Expected: FAIL — `expected "string", got "undefined"` for `referenceData` (keys not added yet).

- [ ] **Step 3: Add the 6 keys to each locale's `settingsNav` block**

In every locale file, inside the existing `settingsNav: { ... }` object (right after the `merchantsDesc:` line), insert the language's six keys below. Keep trailing commas consistent with the file.

`en.ts`:
```ts
    referenceData: 'Reference data',
    referenceDataDesc: 'Categories, merchants, tags and projects',
    tags: 'Tags',
    tagsDesc: 'Create, rename, or remove tags',
    projects: 'Projects',
    projectsDesc: 'Manage your projects',
```

`ru.ts`:
```ts
    referenceData: 'Справочники',
    referenceDataDesc: 'Категории, продавцы, теги и проекты',
    tags: 'Теги',
    tagsDesc: 'Создание, переименование и удаление тегов',
    projects: 'Проекты',
    projectsDesc: 'Управление проектами',
```

`ua.ts`:
```ts
    referenceData: 'Довідники',
    referenceDataDesc: 'Категорії, продавці, теги та проєкти',
    tags: 'Теги',
    tagsDesc: 'Створення, перейменування та видалення тегів',
    projects: 'Проєкти',
    projectsDesc: 'Керування проєктами',
```

`be.ts`:
```ts
    referenceData: 'Даведнікі',
    referenceDataDesc: 'Катэгорыі, прадаўцы, тэгі і праекты',
    tags: 'Тэгі',
    tagsDesc: 'Стварэнне, перайменаванне і выдаленне тэгаў',
    projects: 'Праекты',
    projectsDesc: 'Кіраванне праектамі',
```

`de.ts`:
```ts
    referenceData: 'Stammdaten',
    referenceDataDesc: 'Kategorien, Händler, Tags und Projekte',
    tags: 'Tags',
    tagsDesc: 'Tags erstellen, umbenennen oder löschen',
    projects: 'Projekte',
    projectsDesc: 'Projekte verwalten',
```

`es.ts`:
```ts
    referenceData: 'Datos de referencia',
    referenceDataDesc: 'Categorías, comercios, etiquetas y proyectos',
    tags: 'Etiquetas',
    tagsDesc: 'Crear, renombrar o eliminar etiquetas',
    projects: 'Proyectos',
    projectsDesc: 'Gestiona tus proyectos',
```

`fr.ts`:
```ts
    referenceData: 'Données de référence',
    referenceDataDesc: 'Catégories, marchands, tags et projets',
    tags: 'Tags',
    tagsDesc: 'Créer, renommer ou supprimer des tags',
    projects: 'Projets',
    projectsDesc: 'Gérer vos projets',
```

`pl.ts`:
```ts
    referenceData: 'Słowniki',
    referenceDataDesc: 'Kategorie, sprzedawcy, tagi i projekty',
    tags: 'Tagi',
    tagsDesc: 'Twórz, zmieniaj nazwy lub usuwaj tagi',
    projects: 'Projekty',
    projectsDesc: 'Zarządzaj projektami',
```

> If a locale file is missing the `categories`/`merchants` keys in `settingsNav` (structure drift), add them too by copying the English text — but they should already exist.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/i18n/locales/__tests__/settingsNav-reference.test.ts`
Expected: PASS (48 assertions: 8 locales × 6 keys).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): add settingsNav i18n keys for reference-data hub"
```

---

## Task 2: Create the Reference data hub screen

**Files:**
- Create: `apps/mobile/app/settings/reference.tsx`

- [ ] **Step 1: Write the screen**

Create `apps/mobile/app/settings/reference.tsx`:

```tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface ReferenceRow {
  icon: IconName;
  label: string;
  description: string;
  route: string;
}

export default function ReferenceDataScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const rows: ReferenceRow[] = [
    {
      icon: 'pricetags-outline',
      label: t('settingsNav.categories'),
      description: t('settingsNav.categoriesDesc'),
      route: '/settings/categories',
    },
    {
      icon: 'storefront-outline',
      label: t('settingsNav.merchants'),
      description: t('settingsNav.merchantsDesc'),
      route: '/settings/merchants',
    },
    {
      icon: 'pricetag-outline',
      label: t('settingsNav.tags'),
      description: t('settingsNav.tagsDesc'),
      route: '/tags/manage',
    },
    {
      icon: 'folder-outline',
      label: t('settingsNav.projects'),
      description: t('settingsNav.projectsDesc'),
      route: '/projects',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: theme.spacing[10] + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {rows.map((row, index) => (
            <React.Fragment key={row.route}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(row.route as any)}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name={row.icon} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowDescription} numberOfLines={1}>
                    {row.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
              {index < rows.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4] },
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
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  rowContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
    marginRight: theme.spacing[2],
  },
  rowLabel: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  rowDescription: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2] },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS (no errors referencing `settings/reference.tsx`). The screen has no header yet — that is added in Task 3 via `_layout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/settings/reference.tsx
git commit -m "feat(mobile): add reference-data hub screen"
```

---

## Task 3: Wire the hub into Settings and register the route

**Files:**
- Modify: `apps/mobile/app/settings/index.tsx` (the `categories` array, currently the Categories + Merchants entries)
- Modify: `apps/mobile/app/_layout.tsx` (after the `settings/merchants` `Stack.Screen`)

- [ ] **Step 1: Replace the two rows in `settings/index.tsx`**

Find this block in the `categories` array:

```tsx
    {
      icon: 'pricetags-outline',
      label: t('settingsNav.categories'),
      description: t('settingsNav.categoriesDesc'),
      route: '/settings/categories',
    },
    {
      icon: 'storefront-outline',
      label: t('settingsNav.merchants'),
      description: t('settingsNav.merchantsDesc'),
      route: '/settings/merchants',
    },
```

Replace it with a single entry:

```tsx
    {
      icon: 'library-outline',
      label: t('settingsNav.referenceData'),
      description: t('settingsNav.referenceDataDesc'),
      route: '/settings/reference',
    },
```

- [ ] **Step 2: Register the route with a header in `_layout.tsx`**

Find the `settings/merchants` screen registration:

```tsx
        <Stack.Screen
          name="settings/merchants"
          options={{
            headerShown: true,
            title: t('settingsNav.merchants'),
          }}
        />
```

Immediately after it, add:

```tsx
        <Stack.Screen
          name="settings/reference"
          options={{
            headerShown: true,
            title: t('settingsNav.referenceData'),
          }}
        />
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings/index.tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): route Settings to reference-data hub, drop standalone rows"
```

---

## Task 4: Verify end-to-end and finish

- [ ] **Step 1: Run the full check set**

Run: `cd apps/mobile && npm run typecheck && npx jest src/i18n/locales/__tests__/settingsNav-reference.test.ts`
Expected: typecheck PASS; i18n test PASS.

- [ ] **Step 2: Manual verification (Expo web is enough for nav)**

Run: `npm run dev:web` (from repo root). Then:
- Settings shows a single **Reference data** row; the separate **Categories** and **Merchants** rows are gone.
- Tapping **Reference data** opens the hub with 4 rows, each with a header + back button.
- Each row opens the correct screen: Categories → categories editor; Merchants → merchants editor; Tags → tag manager; Projects → projects list.
- The hub screen itself has a header titled "Reference data" with a back button.
- Sanity: project picker → "New project" and tag picker still work (entry points unchanged).

- [ ] **Step 3: Finish the task per project convention**

REQUIRED SUB-SKILL: invoke `finish-aba-task` to create the ABA-{N} GitHub issue (English) and update `CLAUDE.md` (mention the new Reference data hub under Mobile → Screens/Settings) and `user_docs/` if applicable.

---

## Self-Review

- **Spec coverage:** hub screen (Task 2), settings row swap + route registration (Task 3), i18n in all 8 locales (Task 1), verification incl. unchanged picker entry points (Task 4). All spec sections covered.
- **Placeholder scan:** no TBD/TODO; all code shown in full; locale values concrete for all 8 languages.
- **Type/name consistency:** route `/settings/reference` matches the new file `app/settings/reference.tsx` and the `_layout.tsx` `name="settings/reference"`; i18n keys `settingsNav.referenceData(Desc)`/`tags(Desc)`/`projects(Desc)` are identical across the test, the screen, and the settings index; routes `/tags/manage`, `/projects`, `/settings/categories`, `/settings/merchants` confirmed against the existing registry.
