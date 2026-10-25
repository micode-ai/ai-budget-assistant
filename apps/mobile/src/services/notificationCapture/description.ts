/**
 * The description written on an auto-captured expense.
 *
 * The merchant alone when the parser found one — the row's source badge ("Autozapis" /
 * "Auto-captured") already says where it came from, so a suffix only repeated that, and it was
 * English in every UI language. Without a merchant, the caller's localized fallback label.
 */
export function capturedExpenseDescription(
  merchant: string | null | undefined,
  fallbackLabel: string,
): string {
  const m = merchant?.trim();
  return m ? m : fallbackLabel;
}
