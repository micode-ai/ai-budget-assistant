# Transaction Long-Press Context Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a long-press bottom sheet menu (Edit, Duplicate, Delete) to expense/income items on the Expenses/Incomes tab.

**Architecture:** New `TransactionActionSheet` component using React Native `Modal` + `Animated` for a bottom sheet. Integrated into `expenses.tsx` via `onLongPress` on existing `TouchableOpacity` items. Detail screens updated to support `?edit=true` param. `income/new.tsx` updated to accept `description` and `categoryId` params for duplication.

**Tech Stack:** React Native Modal, Animated API, Expo Router, Zustand stores, i18n (react-i18next)

**Spec:** `docs/superpowers/specs/2026-03-24-transaction-long-press-menu-design.md`

**Note:** Spec uses `onCopy` prop name; plan uses `onDuplicate` to match the i18n key `common.duplicate`. Haptic feedback from spec is skipped — `expo-haptics` is not installed and adding a dependency for one call is overkill. Zustand stores reactively update `getFilteredExpenses()`/`getFilteredIncomes()` after deletion, so no manual list refresh is needed.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/mobile/src/components/TransactionActionSheet.tsx` | Create | Reusable bottom sheet with Edit/Duplicate/Delete actions |
| `apps/mobile/app/(tabs)/expenses.tsx` | Modify | Add `onLongPress` to items, wire action sheet |
| `apps/mobile/app/expense/[id].tsx` | Modify | Read `edit` query param, auto-enter edit mode |
| `apps/mobile/app/income/[id].tsx` | Modify | Read `edit` query param, auto-enter edit mode |
| `apps/mobile/app/income/new.tsx` | Modify | Accept `description` and `categoryId` query params |
| `apps/mobile/src/i18n/locales/en.ts` | Modify | Add `common.duplicate`, `common.deleteConfirmTitle`, `common.deleteConfirmMessage` |
| `apps/mobile/src/i18n/locales/ru.ts` | Modify | Same keys in Russian |
| `apps/mobile/src/i18n/locales/ua.ts` | Modify | Same keys in Ukrainian |
| `apps/mobile/src/i18n/locales/be.ts` | Modify | Same keys in Belarusian |
| `apps/mobile/src/i18n/locales/de.ts` | Modify | Same keys in German |
| `apps/mobile/src/i18n/locales/es.ts` | Modify | Same keys in Spanish |
| `apps/mobile/src/i18n/locales/fr.ts` | Modify | Same keys in French |
| `apps/mobile/src/i18n/locales/pl.ts` | Modify | Same keys in Polish |

---

### Task 1: Add i18n keys to all 8 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts` (common section, ~line 2-23)
- Modify: `apps/mobile/src/i18n/locales/ru.ts` (common section)
- Modify: `apps/mobile/src/i18n/locales/ua.ts` (common section)
- Modify: `apps/mobile/src/i18n/locales/be.ts` (common section)
- Modify: `apps/mobile/src/i18n/locales/de.ts` (common section)
- Modify: `apps/mobile/src/i18n/locales/es.ts` (common section)
- Modify: `apps/mobile/src/i18n/locales/fr.ts` (common section)
- Modify: `apps/mobile/src/i18n/locales/pl.ts` (common section)

- [ ] **Step 1: Add 3 new keys to `common` section in all 8 locales**

Add after the existing `showAll` key in each locale's `common` object:

**en.ts:**
```typescript
duplicate: 'Duplicate',
deleteConfirmTitle: 'Delete Transaction',
deleteConfirmMessage: 'Are you sure? This action cannot be undone.',
```

**ru.ts:**
```typescript
duplicate: 'Дублировать',
deleteConfirmTitle: 'Удалить транзакцию',
deleteConfirmMessage: 'Вы уверены? Это действие нельзя отменить.',
```

**ua.ts:**
```typescript
duplicate: 'Дублювати',
deleteConfirmTitle: 'Видалити транзакцію',
deleteConfirmMessage: 'Ви впевнені? Цю дію не можна скасувати.',
```

**be.ts:**
```typescript
duplicate: 'Дубліраваць',
deleteConfirmTitle: 'Выдаліць транзакцыю',
deleteConfirmMessage: 'Вы ўпэўнены? Гэта дзеянне нельга адмяніць.',
```

**de.ts:**
```typescript
duplicate: 'Duplizieren',
deleteConfirmTitle: 'Transaktion löschen',
deleteConfirmMessage: 'Sind Sie sicher? Diese Aktion kann nicht rückgängig gemacht werden.',
```

**es.ts:**
```typescript
duplicate: 'Duplicar',
deleteConfirmTitle: 'Eliminar transacción',
deleteConfirmMessage: '¿Estás seguro? Esta acción no se puede deshacer.',
```

**fr.ts:**
```typescript
duplicate: 'Dupliquer',
deleteConfirmTitle: 'Supprimer la transaction',
deleteConfirmMessage: 'Êtes-vous sûr ? Cette action est irréversible.',
```

