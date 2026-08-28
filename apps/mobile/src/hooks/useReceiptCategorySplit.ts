import { useEffect, useMemo, useState } from 'react';
import { useCategoryStore } from '@/stores/categoryStore';
import { isProposedKey, proposedName } from '@/features/receipt/proposedCategory';
import { proposedNamesForSave } from '@/features/receipt/resolveProposedCategories';
import { seedItemCategories, seedLineCategories } from '@/features/receipt/seedItemCategories';
import { buildManualSplits, withDepositGroup } from '@/features/receipt/manualSplits';
import type { ScannedReceipt } from '@/features/receipt/useReceiptScanner';
import type { ItemCategorySheetItem } from '@/components/receipt/ItemCategorySheet';
import type { ReceiptCategorySplit } from '@budget/shared-utils';

/**
 * Owns the receipt category-split state for `app/expense/receipt.tsx`
 * (ABA-448) — the server's split seeded on every new scan, the user's own
 * line-by-line reassignments, and everything the confirm card and the
 * `ItemCategorySheet` derive from them. Extracted out of the screen with no
 * change in behavior; the comments below are carried over verbatim because
 * they document invariants that are easy to break on a casual edit.
 */
export function useReceiptCategorySplit(scannedReceipt: ScannedReceipt | null) {
  // itemCategories: receiptItems index -> locally-resolved category id.
  // Seeded from the server's categorySplits (the effect below) and updated
  // live as the user reassigns lines in the ItemCategorySheet.
  const [itemCategories, setItemCategories] = useState<Record<number, string | null>>({});
  // True only when the server DID send a split but it could not be resolved
  // against local categories, so the whole set was dropped (see the effect
  // below) — distinct from "the server never suggested a split at all".
  const [splitDropped, setSplitDropped] = useState(false);
  // The split exactly as the server sent it, shown until the user edits a line.
  // Keeping it means the screen never depends on the client reproducing the
  // server's arithmetic just to display what the server already computed.
  const [serverSplits, setServerSplits] = useState<ReceiptCategorySplit[]>([]);
  const [hasEditedCategories, setHasEditedCategories] = useState(false);
  const [showSplitSheet, setShowSplitSheet] = useState(false);

  useEffect(() => {
    if (scannedReceipt) {
      // Resolve the server's splits against local categories: by id first,
      // falling back to a name lookup (the same fallback this screen already
      // uses for categorySuggestion). A proposal (categoryId null) has no local
      // category by definition and is held under a sentinel until save.
      const catStore = useCategoryStore.getState();
      const resolveLocalId = (c: { categoryId: string | null; categoryName: string }) =>
        ((c.categoryId ? catStore.getCategoryById(c.categoryId) : undefined) ||
          catStore.getCategoryByName(c.categoryName, 'expense'))?.id;

      const { dropped, splits } = seedItemCategories(scannedReceipt.categorySplits, resolveLocalId);
      // The lines keep their own categories even when there is no money split —
      // the server classifies and reconciles as two separate questions, and the
      // answer to the first is useful on its own.
      setItemCategories(seedLineCategories(scannedReceipt.receiptItems, resolveLocalId));
      setSplitDropped(dropped);
      setServerSplits(splits);
      setHasEditedCategories(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedReceipt]);

  // Until the user touches a line, show what the server actually sent. Deriving
  // it locally instead would require two implementations of the same arithmetic
  // to agree before anything appears — and a disagreement renders as an empty
  // block with no error, which is how a stale web bundle once hid a split the
  // server had built correctly.
  //
  // Once a line moves, the split becomes the user's rather than the machine's,
  // and buildManualSplits takes over: their assignment is published in
  // proportion to the total, with no tolerance gate second-guessing it.
  const currentSplits: ReceiptCategorySplit[] = useMemo(() => {
    if (!hasEditedCategories) return serverSplits;
    if (!scannedReceipt?.receiptItems || scannedReceipt.receiptItems.length === 0) return [];
    const catStore = useCategoryStore.getState();
    const items = scannedReceipt.receiptItems.map((item, index) => {
      const categoryId = itemCategories[index] ?? null;
      return {
        index,
        amount: item.totalPrice,
        categoryId,
        categoryName: categoryId
          ? isProposedKey(categoryId)
            ? proposedName(categoryId)
            : catStore.getCategoryById(categoryId)?.name ?? null
          : null,
      };
    });
    // The deposit group is the only split with no lines behind it. Identified
    // structurally rather than by name, because the name is localized and comes
    // from the server. `.find` (not `.filter`) is deliberate: the server-side
    // finalizer emits at most one deposit group per receipt, so a second match
    // is not a case this screen needs to handle.
    const depositSplit = serverSplits.find((s) => s.itemIndexes.length === 0) ?? null;
    const base = scannedReceipt.amount - (depositSplit?.amount ?? 0);
    // willAppendGroup tells buildManualSplits a deposit group is coming right
    // back via withDepositGroup, so a receipt collapsed to one category still
    // publishes both groups instead of losing the category's money behind a
    // lone 100% deposit entry.
    return withDepositGroup(
      buildManualSplits(items, base, Boolean(depositSplit)),
      depositSplit,
      scannedReceipt.amount,
    );
  }, [hasEditedCategories, serverSplits, scannedReceipt, itemCategories]);

  // Names still attached to at least one line. Feeds the line-category picker
  // ONLY — a proposal the user emptied disappears from it, and a category with
  // no lines behind it (the deposit) has no place in a picker over lines.
  // Creating categories reads proposedNamesToCreate below instead.
  const proposedNamesInPlay = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(itemCategories)
            .filter(isProposedKey)
            .map((key) => proposedName(key as string)),
        ),
      ),
    [itemCategories],
  );

  // What actually gets created on save: every proposal on a line PLUS every
  // proposal in the split being published. The deposit group is only in the
  // latter — it has no lines — so a list built from the lines alone left its
  // `new:` sentinel to travel to the API. See proposedNamesForSave.
  const proposedNamesToCreate = useMemo(
    () => proposedNamesForSave(itemCategories, currentSplits),
    [itemCategories, currentSplits],
  );

  const sheetItems: ItemCategorySheetItem[] = (scannedReceipt?.receiptItems ?? []).map((item, index) => ({
    index,
    description: item.description,
    categoryId: itemCategories[index] ?? null,
  }));

  function handleItemCategoryChange(itemIndex: number, categoryId: string | null) {
    setItemCategories((prev) => ({ ...prev, [itemIndex]: categoryId }));
    setHasEditedCategories(true);
  }

  // Mirrors the screen's previous inline handleReset: deliberately does NOT
  // reset hasEditedCategories/serverSplits — the next scan's seeding effect
  // above always resets those anyway, and this is the exact subset the
  // original reset touched.
  function resetSplitState() {
    setItemCategories({});
    setSplitDropped(false);
    setShowSplitSheet(false);
  }

  return {
    itemCategories,
    splitDropped,
    currentSplits,
    proposedNamesInPlay,
    proposedNamesToCreate,
    sheetItems,
    showSplitSheet,
    setShowSplitSheet,
    handleItemCategoryChange,
    resetSplitState,
  };
}
