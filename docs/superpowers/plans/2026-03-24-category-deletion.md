# Category Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to delete categories (system and custom) from a new Settings screen, blocking deletion when related records exist.

**Architecture:** API soft-delete with related-records validation (409 Conflict). Mobile: new categories screen in settings, store action, API client method. i18n for all 8 locales.

**Tech Stack:** NestJS (API), Prisma, React Native/Expo, Zustand, SQLite/Drizzle, i18n

**GitHub Issue:** #68

**Design Spec:** `docs/superpowers/specs/2026-03-24-category-deletion-design.md`

---

### Task 1: API — Update `remove()` with related-records validation

**Files:**
- Modify: `apps/api/src/modules/categories/categories.service.ts:1-57`

- [ ] **Step 1: Add imports**

Add at top of file:

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
```

Replace the existing `import { Injectable } from '@nestjs/common';` line.

- [ ] **Step 2: Rewrite `remove()` method**

Replace lines 47-56 with:

```typescript
async remove(accountId: string, id: string) {
  // System categories have accountId: null on server, but are seeded locally with accountId.
  // On the API side, system categories are global. Soft-deleting a system category
  // hides it for ALL accounts (findAll filters isDeleted: false).
  // This is intentional per spec — system categories can be deleted.
  const category = await this.prisma.category.findFirst({
    where: {
      id,
      OR: [{ accountId }, { isSystem: true }],
    },
  });
  if (!category) throw new NotFoundException('Category not found');

  // Check for related records
  const [expenses, incomes, budgets, budgetCategories, splits, children] =
    await Promise.all([
      this.prisma.expense.count({
        where: { categoryId: id, isDeleted: false },
      }),
      this.prisma.income.count({
        where: { categoryId: id, isDeleted: false },
      }),
      this.prisma.budget.count({
        where: { categoryId: id, isDeleted: false },
      }),
      this.prisma.budgetCategory.count({
        where: { categoryId: id, isDeleted: false },
      }),
      this.prisma.expenseCategorySplit.count({
        where: { categoryId: id },
      }),
      this.prisma.category.count({
        where: { parentId: id, isDeleted: false },
      }),
    ]);

  const total = expenses + incomes + budgets + budgetCategories + splits + children;
  if (total > 0) {
    throw new ConflictException({
      statusCode: 409,
      message: 'Category has related records',
      details: { expenses, incomes, budgets, budgetCategories, splits, children },
    });
  }

  return this.prisma.category.update({
    where: { id },
    data: { isDeleted: true },
  });
}
```

- [ ] **Step 3: Also fix `update()` method for system categories and error type**

Replace lines 37-40 with the same OR pattern and `NotFoundException`:

```typescript
const category = await this.prisma.category.findFirst({
  where: {
    id,
    OR: [{ accountId }, { isSystem: true }],
  },
});
if (!category) throw new NotFoundException('Category not found');
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/categories/categories.service.ts
git commit -m "ABA-71 Add related-records validation to category deletion"
```

---

### Task 2: API — Add role guard to delete endpoint

**Files:**
- Modify: `apps/api/src/modules/categories/categories.controller.ts:1-31`
- Modify: `apps/api/src/modules/categories/categories.module.ts`

- [ ] **Step 1: Add imports and guard to controller**

Add imports:

```typescript
import { AccountRoleGuard, RequireRole } from '../accounts/guards/account-role.guard';
```

Add guard and decorator to delete endpoint:

```typescript
@Delete(':id')
@UseGuards(AccountRoleGuard)
@RequireRole('editor')
async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
  return this.categoriesService.remove(req.accountId, id);
}
```

- [ ] **Step 2: Add AccountsModule import to CategoriesModule**

In `categories.module.ts`, import `AccountsModule` so `AccountRoleGuard` can inject `AccountsService`:

```typescript
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [AccountsModule],
  // ...
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/categories/categories.controller.ts apps/api/src/modules/categories/categories.module.ts
git commit -m "ABA-71 Add editor role guard to category delete endpoint"
```

---

### Task 3: Mobile — Add `deleteCategory` to API client and fix error propagation

**Files:**
- Modify: `apps/mobile/src/services/api.ts`

- [ ] **Step 1: Fix error propagation in `request()` method (line 123-129)**

The current error handling throws a plain `Error` with just the message string, losing the response body (including 409 `details`). Replace lines 123-129:

```typescript
if (!response.ok) {
  const error = await response.json().catch(() => ({ message: 'Request failed' }));
  const message = Array.isArray(error.message)
    ? error.message.join('\n')
    : error.message || `HTTP ${response.status}`;
  console.log(`[API] Error response:`, message);
  const apiError: any = new Error(message);
  apiError.status = response.status;
  apiError.details = error.details;
  throw apiError;
}
```

This preserves the HTTP status code and the `details` object from the response body on the thrown Error.

- [ ] **Step 2: Add `deleteCategory` method after `createCategory()` (after line 281)**

```typescript
async deleteCategory(id: string) {
  return this.request<void>(`/categories/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/api.ts
git commit -m "ABA-71 Add deleteCategory method and preserve error details in API client"
```

---

### Task 4: Mobile — Add `deleteCategory` to category store and fix seeding

**Files:**
- Modify: `apps/mobile/src/stores/categoryStore.ts`
- Modify: `apps/mobile/src/db/categoryRepository.ts`

- [ ] **Step 1: Add `categoryExistsById` to repository**

In `apps/mobile/src/db/categoryRepository.ts`, add after `deleteCategory` (after line 122):

```typescript
export async function categoryExistsById(id: string): Promise<boolean> {
  const rows = await executeSql<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM categories WHERE id = ?',
    [id],
  );
  return rows.length > 0 && rows[0].cnt > 0;
}
```

This checks existence by ID regardless of `isDeleted` status, so deleted system categories won't be re-seeded.

- [ ] **Step 2: Update imports in store**

Replace line 4:

```typescript
import { getAllCategories, upsertCategory, deleteCategory as deleteCategoryFromDb, categoryExistsById } from '@/db/categoryRepository';
```

- [ ] **Step 3: Add `deleteCategory` to `CategoryState` interface**

Add after line 46 (`syncFromServer`):

```typescript
deleteCategory: (id: string) => Promise<void>;
```

- [ ] **Step 4: Add `deleteCategory` action implementation**

Add after `syncFromServer` action (after line 228). Unlike expense/income stores which use optimistic updates, we await the API first because deletion can fail with 409:

```typescript
deleteCategory: async (id: string) => {
  // Await API — may throw 409 with details (error.status and error.details preserved by api.ts)
  await api.deleteCategory(id);
  await deleteCategoryFromDb(id);
  set((state) => ({
    categories: state.categories.filter((c) => c.id !== id),
  }));
},
```

The screen's catch block reads `error.details` (preserved by the api.ts fix in Task 3).

- [ ] **Step 5: Fix seeding to not re-create deleted system categories**

Default categories use deterministic IDs (e.g. `default-exp-food---dining`). Replace the name-based existence check with ID-based check that includes deleted rows.

Replace expense seeding loop (lines 80-98):

```typescript
for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
  const id = `default-exp-${cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const exists = await categoryExistsById(id);
  if (!exists) {
    await upsertCategory({
      id,
      accountId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      type: 'expense',
      isSystem: true,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncVersion: 0,
    });
    seeded = true;
  }
}
```

Apply the same pattern for income seeding loop (lines 99-117): replace `!existingNames.has(...)` with `categoryExistsById(id)` check.

Remove the now-unused `existingNames` variable (line 76).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/stores/categoryStore.ts apps/mobile/src/db/categoryRepository.ts
git commit -m "ABA-71 Add deleteCategory store action and fix seeding for deleted categories"
```

---

### Task 5: Mobile — Add i18n keys to all 8 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`

- [ ] **Step 1: Add keys to `en.ts`**

In `settingsNav` object (before the closing `}` at line 1404), add:

```typescript
categories: 'Categories',
categoriesDesc: 'Manage and delete categories',
```

Before `} as const;` at line 1405, add new `categories` namespace:

```typescript
categories: {
  title: 'Categories',
  expenseCategories: 'Expense Categories',
  incomeCategories: 'Income Categories',
  delete: 'Delete',
  deleteConfirmTitle: 'Delete Category',
  deleteConfirmMessage: 'Are you sure you want to delete "{{name}}"?',
  deleteErrorHasRecords: 'Cannot delete this category. It is used by {{expenses}} expenses, {{incomes}} incomes, {{budgets}} budgets, and {{other}} other records.',
  deleteSuccess: 'Category deleted',
  empty: 'No categories',
  system: 'System',
},
```

- [ ] **Step 2: Add keys to `ru.ts`**

```typescript
// settingsNav:
categories: 'Категории',
categoriesDesc: 'Управление и удаление категорий',

// categories namespace:
categories: {
  title: 'Категории',
  expenseCategories: 'Категории расходов',
  incomeCategories: 'Категории доходов',
  delete: 'Удалить',
  deleteConfirmTitle: 'Удалить категорию',
  deleteConfirmMessage: 'Вы уверены, что хотите удалить "{{name}}"?',
  deleteErrorHasRecords: 'Невозможно удалить категорию. Она используется в {{expenses}} расходах, {{incomes}} доходах, {{budgets}} бюджетах и {{other}} других записях.',
  deleteSuccess: 'Категория удалена',
  empty: 'Нет категорий',
  system: 'Системная',
},
```

- [ ] **Step 3: Add keys to remaining 6 locales**

Apply the same pattern for `ua.ts`, `be.ts`, `de.ts`, `es.ts`, `fr.ts`, `pl.ts` with appropriate translations.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "ABA-71 Add category deletion i18n keys to all 8 locales"
```

---

### Task 6: Mobile — Create Categories settings screen

**Files:**
- Create: `apps/mobile/app/settings/categories.tsx`

- [ ] **Step 1: Create the screen**

Follow the pattern from `app/settings/appearance.tsx` for structure (SafeAreaView, ScrollView, useTheme, useStyles, createStyles).

Screen layout:
- Two sections with headers: `t('categories.expenseCategories')` and `t('categories.incomeCategories')`
- Each category row shows:
  - Color dot (circle with `category.color`)
  - Icon (`Ionicons` with `category.icon`)
  - Name
  - System badge if `category.isSystem` (small tag with `t('categories.system')`)
  - Delete button (trash icon, `theme.colors.danger`)
- Delete button → `Alert.alert` confirmation (pattern from `app/expense/[id].tsx:242-254`)
- On 409 error → parse `details` from error and show `Alert.alert` with `t('categories.deleteErrorHasRecords', details)`
- On success → show brief toast or just remove from list
- Empty state: `t('categories.empty')` centered text when section has no items

```typescript
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Category } from '@budget/shared-types';

type IconName = keyof typeof Ionicons.glyphMap;

export default function CategoriesSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { getExpenseCategories, getIncomeCategories, deleteCategory } = useCategoryStore();

  const expenseCategories = getExpenseCategories();
  const incomeCategories = getIncomeCategories();

  const handleDelete = (category: Category) => {
    Alert.alert(
      t('categories.deleteConfirmTitle'),
      t('categories.deleteConfirmMessage', { name: category.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('categories.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(category.id);
            } catch (error: any) {
              const d = error?.details || {};
              Alert.alert(
                t('common.error'),
                t('categories.deleteErrorHasRecords', {
                  expenses: d.expenses || 0,
                  incomes: d.incomes || 0,
                  budgets: d.budgets || 0,
                  other: (d.budgetCategories || 0) + (d.splits || 0) + (d.children || 0),
                }),
              );
            }
          },
        },
      ],
    );
  };

  const renderCategory = (category: Category) => (
    <View key={category.id} style={styles.row}>
      <View style={[styles.colorDot, { backgroundColor: category.color || theme.colors.textTertiary }]} />
      <Ionicons
        name={(category.icon as IconName) || 'ellipse'}
        size={20}
        color={theme.colors.textSecondary}
        style={styles.icon}
      />
      <View style={styles.nameContainer}>
        <Text style={styles.name}>{category.name}</Text>
        {category.isSystem && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('categories.system')}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={() => handleDelete(category)} hitSlop={8}>
        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
      </TouchableOpacity>
    </View>
  );

  const renderSection = (title: string, items: Category[]) => (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {items.length === 0 ? (
          <Text style={styles.empty}>{t('categories.empty')}</Text>
        ) : (
          items.map((cat, i) => (
            <React.Fragment key={cat.id}>
              {renderCategory(cat)}
              {i < items.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {renderSection(t('categories.expenseCategories'), expenseCategories)}
        {renderSection(t('categories.incomeCategories'), incomeCategories)}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
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
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  icon: { marginLeft: theme.spacing[2] },
  nameContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginLeft: theme.spacing[2],
    gap: theme.spacing[2],
  },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  badge: {
    backgroundColor: theme.colors.primary + '20',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  badgeText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontSize: 10 },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/settings/categories.tsx
git commit -m "ABA-71 Create categories settings screen with deletion UI"
```

---

### Task 7: Mobile — Add Categories row to Settings hub

**Files:**
- Modify: `apps/mobile/app/settings/index.tsx:62-63`

- [ ] **Step 1: Add Categories row**

Insert after the Security row (line 62) and before the Wallet row (line 63):

```typescript
{
  icon: 'pricetags-outline',
  label: t('settingsNav.categories'),
  description: t('settingsNav.categoriesDesc'),
  route: '/settings/categories',
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/settings/index.tsx
git commit -m "ABA-71 Add categories link to settings hub"
```

---

### Task 8: Update technical documentation

**Files:**
- Modify: `docs/en/API.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update API docs**

Add the DELETE /categories/:id endpoint documentation with the 409 Conflict response format.

- [ ] **Step 2: Update CLAUDE.md if needed**

Add `categories` screen to the Screens list under settings. Verify the module count and other references are current.

- [ ] **Step 3: Commit**

```bash
git add docs/en/API.md CLAUDE.md
git commit -m "ABA-71 Update technical documentation for category deletion"
```

---

### Task 9: Update user documentation

**Files:**
- Modify: `user_docs/en/11-settings.md`
- Modify: `user_docs/ru/11-settings.md`
- Modify: remaining 6 language docs for settings
- Run: `npm run generate:help`

- [ ] **Step 1: Add categories section to settings docs**

In each language's `11-settings.md`, add a section describing the new Categories screen: how to access it, how deletion works, what the blocking behavior means.

- [ ] **Step 2: Regenerate help content**

```bash
npm run generate:help
```

- [ ] **Step 3: Commit**

```bash
git add user_docs/ apps/mobile/src/help/content.ts
git commit -m "ABA-71 Update user documentation for category deletion"
```