**pl.ts:**
```typescript
duplicate: 'Duplikuj',
deleteConfirmTitle: 'Usuń transakcję',
deleteConfirmMessage: 'Czy na pewno? Tej akcji nie można cofnąć.',
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/i18n/locales/*.ts
git commit -m "feat(i18n): add duplicate and delete confirmation keys to all 8 locales"
```

---

### Task 2: Update `income/new.tsx` to accept `description` and `categoryId` params

**Files:**
- Modify: `apps/mobile/app/income/new.tsx:33-51`

- [ ] **Step 1: Add `description` and `categoryId` to useLocalSearchParams type**

In `apps/mobile/app/income/new.tsx`, change the params type (line 33-40):

```typescript
// Before:
const params = useLocalSearchParams<{
  isDebt?: string;
  isDebtRepayment?: string;
  relatedDebtExpenseId?: string;
  debtContactName?: string;
  currencyCode?: string;
  amount?: string;
}>();

// After:
const params = useLocalSearchParams<{
  isDebt?: string;
  isDebtRepayment?: string;
  relatedDebtExpenseId?: string;
  debtContactName?: string;
  currencyCode?: string;
  amount?: string;
  description?: string;
  categoryId?: string;
}>();
```

- [ ] **Step 2: Initialize `description`, `selectedCategory`, and `currencyCode` from params**

Change the state initializations (lines 49, 51, 53-55):

```typescript
// Before:
const [description, setDescription] = useState('');
// ...
const [selectedCategory, setSelectedCategory] = useState('');
// ...
const [currencyCode, setCurrencyCode] = useState<Currency>(
  user?.currencyCode || 'USD',
);

// After:
const [description, setDescription] = useState(params.description || '');
// ...
const [selectedCategory, setSelectedCategory] = useState(params.categoryId || '');
// ...
const [currencyCode, setCurrencyCode] = useState<Currency>(
  (params.currencyCode as Currency) || user?.currencyCode || 'USD',
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/income/new.tsx
git commit -m "feat: accept description and categoryId params in income/new screen"
```

---

### Task 3: Update detail screens to support `?edit=true` param

**Files:**
- Modify: `apps/mobile/app/expense/[id].tsx:42,67`
- Modify: `apps/mobile/app/income/[id].tsx:30,36`

- [ ] **Step 1: Update `expense/[id].tsx`**

Change the `useLocalSearchParams` call (line 42):

```typescript
// Before:
const { id } = useLocalSearchParams<{ id: string }>();

// After:
const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
```

Add a `useEffect` after the existing `isEditing` state declaration (after line 67):

```typescript
const [isEditing, setIsEditing] = useState(false);

useEffect(() => {
  if (edit === 'true') setIsEditing(true);
}, [edit]);
```

- [ ] **Step 2: Update `income/[id].tsx`**

Change the `useLocalSearchParams` call (line 30):

```typescript
// Before:
const { id } = useLocalSearchParams<{ id: string }>();

// After:
const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
```

Add a `useEffect` after the existing `isEditing` state declaration (after line 36):

```typescript
const [isEditing, setIsEditing] = useState(false);

useEffect(() => {
  if (edit === 'true') setIsEditing(true);
}, [edit]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/expense/[id].tsx apps/mobile/app/income/[id].tsx
git commit -m "feat: support ?edit=true param to auto-enter edit mode on detail screens"
```

---

### Task 4: Create `TransactionActionSheet` component

**Files:**
- Create: `apps/mobile/src/components/TransactionActionSheet.tsx`

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/components/TransactionActionSheet.tsx`:

```typescript
import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface TransactionActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canEdit: boolean;
}

