# Transaction Long-Press Context Menu

## Summary

Add long-press context menu to expense and income items on the Expenses/Incomes tab (`app/(tabs)/expenses.tsx`). When user long-presses a transaction, a bottom sheet slides up with options: Edit, Duplicate, Delete.

## Scope

- **In scope**: Long-press menu on the Expenses/Incomes tab only; update `income/new.tsx` to accept `description` and `categoryId` params for duplication
- **Out of scope**: Home screen widgets, calendar, analytics, or any other screens

## Component: `TransactionActionSheet`

**File**: `apps/mobile/src/components/TransactionActionSheet.tsx`

**Props**:
```typescript
interface TransactionActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  canEdit: boolean; // hide destructive/write actions for viewers
}
```

**UI**:
- `Modal` with `transparent` background, semi-transparent overlay (`rgba(0,0,0,0.4)`)
- `Animated.View` slides up from bottom with `Animated.timing` (~250ms), slides back down on dismiss before calling `onClose`
- Menu items — each a row with Ionicons icon on the left and label:
  - `create-outline` icon + i18n `common.edit` — always visible
  - `copy-outline` icon + i18n `common.duplicate` — hidden when `canEdit=false`
  - `trash-outline` icon + i18n `common.delete` — red/destructive color, hidden when `canEdit=false`
- Tap on overlay closes the sheet
- Uses `useTheme()` hook from `@/theme` for light/dark theme support
- Bottom safe area padding via `useSafeAreaInsets` (appropriate for Modal, unlike screens which use `SafeAreaView`)

## Integration in `expenses.tsx`

**State**:
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

**Long-press handler**:
- Add `onLongPress` to `TouchableOpacity` in both `renderExpenseItem` and `renderIncomeItem`
- `delayLongPress={400}` — matches existing pattern in chat.tsx
- Haptic feedback via `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` from `expo-haptics`
- On long-press: save item data to `selectedTransaction`, set `actionSheetVisible = true`

**Action handlers**:
- **Edit**: Navigate to `router.push(/expense/${id}?edit=true)` or `router.push(/income/${id}?edit=true)` — detail screens must read `edit` param and auto-enter edit mode via `setIsEditing(true)`
- **Duplicate**: Navigate to `router.push(/expense/new?amount=...&description=...&categoryId=...&currencyCode=...)` or equivalent for income — pre-fills the creation form with today's date (same pattern as existing `handleCopy` in `expense/[id].tsx`)
- **Delete**: Show `Alert.alert` confirmation dialog, then call `deleteExpense(id)` or `deleteIncome(id)` from respective store, then refresh the list

## Prerequisite: Update detail screens and income/new

1. **`expense/[id].tsx`** and **`income/[id].tsx`**: Read `edit` query param on mount; if `edit=true`, call `setIsEditing(true)` immediately
2. **`income/new.tsx`**: Accept `description` and `categoryId` query params and pre-fill the form (currently only accepts `amount`, `currencyCode`, and debt-related params)

## i18n Keys

Add to all 8 locale files (`en`, `ru`, `ua`, `be`, `de`, `es`, `fr`, `pl`):

```
common.duplicate — "Duplicate" / "Дублировать" / etc.
common.deleteConfirmTitle — "Delete transaction?" / "Удалить транзакцию?" / etc.
common.deleteConfirmMessage — "This action cannot be undone." / "Это действие нельзя отменить." / etc.
```

Reuse existing keys: `common.edit`, `common.delete`, `common.cancel`.

## Design Decisions

1. **Custom Modal over third-party library** — project has no action sheet dependencies; adding one for a single use case is overkill
2. **Alert for delete confirmation** — consistent with existing delete patterns throughout the app
3. **Duplicate = open pre-filled form** — matches existing copy behavior on expense detail screen; uses today's date, not original transaction date
4. **Edit = navigate to detail screen with `?edit=true`** — reuses existing inline edit functionality, avoids duplicating edit logic
5. **Role gating via `canEdit`** — viewers can only open the detail screen (edit), not duplicate or delete; matches existing FAB gating pattern in expenses.tsx
