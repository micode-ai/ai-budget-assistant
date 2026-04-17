# Rescale Splits on Expense Amount Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user edits the total amount of an expense that has category splits, rescale each split proportionally so `sum(splits.amount) === expense.amount` stays true.

**Architecture:** One-file mobile change. Extract a private `persistSplits` helper (shared by existing `handleSaveSplits` and new rescale path), then add rescale + persist logic inside `handleSaveEdit` guarded by `splits.length > 0 && numericAmount !== oldAmount`. Last split absorbs rounding remainder to preserve exact sum.

**Tech Stack:** React Native (Expo 54), Zustand, SQLite via `splitRepository`, `expo-router`. No API/DB schema/shared-types changes.

**Spec:** `docs/superpowers/specs/2026-04-16-split-rescale-on-amount-edit-design.md`

**Testing reality:** No unit tests for screen components in this project. Verification: `npm run typecheck`, `npm run lint` (no new warnings), manual on Expo dev server. Do NOT add a test framework for screens.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/app/expense/[id].tsx` | modify | Extract `persistSplits` helper from `handleSaveSplits`; add rescale + persist in `handleSaveEdit` |

No other files touched.

---

## Task 1: Extract `persistSplits` helper

Goal: factor the SQLite + state + server-sync logic currently inlined in `handleSaveSplits` (lines 303-336) into a reusable async function. Must not change observable behaviour.

**Files:**
- Modify: `apps/mobile/app/expense/[id].tsx` (around lines 303-336)

- [ ] **Step 1: Add the helper**

Inside the `ExpenseDetailScreen` component, BEFORE the existing `handleSaveSplits` definition, add:

```tsx
  const persistSplits = useCallback(async (
    nextSplits: { categoryId: string; amount: number; percentage: number; notes?: string }[]
  ): Promise<void> => {
    if (!id) return;
    await deleteAllSplitsForExpense(id);
    const now = new Date();
    const newSplits: ExpenseCategorySplit[] = [];
    for (const s of nextSplits) {
      const split: ExpenseCategorySplit = {
        id: generateUUID(),
        expenseId: id,
        categoryId: s.categoryId,
        amount: s.amount,
        percentage: s.percentage,
        notes: s.notes,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        syncVersion: 0,
      };
      await insertSplit(split);
      newSplits.push(split);
    }
    setSplits(newSplits);
    api.setExpenseSplits(id, nextSplits.map(s => ({
      categoryId: s.categoryId,
      amount: s.amount,
      percentage: s.percentage,
      notes: s.notes,
    }))).catch(e => console.error('Failed to sync splits to server:', e));
  }, [id]);
```

- [ ] **Step 2: Refactor `handleSaveSplits` to use the helper**

Replace the current `handleSaveSplits` body (lines 303-336) with:

```tsx
  const handleSaveSplits = async (editorSplits: { categoryId: string; categoryName: string; amount: number; percentage: number; notes?: string }[]) => {
    await persistSplits(editorSplits.map(s => ({
      categoryId: s.categoryId,
      amount: s.amount,
      percentage: s.percentage,
      notes: s.notes,
    })));
    setShowSplitEditor(false);
  };
```

Note: the helper strips `categoryName` from the editor's input shape (it's only used by the `SplitEditor` UI, not persisted) — the SQLite row doesn't store `categoryName` anyway (it re-resolves by `categoryId` via `getCategoryById`).

- [ ] **Step 3: Typecheck**

```bash
cd apps/mobile && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/expense/[id].tsx
git commit -m "refactor(mobile): extract persistSplits helper in expense detail screen"
```

---

## Task 2: Rescale splits when amount changes

Goal: when `handleSaveEdit` changes the amount and splits exist, rescale all splits proportionally and persist them through `persistSplits`.

**Files:**
- Modify: `apps/mobile/app/expense/[id].tsx` (function `handleSaveEdit`, around lines 287-301)

- [ ] **Step 1: Rewrite `handleSaveEdit` with rescale logic**

Replace the entire existing `handleSaveEdit` function (lines 287-301) with:

```tsx
  const handleSaveEdit = async () => {
    const numericAmount = parseFloat(editAmount);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    const oldAmount = expense.amount;

    updateExpense(expense.id, {
      amount: numericAmount,
      description: editDescription.trim(),
      categoryId: editCategory || undefined,
      date: editDate,
    });

    if (splits.length > 0 && numericAmount !== oldAmount && oldAmount > 0) {
      const ratio = numericAmount / oldAmount;
      let runningSum = 0;
      const rescaled = splits.map((s, i) => {
        let amount: number;
        if (i === splits.length - 1) {
          amount = Math.round((numericAmount - runningSum) * 100) / 100;
        } else {
          amount = Math.round(s.amount * ratio * 100) / 100;
          runningSum += amount;
        }
        return {
          categoryId: s.categoryId,
          amount,
          percentage: numericAmount > 0 ? (amount / numericAmount) * 100 : 0,
          notes: s.notes,
        };
      });
      await persistSplits(rescaled);
    }

    setIsEditing(false);
  };
