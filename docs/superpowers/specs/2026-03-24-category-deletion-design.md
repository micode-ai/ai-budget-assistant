# Category Deletion Feature

## Summary

Add the ability to delete categories (both system and custom) with a new Settings screen. Deletion is blocked if the category has related records (expenses, incomes, budgets, expense splits).

## Decisions

| Decision | Choice |
|----------|--------|
| Related records | Block deletion (409 Conflict) if category has expenses, incomes, budgets, or expense splits |
| System categories | Can be deleted same as custom |
| Child categories | Block deletion if category has children |
| UI location | New "Categories" screen in Settings |
| Confirmation | Alert dialog before deletion |
| Role access | Requires `owner` or `editor` role |

## API Changes (apps/api)

### `categories.service.ts` — `remove(accountId, id)`

**Query fix:** System categories have `accountId: null`. The lookup must handle both:
```typescript
where: {
  id,
  OR: [{ accountId }, { isSystem: true }],
}
```

If not found → throw `NotFoundException('Category not found')` (replace existing raw `Error`).

**Related records check** before soft delete:
```
1. Count expenses where categoryId = id AND isDeleted = false
2. Count incomes where categoryId = id AND isDeleted = false
3. Count budgets where categoryId = id AND isDeleted = false
4. Count budgetCategories where categoryId = id AND isDeleted = false
5. Count expenseCategorySplits where categoryId = id
6. Count child categories where parentId = id AND isDeleted = false
```

If any count > 0 → throw `ConflictException` with message and counts.
Otherwise → soft delete (`isDeleted: true`).

**ConflictException constructor:**
```typescript
throw new ConflictException({
  statusCode: 409,
  message: 'Category has related records',
  details: { expenses: 5, incomes: 0, budgets: 1, splits: 0, children: 0 },
});
```

### `categories.controller.ts` — `remove()`

Add `@RequireRole('editor')` decorator (allows both `owner` and `editor`).

## Mobile Changes

### API Client (`src/services/api.ts`)
- Add `deleteCategory(id: string): Promise<void>` → `DELETE /categories/${id}`
- Parse 409 response to extract `details` object from error body

### Category Store (`src/stores/categoryStore.ts`)
- Add `deleteCategory(id: string)` action:
  1. Call `apiClient.deleteCategory(id)`
  2. On success: call `categoryRepository.deleteCategory(id)` (soft delete in SQLite)
  3. Remove category from store state
  4. On 409: throw structured error with details for UI to display

### Seeding fix (`categoryStore.ts` — `loadCategories`)
- When seeding default system categories, check for soft-deleted categories too (not just existing non-deleted ones) to prevent re-creation of deleted system categories

### New Screen (`app/settings/categories.tsx`)
- List of categories split into two sections: Expense / Income
- Each item shows: icon, color dot, name, system badge (if applicable)
- Trash icon button on each row (matches app's existing deletion pattern — no swipe gestures used elsewhere)
- Tap trash icon → Alert confirmation: "Are you sure you want to delete category X?"
- On confirm → call `deleteCategory(id)`
- On 409 → Alert: "Cannot delete: category has N expenses, N incomes, N budgets"
- Empty state message when a section has no categories

### Settings Hub (`app/settings/index.tsx`)
- Add "Categories" row linking to `settings/categories`

### i18n (all 8 locales)
New keys (using existing namespace conventions):
- `settingsNav.categories` — row title in settings hub
- `settingsNav.categoriesDesc` — row subtitle in settings hub
- `categories.title` — screen title
- `categories.deleteConfirmTitle` — alert title
- `categories.deleteConfirmMessage` — alert body
- `categories.deleteErrorHasRecords` — error message with counts
- `categories.deleteSuccess` — success toast
- `categories.expenseCategories` — section header
- `categories.incomeCategories` — section header
- `categories.delete` — delete button label
- `categories.empty` — empty state message

## Out of Scope
- Category editing (name, icon, color)
- Category reordering
- Reassigning records to another category before deletion
- Hard delete