export function TransactionActionSheet({
  visible,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  canEdit,
}: TransactionActionSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleAction = (action: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      action();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16 },
            {
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.handle} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleAction(onEdit)}
          >
            <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.menuItemText}>{t('common.edit')}</Text>
          </TouchableOpacity>

          {canEdit && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleAction(onDuplicate)}
            >
              <Ionicons name="copy-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.menuItemText}>{t('common.duplicate')}</Text>
            </TouchableOpacity>
          )}

          {canEdit && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleAction(onDelete)}
              >
                <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
                <Text style={[styles.menuItemText, { color: theme.colors.danger }]}>
                  {t('common.delete')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  menuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[2],
  },
  menuItemText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginHorizontal: theme.spacing[2],
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/TransactionActionSheet.tsx
git commit -m "feat: create TransactionActionSheet bottom sheet component"
```

---

### Task 5: Integrate action sheet into `expenses.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/expenses.tsx`

- [ ] **Step 1: Add imports**

Add to existing imports at the top of `apps/mobile/app/(tabs)/expenses.tsx`:

```typescript
import { Alert } from 'react-native';
import { TransactionActionSheet } from '@/components/TransactionActionSheet';
```

Note: `Alert` needs to be added to the existing `react-native` import (line 1). `View, Text, FlatList, TouchableOpacity, RefreshControl, Animated, ScrollView, Image, Alert`.

- [ ] **Step 2: Add state for selected transaction and action sheet visibility**

Inside `ExpensesScreen`, after the `styles` declaration (after line 45), add:

```typescript
const [selectedTransaction, setSelectedTransaction] = useState<{
  id: string;
  type: 'expense' | 'income';
  amount?: number;
  description?: string;
  categoryId?: string;
  currencyCode?: string;
} | null>(null);
const [actionSheetVisible, setActionSheetVisible] = useState(false);
```

- [ ] **Step 3: Add long-press handler**

After the existing `handleScanReceipt` function (after line 86), add:

```typescript
const handleLongPress = (item: Expense | Income, type: 'expense' | 'income') => {
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

const handleEdit = () => {
  if (!selectedTransaction) return;
  const path = selectedTransaction.type === 'expense' ? '/expense' : '/income';
  if (canEdit) {
    router.push({ pathname: `${path}/${selectedTransaction.id}`, params: { edit: 'true' } });
  } else {
    router.push(`${path}/${selectedTransaction.id}`);
  }
};

const handleDuplicate = () => {
  if (!selectedTransaction) return;
  const path = selectedTransaction.type === 'expense' ? '/expense/new' : '/income/new';
  router.push({
    pathname: path,
    params: {
      amount: selectedTransaction.amount?.toString() || '',
      description: selectedTransaction.description || '',
      categoryId: selectedTransaction.categoryId || '',
      currencyCode: selectedTransaction.currencyCode || '',
    },
  });
};

const handleDeleteFromList = () => {
  if (!selectedTransaction) return;
  Alert.alert(
    t('common.deleteConfirmTitle'),
    t('common.deleteConfirmMessage'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (selectedTransaction.type === 'expense') {
            deleteExpense(selectedTransaction.id);
          } else {
            deleteIncome(selectedTransaction.id);
          }
        },
      },
    ],
  );
};
```

- [ ] **Step 4: Extract `deleteExpense` and `deleteIncome` from stores**

Update the store destructuring at lines 34-35:

```typescript
// Before:
const { loadExpenses, getFilteredExpenses, filters: expenseFilters, setFilters: setExpenseFilters } = useExpenseStore();
const { loadIncomes, getFilteredIncomes, filters: incomeFilters, setFilters: setIncomeFilters } = useIncomeStore();

// After:
const { loadExpenses, getFilteredExpenses, deleteExpense, filters: expenseFilters, setFilters: setExpenseFilters } = useExpenseStore();
const { loadIncomes, getFilteredIncomes, deleteIncome, filters: incomeFilters, setFilters: setIncomeFilters } = useIncomeStore();
```

- [ ] **Step 5: Add `onLongPress` to `renderExpenseItem`**

Update the `TouchableOpacity` in `renderExpenseItem` (line 89-91):

```typescript
// Before:
<TouchableOpacity
  style={styles.expenseCard}
  onPress={() => router.push(`/expense/${item.id}`)}
>

// After:
<TouchableOpacity
  style={styles.expenseCard}
  onPress={() => router.push(`/expense/${item.id}`)}
  onLongPress={() => handleLongPress(item, 'expense')}
  delayLongPress={400}
>
```

- [ ] **Step 6: Add `onLongPress` to `renderIncomeItem`**

Update the `TouchableOpacity` in `renderIncomeItem` (line 117-119):

```typescript
// Before:
<TouchableOpacity
  style={styles.expenseCard}
  onPress={() => router.push(`/income/${item.id}`)}
>

// After:
<TouchableOpacity
  style={styles.expenseCard}
  onPress={() => router.push(`/income/${item.id}`)}
  onLongPress={() => handleLongPress(item, 'income')}
  delayLongPress={400}
>
```

- [ ] **Step 7: Render `TransactionActionSheet` before the closing `</SafeAreaView>`**

Add just before the `</SafeAreaView>` closing tag (before line 508):

```typescript
<TransactionActionSheet
  visible={actionSheetVisible}
  onClose={() => setActionSheetVisible(false)}
  onEdit={handleEdit}
  onDuplicate={handleDuplicate}
  onDelete={handleDeleteFromList}
  canEdit={canEdit}
/>
```

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/(tabs)/expenses.tsx
git commit -m "feat: integrate long-press context menu on expense/income list items"
```

---

### Task 6: Manual smoke test

- [ ] **Step 1: Start the app**

```bash
cd apps/mobile && npx expo start --web
```

- [ ] **Step 2: Verify the following scenarios**

1. Long-press an expense → bottom sheet appears with Edit, Duplicate, Delete
2. Long-press an income → bottom sheet appears with Edit, Duplicate, Delete
3. Tap overlay → sheet dismisses
4. Tap "Edit" → navigates to detail screen in edit mode
5. Tap "Duplicate" → navigates to new form pre-filled with transaction data
6. Tap "Delete" → shows confirmation alert → deletes on confirm
7. Short tap still navigates to detail screen normally
8. Switch between dark/light themes → sheet styles look correct

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