```

Key points:
- Captures `oldAmount` BEFORE `updateExpense` to preserve the baseline. `expense` is a reference derived from the store; after `updateExpense` the store's amount is updated, but `oldAmount` (a primitive local) is untouched.
- Guards `oldAmount > 0` to avoid divide-by-zero. In practice `expense.amount` is always > 0 because it passed the same validation when created, but the guard is cheap and defensive.
- Non-last splits round to 2dp; last split takes `numericAmount − sum(other new amounts)` so the total sum is exact.
- `percentage` is recomputed from the rounded `amount`, so the displayed percentage stays consistent with the stored amount.
- `handleSaveEdit` is now `async`. This matters only because we `await persistSplits`; no caller treats its return value (the two callers in `actionsContainer` at lines 809 and elsewhere use it as `onPress` which accepts any return). No further type changes required.

- [ ] **Step 2: Typecheck**

```bash
cd apps/mobile && npm run typecheck
```

Expected: no errors. In particular, no complaint about `onPress={handleSaveEdit}` after changing to async — React Native's `onPress` accepts `(event?: GestureResponderEvent) => void` and Promises are assignable to void callbacks in TS structural typing.

- [ ] **Step 3: Lint**

```bash
cd apps/mobile && npm run lint 2>&1 | grep -E "expense/\[id\]\.tsx" || echo "no new warnings"
```

Expected: `no new warnings` (or at most pre-existing warnings unrelated to this change).

- [ ] **Step 4: Manual smoke test**

Start the dev server: `cd apps/mobile && npx expo start --web`. Log in, create an expense with splits, then:

- Create expense $100 with splits 30/70. Open detail, edit amount → 200, save. Verify splits show A=$60 (30%), B=$140 (70%), both sum = $200.
- Edit same expense to $50. Splits → A=$15, B=$35.
- Open edit, tap Save without changing amount. Splits unchanged; no SQLite writes (no console log from `setExpenseSplits`).
- Create expense with 3-way split 33.33/33.33/33.34 of $100. Edit to $200. Last split absorbs remainder; sum === $200 exactly.
- Edit an expense without splits. Amount updates, no error, no side effects.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/expense/[id].tsx
git commit -m "feat(mobile): rescale category splits when expense amount is edited"
```

---

## Task 3: Full integration verification

**Files:** No code changes.

- [ ] **Step 1: Root typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: typecheck clean. Lint reports the same 47 pre-existing warnings, no new warnings.

- [ ] **Step 2: Walk the spec's manual test plan**

From `docs/superpowers/specs/2026-04-16-split-rescale-on-amount-edit-design.md` § Manual test plan, verify each checkbox on the Expo dev server:

- [ ] 100 → 200 with 30/70 splits → 60/140
- [ ] 100 → 50 with 30/70 splits → 15/35
- [ ] Save with unchanged amount → no split write
- [ ] Odd-thirds splits preserve exact sum after rescale
- [ ] Expense without splits → existing behaviour
- [ ] Offline mode: local splits update, `syncStatus=pending`, server syncs when online
- [ ] Rescaled splits visible on another device after sync

- [ ] **Step 3: Follow-up commit if any issue surfaced**

Only commit if a real bug was found during manual testing. Otherwise skip.

---

## Out-of-scope reminders

- Do not touch `apps/mobile/src/stores/expenseStore.ts` — `updateExpense` works as-is.
- Do not touch `apps/mobile/src/components/SplitEditor.tsx` — rescaling happens outside the editor.
- Do not touch `apps/mobile/src/db/splitRepository.ts` or any API service file — existing functions are sufficient.
- Do not add a toast/alert about the rescale; the UI update is self-evident.
- Do not rescale when `oldAmount === numericAmount` (unnecessary DB/network traffic).
- Do not try to sync split-rescale results with OCR item edits — separate concern.
- Do not introduce unit tests for `expense/[id].tsx`; the project does not test screens.
