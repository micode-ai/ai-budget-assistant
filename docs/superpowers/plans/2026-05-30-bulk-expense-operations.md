# Bulk Expense Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select mode to the Expenses tab so users can batch-recategorize, add tags, or delete multiple expenses in one action.

**Architecture:** Backend adds a `PATCH /expenses/bulk` endpoint that accepts `{ ids, categoryId?, tagIds?, isDeleted? }` scoped to the account. Mobile adds a `bulkUpdateExpenses` store action and a multi-select UI mode to `expenses.tsx` that activates on long-press, shows checkboxes, and surfaces a bottom action bar with Set Category / Add Tag / Delete.

**Tech Stack:** NestJS + Prisma (API), Zustand + SQLite/Drizzle (mobile state), Expo Router + React Native (UI), react-i18next (8 locales)

---

## File Structure

### Modified files
| File | Change |
|---|---|
| `apps/api/src/modules/expenses/dto/index.ts` | Add `BulkUpdateExpensesDto` |
| `apps/api/src/modules/expenses/expenses.service.ts` | Add `bulkUpdate()` method |
| `apps/api/src/modules/expenses/expenses.controller.ts` | Add `PATCH /expenses/bulk` |
| `apps/mobile/src/services/expenses.api.ts` | Add `bulkUpdateExpenses()` |
| `apps/mobile/src/stores/expenseStore.ts` | Add `bulkUpdateExpenses()` action |
| `apps/mobile/app/(tabs)/expenses.tsx` | Multi-select UI mode |
| `apps/mobile/src/i18n/locales/en.ts` | New bulk-operation keys |
| `apps/mobile/src/i18n/locales/de.ts` | Translate bulk keys |
| `apps/mobile/src/i18n/locales/es.ts` | Translate bulk keys |
| `apps/mobile/src/i18n/locales/fr.ts` | Translate bulk keys |
| `apps/mobile/src/i18n/locales/pl.ts` | Translate bulk keys |
| `apps/mobile/src/i18n/locales/ru.ts` | Translate bulk keys |
| `apps/mobile/src/i18n/locales/ua.ts` | Translate bulk keys |
| `apps/mobile/src/i18n/locales/be.ts` | Translate bulk keys |

---

## Task 1: API — BulkUpdateExpensesDto

**Files:**
- Modify: `apps/api/src/modules/expenses/dto/index.ts`

- [ ] **Step 1: Add the DTO class** at the bottom of `apps/api/src/modules/expenses/dto/index.ts`:

```typescript
export class BulkUpdateExpensesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  ids: string[];

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
```

Add missing imports at the top of the file:
```typescript
import {
  ...existing...
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/expenses/dto/index.ts
git commit -m "feat(api): add BulkUpdateExpensesDto"
```

---

## Task 2: API — bulkUpdate service method

