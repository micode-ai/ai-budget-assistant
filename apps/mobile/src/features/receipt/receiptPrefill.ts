import type { ExpenseCreatePrefill } from '@/components/expenses/create/ExpenseCreateForm';
import type { ScannedReceipt } from '@/features/receipt/useReceiptScanner';

export interface ReceiptPrefillInputs {
  receipt: ScannedReceipt;
  /** The merchant as currently shown in the confirm card, which the user may
   *  have corrected — never `receipt.merchant`, which is the raw OCR read. */
  merchant: string;
  /**
   * `categoryStore.getCategoryByName(name, 'expense')?.id`, injected so this
   * stays pure. Returns `undefined` when the suggested name matches nothing
   * local yet.
   */
  resolveCategoryByName: (name: string) => string | undefined;
}

/**
 * "This scan is close but I want the full form" — the receipt's values as an
 * `ExpenseCreatePrefill`.
 *
 * Extracted from `useReceiptSave.handleEditExpense` because that hand-off now
 * has **two** destinations that must agree: the phone pushes `/expense/new`
 * with these as route params, and the desktop dialog passes the same object to
 * `ExpenseCreateForm`'s `initial` prop without navigating anywhere. Two
 * hand-rolled copies of a mapping with a fallback branch is how the two
 * platforms start disagreeing about what "Edit" carries over.
 *
 * The category fallback is the part worth pinning: the OCR returns either a
 * resolved `categoryId` or a `categorySuggestion` *name*, and only the name
 * case needs a local lookup. Dropping that branch is silent — the form simply
 * opens with no category and the user re-picks one, which looks like the model
 * having no opinion rather than like a bug.
 *
 * Empty strings rather than `undefined` for the two resolvable fields: this
 * shape used to be `useLocalSearchParams` route params, where every value is a
 * string, and `ExpenseCreateForm` reads them with `|| ''` guards either way.
 * Kept identical so the routed path is byte-for-byte what it was.
 */
export function buildReceiptPrefill({
  receipt,
  merchant,
  resolveCategoryByName,
}: ReceiptPrefillInputs): ExpenseCreatePrefill {
  let categoryId = receipt.categoryId || '';
  if (!categoryId && receipt.categorySuggestion) {
    categoryId = resolveCategoryByName(receipt.categorySuggestion) || '';
  }

  return {
    amount: receipt.amount.toString(),
    description: receipt.description,
    merchant: merchant.trim(),
    categoryId,
    currencyCode: receipt.currencyCode,
  };
}
