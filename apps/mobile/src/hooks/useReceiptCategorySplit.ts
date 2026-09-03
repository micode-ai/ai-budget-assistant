import { useEffect, useMemo, useState } from 'react';
import { useCategoryStore } from '@/stores/categoryStore';
import { isProposedKey, proposedName } from '@/features/receipt/proposedCategory';
import { proposedNamesForSave } from '@/features/receipt/resolveProposedCategories';
import { seedItemCategories, seedLineCategories } from '@/features/receipt/seedItemCategories';
import { buildManualSplits, withDepositGroup } from '@/features/receipt/manualSplits';
import { reindexAfterRemoval } from '@/features/receipt/itemEditing';
import type { ReceiptItem, ScannedReceipt } from '@/features/receipt/useReceiptScanner';
import type { ItemCategorySheetItem } from '@/components/receipt/ItemCategorySheet';
import type { ReceiptCategorySplit } from '@budget/shared-utils';

type EditableItemFields = Pick<ReceiptItem, 'description' | 'quantity' | 'unitPrice' | 'totalPrice'>;

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
  // Local, editable copy of scannedReceipt.receiptItems (ABA
  // receipt-line-item-editing) — never writes back into scannedReceipt
  // itself, so a fresh scan below can't be contaminated by a previous scan's
  // edits, and currentSplits/sheetItems read from here instead.
  const [items, setItems] = useState<ReceiptItem[]>([]);
  // True only when the server DID send a split but it could not be resolved
  // against local categories, so the whole set was dropped (see the effect
  // below) — distinct from "the server never suggested a split at all".
  const [splitDropped, setSplitDropped] = useState(false);
  // The split exactly as the server sent it, shown until the user edits a line.
  // Keeping it means the screen never depends on the client reproducing the
  // server's arithmetic just to display what the server already computed.
  const [serverSplits, setServerSplits] = useState<ReceiptCategorySplit[]>([]);
  const [hasEditedCategories, setHasEditedCategories] = useState(false);
  // Set by any item edit/add/remove (ABA receipt-line-item-editing) — distinct
  // from hasEditedCategories because editing a price with every line still on
  // its server-assigned category is just as disqualifying for serverSplits as
  // reassigning a category: the server computed its split from the ORIGINAL
  // items, so once the items themselves changed that split is stale.
  const [hasEditedItems, setHasEditedItems] = useState(false);
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
      setItems(scannedReceipt.receiptItems ?? []);
      setSplitDropped(dropped);
      setServerSplits(splits);
      setHasEditedCategories(false);
      setHasEditedItems(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedReceipt]);

  // Until the user touches a line, show what the server actually sent. Deriving
  // it locally instead would require two implementations of the same arithmetic
  // to agree before anything appears — and a disagreement renders as an empty
  // block with no error, which is how a stale web bundle once hid a split the
  // server had built correctly.
  //
  // Once a line moves — or an item is edited/added/removed, which makes the
  // server's own split stale even if every category assignment is untouched —
  // the split becomes the user's rather than the machine's, and
  // buildManualSplits takes over: their assignment is published in proportion
  // to the total, with no tolerance gate second-guessing it.
  const currentSplits: ReceiptCategorySplit[] = useMemo(() => {
    if (!hasEditedCategories && !hasEditedItems) return serverSplits;
    if (items.length === 0) return [];
    const catStore = useCategoryStore.getState();
    const manualItems = items.map((item, index) => {
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
    const total = scannedReceipt?.amount ?? 0;
    const base = total - (depositSplit?.amount ?? 0);
    // willAppendGroup tells buildManualSplits a deposit group is coming right
    // back via withDepositGroup, so a receipt collapsed to one category still
    // publishes both groups instead of losing the category's money behind a
    // lone 100% deposit entry.
    return withDepositGroup(
      buildManualSplits(manualItems, base, Boolean(depositSplit)),
      depositSplit,
      total,
    );
  }, [hasEditedCategories, hasEditedItems, serverSplits, scannedReceipt, itemCategories, items]);

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

  const sheetItems: ItemCategorySheetItem[] = items.map((item, index) => ({
    index,
    description: item.description,
    categoryId: itemCategories[index] ?? null,
  }));

  function handleItemCategoryChange(itemIndex: number, categoryId: string | null) {
    setItemCategories((prev) => ({ ...prev, [itemIndex]: categoryId }));
    setHasEditedCategories(true);
  }

  // Edits a line's description/quantity/unitPrice/totalPrice (ABA
  // receipt-line-item-editing) — its index, and therefore its category
  // assignment in itemCategories, is untouched.
  function handleItemFieldChange(index: number, patch: Partial<EditableItemFields>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setHasEditedItems(true);
  }

  // Appends a line the model missed. The new index (items.length before the
  // push) has no existing itemCategories entry, so it reads as unassigned by
  // construction — no reindexing needed, unlike handleRemoveItem below.
  function handleAddItem(item: EditableItemFields) {
    setItems((prev) => [...prev, item]);
    setHasEditedItems(true);
  }

  // Removes a hallucinated/duplicate line. Reindexes itemCategories in the
  // SAME function call as the items update (see reindexAfterRemoval + the
  // invariant documented on it) so no intermediate render can pair a
  // category with the wrong (now-shifted) line.
  function handleRemoveItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setItemCategories((prev) => reindexAfterRemoval(prev, index));
    setHasEditedItems(true);
  }

  // Mirrors the screen's previous inline handleReset: deliberately does NOT
  // reset hasEditedCategories/serverSplits/hasEditedItems/items — the next
  // scan's seeding effect above always resets those anyway, and this is the
  // exact subset the original reset touched.
  function resetSplitState() {
    setItemCategories({});
    setSplitDropped(false);
    setShowSplitSheet(false);
  }

  return {
    itemCategories,
    items,
    hasEditedItems,
    splitDropped,
    currentSplits,
    proposedNamesInPlay,
    proposedNamesToCreate,
    sheetItems,
    showSplitSheet,
    setShowSplitSheet,
    handleItemCategoryChange,
    handleItemFieldChange,
    handleAddItem,
    handleRemoveItem,
    resetSplitState,
  };
}