**Files:**
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`

- [ ] **Step 1: Add the import** at the top of the service (add `BulkUpdateExpensesDto` to the existing DTO import):

```typescript
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto, BulkUpdateExpensesDto } from './dto';
```

- [ ] **Step 2: Add the `bulkUpdate` method** to the `ExpensesService` class (after the `remove` method, around line 200):

```typescript
async bulkUpdate(accountId: string, dto: BulkUpdateExpensesDto): Promise<{ updated: number }> {
  const { ids, categoryId, tagIds, isDeleted } = dto;

  // Validate that all IDs belong to this account
  const owned = await this.prisma.expense.findMany({
    where: { id: { in: ids }, accountId, isDeleted: false },
    select: { id: true },
  });
  const ownedIds = owned.map((e) => e.id);
  if (ownedIds.length === 0) return { updated: 0 };

  const now = new Date();
  const updateData: any = { updatedAt: now };

  if (isDeleted === true) {
    updateData.isDeleted = true;
  } else {
    if (categoryId !== undefined) {
      if (categoryId === null) {
        updateData.categoryId = null;
      } else {
        const resolved = await this.resolveCategoryId(categoryId, accountId);
        updateData.categoryId = resolved;
      }
    }

    if (tagIds !== undefined && tagIds.length > 0) {
      // Tags are handled separately below (append mode)
    }
  }

  await this.prisma.$transaction(async (tx) => {
    await tx.expense.updateMany({
      where: { id: { in: ownedIds }, accountId },
      data: updateData,
    });

    if (!isDeleted && tagIds !== undefined && tagIds.length > 0) {
      // Validate tag ownership
      const validTags = await tx.tag.findMany({
        where: { id: { in: tagIds }, accountId },
        select: { id: true },
      });
      const validTagIds = validTags.map((t) => t.id);

      for (const expenseId of ownedIds) {
        for (const tagId of validTagIds) {
          await tx.expenseTag.upsert({
            where: { expenseId_tagId: { expenseId, tagId } },
            create: { expenseId, tagId },
            update: {},
          });
        }
      }
    }
  });

  await this.invalidateChatCache(accountId);
  return { updated: ownedIds.length };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/expenses/expenses.service.ts
git commit -m "feat(api): add bulkUpdate method to ExpensesService"
```

---

## Task 3: API — PATCH /expenses/bulk endpoint

**Files:**
- Modify: `apps/api/src/modules/expenses/expenses.controller.ts`

- [ ] **Step 1: Add `BulkUpdateExpensesDto` to the import line** in the controller:

```typescript
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto, SaveReceiptImageDto, BulkUpdateExpensesDto } from './dto';
```

- [ ] **Step 2: Add the endpoint** to `ExpensesController`, before the `@Get(':id')` method (important: must come before the `:id` wildcard):

```typescript
@Patch('bulk')
@UseGuards(new ViewerBlockGuard())
async bulkUpdate(@Req() req: AuthenticatedRequest, @Body() dto: BulkUpdateExpensesDto) {
  return this.expensesService.bulkUpdate(req.accountId, dto);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/expenses/expenses.controller.ts
git commit -m "feat(api): add PATCH /expenses/bulk endpoint"
```

---

## Task 4: Mobile — API client method

**Files:**
- Modify: `apps/mobile/src/services/expenses.api.ts`

- [ ] **Step 1: Add `bulkUpdateExpenses` to the `expensesApi` object** after `deleteExpense`:

```typescript
bulkUpdateExpenses(data: { ids: string[]; categoryId?: string | null; tagIds?: string[]; isDeleted?: boolean }) {
  return httpClient.request<{ updated: number }>('/expenses/bulk', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/services/expenses.api.ts
git commit -m "feat(mobile): add bulkUpdateExpenses API client method"
```

---

## Task 5: Mobile — Store action

**Files:**
- Modify: `apps/mobile/src/stores/expenseStore.ts`

- [ ] **Step 1: Add `bulkUpdateExpenses` to the `ExpenseState` interface** (after the `deleteExpense` action, around line 76):

```typescript
bulkUpdateExpenses: (ids: string[], patch: { categoryId?: string | null; tagIds?: string[]; isDeleted?: boolean }) => Promise<void>;
```

- [ ] **Step 2: Implement the `bulkUpdateExpenses` action** in the store (after the `deleteExpense` implementation):

```typescript
bulkUpdateExpenses: async (ids, patch) => {
  const { expenses } = get();
  const now = new Date();

  // Optimistic update in-memory
  set({
    expenses: expenses.map((e) => {
      if (!ids.includes(e.id)) return e;
      if (patch.isDeleted) return { ...e, isDeleted: true, updatedAt: now };
      return {
        ...e,
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId ?? undefined } : {}),
        ...(patch.tagIds !== undefined ? { tagIds: [...(e.tagIds ?? []), ...patch.tagIds.filter((t) => !(e.tagIds ?? []).includes(t))] } : {}),
        updatedAt: now,
      };
    }).filter((e) => !e.isDeleted),
  });

  // Mark rows as pending in SQLite and fire server
  const accountId = useAccountStore.getState().currentAccountId;
  if (!accountId) return;

  // Update SQLite rows individually (bulk SQL is not in the repository layer yet)
  for (const id of ids) {
    if (patch.isDeleted) {
      await softDeleteExpenseInDb(id, now);
    } else {
      const updates: any = { updatedAt: now, syncStatus: 'pending' };
      if (patch.categoryId !== undefined) updates.categoryId = patch.categoryId;
      await updateExpenseInDb(id, updates, now, 'pending');
    }
  }

  // Server call (fire-and-forget, failures handled by syncPendingExpenses)
  api.bulkUpdateExpenses({ ids, ...patch }).catch((e) =>
    console.warn('[expenseStore] bulkUpdate server error:', e?.message || e)
  );
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/stores/expenseStore.ts
git commit -m "feat(mobile): add bulkUpdateExpenses store action"
```

---

## Task 6: Mobile — i18n strings

**Files:**
- Modify: all 8 locale files in `apps/mobile/src/i18n/locales/`

- [ ] **Step 1: Add keys to `en.ts`** inside the `expenses` object:

```typescript
// Add to expenses: { ... }
bulkSelect: 'Select',
bulkCancel: 'Cancel',
bulkSelectAll: 'Select All',
bulkSelected: '{{count}} selected',
bulkSetCategory: 'Set Category',
bulkAddTag: 'Add Tag',
bulkDelete: 'Delete',
bulkDeleteConfirm: 'Delete {{count}} expenses?',
bulkDeleteConfirmMessage: 'This action cannot be undone.',
bulkCategoryApplied: 'Category applied to {{count}} expenses',
bulkTagsApplied: 'Tags added to {{count}} expenses',
bulkDeleted: '{{count}} expenses deleted',
```

- [ ] **Step 2: Add translations to `de.ts`**:

```typescript
// Inside expenses: { ... }
bulkSelect: 'Auswählen',
bulkCancel: 'Abbrechen',
bulkSelectAll: 'Alle auswählen',
bulkSelected: '{{count}} ausgewählt',
bulkSetCategory: 'Kategorie setzen',
bulkAddTag: 'Tag hinzufügen',
bulkDelete: 'Löschen',
bulkDeleteConfirm: '{{count}} Ausgaben löschen?',
bulkDeleteConfirmMessage: 'Diese Aktion kann nicht rückgängig gemacht werden.',
bulkCategoryApplied: 'Kategorie auf {{count}} Ausgaben angewendet',
bulkTagsApplied: 'Tags zu {{count}} Ausgaben hinzugefügt',
bulkDeleted: '{{count}} Ausgaben gelöscht',
```

- [ ] **Step 3: Add translations to `es.ts`**:

```typescript
bulkSelect: 'Seleccionar',
bulkCancel: 'Cancelar',
bulkSelectAll: 'Seleccionar todo',
bulkSelected: '{{count}} seleccionados',
bulkSetCategory: 'Asignar categoría',
bulkAddTag: 'Añadir etiqueta',
bulkDelete: 'Eliminar',
bulkDeleteConfirm: '¿Eliminar {{count}} gastos?',
bulkDeleteConfirmMessage: 'Esta acción no se puede deshacer.',
bulkCategoryApplied: 'Categoría aplicada a {{count}} gastos',
bulkTagsApplied: 'Etiquetas añadidas a {{count}} gastos',
bulkDeleted: '{{count}} gastos eliminados',
```

- [ ] **Step 4: Add translations to `fr.ts`**:

```typescript
bulkSelect: 'Sélectionner',
bulkCancel: 'Annuler',
bulkSelectAll: 'Tout sélectionner',
bulkSelected: '{{count}} sélectionné(s)',
bulkSetCategory: 'Définir la catégorie',
bulkAddTag: 'Ajouter un tag',
bulkDelete: 'Supprimer',
bulkDeleteConfirm: 'Supprimer {{count}} dépenses ?',
bulkDeleteConfirmMessage: 'Cette action est irréversible.',
bulkCategoryApplied: 'Catégorie appliquée à {{count}} dépenses',
bulkTagsApplied: 'Tags ajoutés à {{count}} dépenses',
bulkDeleted: '{{count}} dépenses supprimées',
```

- [ ] **Step 5: Add translations to `pl.ts`**:

```typescript
bulkSelect: 'Zaznacz',
bulkCancel: 'Anuluj',
bulkSelectAll: 'Zaznacz wszystko',
bulkSelected: '{{count}} zaznaczonych',
bulkSetCategory: 'Ustaw kategorię',
bulkAddTag: 'Dodaj tag',
bulkDelete: 'Usuń',
bulkDeleteConfirm: 'Usunąć {{count}} wydatki?',
bulkDeleteConfirmMessage: 'Tej akcji nie można cofnąć.',
bulkCategoryApplied: 'Kategoria zastosowana do {{count}} wydatków',
bulkTagsApplied: 'Tagi dodane do {{count}} wydatków',
bulkDeleted: '{{count}} wydatków usuniętych',
```

- [ ] **Step 6: Add translations to `ru.ts`**:

```typescript
bulkSelect: 'Выбрать',
bulkCancel: 'Отмена',
bulkSelectAll: 'Выбрать все',
bulkSelected: 'Выбрано: {{count}}',
bulkSetCategory: 'Задать категорию',
bulkAddTag: 'Добавить тег',
bulkDelete: 'Удалить',
bulkDeleteConfirm: 'Удалить {{count}} расходов?',
bulkDeleteConfirmMessage: 'Это действие нельзя отменить.',
bulkCategoryApplied: 'Категория применена к {{count}} расходам',
bulkTagsApplied: 'Теги добавлены к {{count}} расходам',
bulkDeleted: '{{count}} расходов удалено',
```

- [ ] **Step 7: Add translations to `ua.ts`**:

```typescript
bulkSelect: 'Вибрати',
bulkCancel: 'Скасувати',
bulkSelectAll: 'Вибрати все',
bulkSelected: 'Вибрано: {{count}}',
bulkSetCategory: 'Задати категорію',
bulkAddTag: 'Додати тег',
bulkDelete: 'Видалити',
bulkDeleteConfirm: 'Видалити {{count}} витрат?',
bulkDeleteConfirmMessage: 'Цю дію неможливо скасувати.',
bulkCategoryApplied: 'Категорія застосована до {{count}} витрат',
bulkTagsApplied: 'Теги додані до {{count}} витрат',
bulkDeleted: '{{count}} витрат видалено',
```

- [ ] **Step 8: Add translations to `be.ts`**:

```typescript
bulkSelect: 'Выбраць',
bulkCancel: 'Адмяніць',
bulkSelectAll: 'Выбраць усё',
bulkSelected: 'Выбрана: {{count}}',
bulkSetCategory: 'Задаць катэгорыю',
bulkAddTag: 'Дадаць тэг',
bulkDelete: 'Выдаліць',
bulkDeleteConfirm: 'Выдаліць {{count}} выдаткаў?',
bulkDeleteConfirmMessage: 'Гэта дзеянне нельга адмяніць.',
bulkCategoryApplied: 'Катэгорыя прыменена да {{count}} выдаткаў',
bulkTagsApplied: 'Тэгі дададзены да {{count}} выдаткаў',
bulkDeleted: '{{count}} выдаткаў выдалена',
```

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add bulk expense operation i18n strings (8 locales)"
```

---

## Task 7: Mobile — Multi-select UI in expenses.tsx

**Files:**
- Modify: `apps/mobile/app/(tabs)/expenses.tsx`

This is the largest change. It adds multi-select state and modifies the render functions.

- [ ] **Step 1: Add new state variables** after the existing `useState` declarations (~line 30):

```typescript
// Multi-select state (expenses tab only)
const [isMultiSelect, setIsMultiSelect] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [showBulkCategoryPicker, setShowBulkCategoryPicker] = useState(false);
const [showBulkTagPicker, setShowBulkTagPicker] = useState(false);
const [isBulkProcessing, setIsBulkProcessing] = useState(false);
```

- [ ] **Step 2: Add new store imports** to the destructure of `useExpenseStore` (~line 36):

```typescript
const { loadExpenses, getFilteredExpenses, getDistinctMerchants, deleteExpense, filters: expenseFilters, setFilters: setExpenseFilters, bulkUpdateExpenses } = useExpenseStore();
```

Also add tag store import at top:
```typescript
import { useTagStore } from '@/stores/tagStore';
```

And inside the component body:
```typescript
const allTags = useTagStore((s) => s.tags);
```

- [ ] **Step 3: Add multi-select helpers** after the `switchTab` function:

```typescript
const enterMultiSelect = (firstId: string) => {
  setIsMultiSelect(true);
  setSelectedIds(new Set([firstId]));
  // Close FAB and other pickers
  setFabOpen(false);
  fabAnimation.setValue(0);
  setShowCategoryPicker(false);
};

const exitMultiSelect = () => {
  setIsMultiSelect(false);
  setSelectedIds(new Set());
  setShowBulkCategoryPicker(false);
  setShowBulkTagPicker(false);
};

const toggleSelection = (id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) {
      setIsMultiSelect(false);
    }
    return next;
  });
};

const selectAll = () => {
  setSelectedIds(new Set(expenses.map((e) => e.id)));
};

const handleBulkSetCategory = async (categoryId: string) => {
  if (selectedIds.size === 0) return;
  setShowBulkCategoryPicker(false);
  setIsBulkProcessing(true);
  try {
    await bulkUpdateExpenses(Array.from(selectedIds), { categoryId });
    Alert.alert('', t('expenses.bulkCategoryApplied', { count: selectedIds.size }));
    exitMultiSelect();
  } finally {
    setIsBulkProcessing(false);
  }
};

const handleBulkAddTags = async (tagIds: string[]) => {
  if (selectedIds.size === 0 || tagIds.length === 0) return;
  setShowBulkTagPicker(false);
  setIsBulkProcessing(true);
  try {
    await bulkUpdateExpenses(Array.from(selectedIds), { tagIds });
    Alert.alert('', t('expenses.bulkTagsApplied', { count: selectedIds.size }));
    exitMultiSelect();
  } finally {
    setIsBulkProcessing(false);
  }
};

const handleBulkDelete = () => {
  if (selectedIds.size === 0) return;
  Alert.alert(
    t('expenses.bulkDeleteConfirm', { count: selectedIds.size }),
    t('expenses.bulkDeleteConfirmMessage'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('expenses.bulkDelete'),
        style: 'destructive',
        onPress: async () => {
          setIsBulkProcessing(true);
          try {
            await bulkUpdateExpenses(Array.from(selectedIds), { isDeleted: true });
            Alert.alert('', t('expenses.bulkDeleted', { count: selectedIds.size }));
            exitMultiSelect();
          } finally {
            setIsBulkProcessing(false);
          }
        },
      },
    ]
  );
};
```

- [ ] **Step 4: Modify `handleLongPress`** to enter multi-select mode instead of opening the action sheet when on expenses tab:

```typescript
const handleLongPress = (item: Expense | Income, type: 'expense' | 'income') => {
  if (type === 'expense' && canEdit) {
    enterMultiSelect(item.id);
    return;
  }
  setSelectedTransaction({
    id: item.id,
    type,
    amount: item.amount,
    description: item.description || undefined,
    categoryId: item.categoryId || undefined,
    currencyCode: item.currencyCode,
  });
  setActionSheetVisible(true);
};
```

- [ ] **Step 5: Modify `renderExpenseItem`** to show checkboxes in multi-select mode:

```typescript
const renderExpenseItem = ({ item }: { item: Expense }) => {
  const isSelected = selectedIds.has(item.id);
  return (
    <TouchableOpacity
      style={[styles.expenseCard, isMultiSelect && isSelected && styles.expenseCardSelected]}
      onPress={() => {
        if (isMultiSelect) {
          toggleSelection(item.id);
        } else {
          router.push(`/expense/${item.id}`);
        }
      }}
      onLongPress={() => handleLongPress(item, 'expense')}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      {isMultiSelect && (
        <View style={styles.checkboxContainer}>
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color={theme.colors.textInverse} />}
          </View>
        </View>
      )}
      <View style={styles.expenseIcon}>
        {item.source === 'ocr' ? (
          <Image
            source={require('../../assets/icons/scan-receipt.png')}
            style={{ width: 24, height: 24 }}
            resizeMode="contain"
          />
        ) : (
          <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
        )}
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Expense'}
        </Text>
        {item.merchant ? (
          <Text style={styles.expenseMerchant} numberOfLines={1}>{item.merchant}</Text>
        ) : null}
        <Text style={styles.expenseDate}>{formatDate(item.date, undefined, getIntlLocale())}</Text>
      </View>
      <Text style={styles.expenseAmount}>
        -{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );
};
```

- [ ] **Step 6: Add multi-select header bar** inside the `return` JSX, right after `<SafeAreaView style={styles.container} edges={[]}>` and before the segmented control row:

```tsx
{/* Multi-select header (replaces normal header in multi-select mode) */}
{isMultiSelect && (
  <View style={styles.multiSelectHeader}>
    <TouchableOpacity onPress={exitMultiSelect} style={styles.multiSelectCancel}>
      <Text style={styles.multiSelectCancelText}>{t('expenses.bulkCancel')}</Text>
    </TouchableOpacity>
    <Text style={styles.multiSelectCount}>
      {t('expenses.bulkSelected', { count: selectedIds.size })}
    </Text>
    <TouchableOpacity onPress={selectAll} style={styles.multiSelectSelectAll}>
      <Text style={styles.multiSelectSelectAllText}>{t('expenses.bulkSelectAll')}</Text>
    </TouchableOpacity>
  </View>
)}
```

- [ ] **Step 7: Add multi-select bottom action bar** and bulk pickers inside the `return` JSX, before `</SafeAreaView>`:

```tsx
{/* Bulk action bar */}
{isMultiSelect && (
  <View style={styles.bulkActionBar}>
    {isBulkProcessing ? (
      <ActivityIndicator color={theme.colors.primary} />
    ) : (
      <>
        <TouchableOpacity
          style={styles.bulkActionButton}
          onPress={() => { setShowBulkTagPicker(false); setShowBulkCategoryPicker(true); }}
          disabled={selectedIds.size === 0}
        >
          <Ionicons name="pricetag-outline" size={20} color={selectedIds.size > 0 ? theme.colors.primary : theme.colors.textDisabled} />
          <Text style={[styles.bulkActionText, selectedIds.size === 0 && styles.bulkActionTextDisabled]}>
            {t('expenses.bulkSetCategory')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bulkActionButton}
          onPress={() => { setShowBulkCategoryPicker(false); setShowBulkTagPicker(true); }}
          disabled={selectedIds.size === 0}
        >
          <Ionicons name="bookmark-outline" size={20} color={selectedIds.size > 0 ? theme.colors.accent : theme.colors.textDisabled} />
          <Text style={[styles.bulkActionText, selectedIds.size === 0 && styles.bulkActionTextDisabled]}>
            {t('expenses.bulkAddTag')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bulkActionButton}
          onPress={handleBulkDelete}
          disabled={selectedIds.size === 0}
        >
          <Ionicons name="trash-outline" size={20} color={selectedIds.size > 0 ? theme.colors.error : theme.colors.textDisabled} />
          <Text style={[styles.bulkActionText, { color: selectedIds.size > 0 ? theme.colors.error : theme.colors.textDisabled }]}>
            {t('expenses.bulkDelete')}
          </Text>
        </TouchableOpacity>
      </>
    )}
  </View>
)}

{/* Bulk Category Picker Modal */}
<Modal visible={showBulkCategoryPicker} transparent animationType="slide" onRequestClose={() => setShowBulkCategoryPicker(false)}>
  <TouchableOpacity style={styles.merchantModalOverlay} activeOpacity={1} onPress={() => setShowBulkCategoryPicker(false)}>
    <View style={styles.merchantModalSheet}>
      <View style={styles.merchantModalHeader}>
        <Text style={styles.merchantModalTitle}>{t('expenses.bulkSetCategory')}</Text>
        <TouchableOpacity onPress={() => setShowBulkCategoryPicker(false)}>
          <Text style={styles.merchantDone}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        {categories.filter((c) => !c.isDeleted).map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={styles.merchantRow}
            onPress={() => handleBulkSetCategory(cat.id)}
          >
            <Ionicons name={(cat.icon as any) || 'pricetag-outline'} size={18} color={theme.colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.merchantRowText}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  </TouchableOpacity>
</Modal>

{/* Bulk Tag Picker Modal */}
<Modal visible={showBulkTagPicker} transparent animationType="slide" onRequestClose={() => setShowBulkTagPicker(false)}>
  <TouchableOpacity style={styles.merchantModalOverlay} activeOpacity={1} onPress={() => setShowBulkTagPicker(false)}>
    <View style={styles.merchantModalSheet}>
      <View style={styles.merchantModalHeader}>
        <Text style={styles.merchantModalTitle}>{t('expenses.bulkAddTag')}</Text>
        <TouchableOpacity onPress={() => setShowBulkTagPicker(false)}>
          <Text style={styles.merchantDone}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        {(() => {
          const [pickedTagIds, setPickedTagIds] = React.useState<string[]>([]);
          return (
            <>
              {allTags.filter((tag) => !tag.isDeleted).map((tag) => {
                const picked = pickedTagIds.includes(tag.id);
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={styles.merchantRow}
                    onPress={() => setPickedTagIds((prev) => picked ? prev.filter((id) => id !== tag.id) : [...prev, tag.id])}
                  >
                    <Ionicons name="bookmark-outline" size={18} color={picked ? theme.colors.accent : theme.colors.textSecondary} style={{ marginRight: 8 }} />
                    <Text style={[styles.merchantRowText, picked && { color: theme.colors.accent }]}>{tag.name}</Text>
                    {picked && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              })}
              {allTags.filter((t) => !t.isDeleted).length === 0 && (
                <Text style={styles.merchantEmpty}>{t('tags.noTags') || 'No tags yet'}</Text>
              )}
              <TouchableOpacity
                style={[styles.addButton, { margin: 16, opacity: pickedTagIds.length === 0 ? 0.4 : 1 }]}
                disabled={pickedTagIds.length === 0}
                onPress={() => handleBulkAddTags(pickedTagIds)}
              >
                <Text style={styles.addButtonText}>{t('common.done')}</Text>
              </TouchableOpacity>
            </>
          );
        })()}
      </ScrollView>
    </View>
  </TouchableOpacity>
</Modal>
```

**Note:** The inline `useState` inside the ScrollView render will cause React Hook rules errors. Instead, extract the tag picker into a tiny local component `BulkTagPickerSheet` that manages its own `pickedTagIds` state and calls `onConfirm(tagIds)`.

Revised approach — add a local component `BulkTagPickerSheet` just above the `ExpensesScreen` function:

```tsx
function BulkTagPickerSheet({ tags, onConfirm, onClose }: { tags: any[]; onConfirm: (tagIds: string[]) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [pickedTagIds, setPickedTagIds] = useState<string[]>([]);
  return (
    <>
      <View style={styles.merchantModalHeader}>
        <Text style={styles.merchantModalTitle}>{t('expenses.bulkAddTag')}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.merchantDone}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        {tags.filter((tag) => !tag.isDeleted).map((tag) => {
          const picked = pickedTagIds.includes(tag.id);
          return (
            <TouchableOpacity
              key={tag.id}
              style={styles.merchantRow}
              onPress={() => setPickedTagIds((prev) => picked ? prev.filter((id) => id !== tag.id) : [...prev, tag.id])}
            >
              <Ionicons name="bookmark-outline" size={18} color={picked ? theme.colors.accent : theme.colors.textSecondary} style={{ marginRight: 8 }} />
              <Text style={[styles.merchantRowText, picked && { color: theme.colors.accent }]}>{tag.name}</Text>
              {picked && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
            </TouchableOpacity>
          );
        })}
        {tags.filter((t) => !t.isDeleted).length === 0 && (
          <Text style={styles.merchantEmpty}>No tags yet</Text>
        )}
      </ScrollView>
      <TouchableOpacity
        style={[styles.addButton, { margin: 16, opacity: pickedTagIds.length === 0 ? 0.4 : 1 }]}
        disabled={pickedTagIds.length === 0}
        onPress={() => onConfirm(pickedTagIds)}
      >
        <Text style={styles.addButtonText}>{t('common.done')}</Text>
      </TouchableOpacity>
    </>
  );
}
```

And replace the inline ScrollView content in the Bulk Tag Modal with:
```tsx
<BulkTagPickerSheet tags={allTags} onConfirm={handleBulkAddTags} onClose={() => setShowBulkTagPicker(false)} />
```

- [ ] **Step 8: Add new styles** to `createStyles` (append at the bottom before closing `}`):

```typescript
multiSelectHeader: {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: theme.spacing[4],
  paddingVertical: theme.spacing[3],
  backgroundColor: theme.colors.surface,
  borderBottomWidth: 1,
  borderBottomColor: theme.colors.borderLight,
},
multiSelectCancel: {
  minWidth: 60,
},
multiSelectCancelText: {
  ...theme.textStyles.bodyMd,
  color: theme.colors.primary,
},
multiSelectCount: {
  ...theme.textStyles.bodyMdMedium,
  color: theme.colors.textPrimary,
  fontWeight: '600' as const,
},
multiSelectSelectAll: {
  minWidth: 60,
  alignItems: 'flex-end' as const,
},
multiSelectSelectAllText: {
  ...theme.textStyles.bodyMd,
  color: theme.colors.primary,
},
checkboxContainer: {
  width: 36,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexShrink: 0,
},
checkbox: {
  width: 22,
  height: 22,
  borderRadius: 11,
  borderWidth: 2,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.surface,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
},
checkboxSelected: {
  backgroundColor: theme.colors.primary,
  borderColor: theme.colors.primary,
},
expenseCardSelected: {
  backgroundColor: theme.colors.primaryLight,
},
bulkActionBar: {
  flexDirection: 'row' as const,
  justifyContent: 'space-around' as const,
  alignItems: 'center' as const,
  paddingVertical: theme.spacing[3],
  paddingHorizontal: theme.spacing[2],
  backgroundColor: theme.colors.surface,
  borderTopWidth: 1,
  borderTopColor: theme.colors.borderLight,
  ...theme.shadows.md,
},
bulkActionButton: {
  flex: 1,
  alignItems: 'center' as const,
  gap: theme.spacing[1],
},
bulkActionText: {
  ...theme.textStyles.bodySm,
  color: theme.colors.textSecondary,
  textAlign: 'center' as const,
},
bulkActionTextDisabled: {
  color: theme.colors.textDisabled,
},
```

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/app/(tabs)/expenses.tsx
git commit -m "feat(mobile): add multi-select mode to expenses tab (long-press, bulk actions)"
```

---

## Task 8: Update product idea status

**Files:**
- Modify: `docs/product-ideas/bulk-expense-operations.md`

- [ ] **Step 1: Update the `status:` frontmatter** from whatever it is to `shipped`

- [ ] **Step 2: Commit**

```bash
git add docs/product-ideas/bulk-expense-operations.md
git commit -m "docs: mark bulk-expense-operations as shipped"
```

---

## Self-Review

**Spec coverage:**
- ✅ Long-press activates multi-select mode
- ✅ Row gains checkbox, header changes to count + Cancel
- ✅ Bottom action bar: Set Category, Add Tag, Delete
- ✅ Tap row to toggle selection
- ✅ Select All visible button
- ✅ Works with current filters (uses `expenses` from `getFilteredExpenses()`)
- ✅ Backend `PATCH /expenses/bulk` with `{ ids, categoryId?, tagIds?, isDeleted? }`
- ✅ `bulkUpdateExpenses(ids, patch)` store action
- ✅ Offline path queues individual updates via `updateExpenseInDb`/`softDeleteExpenseInDb`

**Open questions answered:**
- Multi-select scoped to Expenses tab only (Income not included per spec)
- "Add tag" is append mode (tags are added to existing, not replaced)
- No keyboard shortcut for web (deferred, not in scope)

**Type consistency check:**
- `BulkUpdateExpensesDto.ids: string[]` → service `dto.ids` → `ownedIds.length` ✅
- `bulkUpdateExpenses(ids: string[], patch: {...})` in store interface matches implementation ✅
- `api.bulkUpdateExpenses({ ids, ...patch })` matches `expensesApi.bulkUpdateExpenses(data: {...})` ✅
