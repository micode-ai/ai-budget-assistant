/**
 * Content-dedup predicate for notification auto-capture (Tier 1, Case B).
 *
 * Implements predicate P(stub, existing):
 *   - equal amount (exact decimal equality)
 *   - equal currencyCode
 *   - |date - occurredAt| ≤ 1 day
 *   - equal non-empty payee (merchant?.trim() || description?.trim(), lowercased)
 *
 * This is the client-side mirror of AnomalyService.detectDuplicateCharge's predicate
 * from anomaly.service.ts. Kept pure so it is unit-testable without the event pipeline.
 *
 * Reference: docs/superpowers/specs/2026-06-29-notification-capture-dedup-design.md §Case B
 */

const DAY_MS = 86_400_000;

export interface ParsedNotificationStub {
  amount: number;
  currencyCode: string;
  occurredAt: Date;
  /** Canonical merchant name from the notification parser. */
  merchant?: string | null;
}

export interface MinimalExpense {
  isDeleted?: boolean;
  amount: number | string;
  currencyCode: string;
  date: Date | string;
  merchant?: string | null;
  description?: string | null;
}

/**
 * Returns the lowercased payee label for an existing expense.
 * Mirrors the server-side `expensePayee` helper.
 */
export function payeeOf(e: { merchant?: string | null; description?: string | null }): string {
  return (e.merchant?.trim() || e.description?.trim() || '').toLowerCase();
}

/**
 * Returns the payee label for a parsed notification stub.
 * The stub's "merchant" is the canonical merchant name; there is no separate
 * description field in the parsed payload.
 */
export function stubPayeeOf(stub: ParsedNotificationStub): string {
  return (stub.merchant?.trim() || '').toLowerCase();
}

/**
 * Returns true if a non-deleted existing expense satisfies predicate P against
 * the parsed notification stub, meaning a real expense already covers this
 * transaction and the stub should NOT be created.
 *
 * Returns false (no match) when:
 *  - payee is empty on either side (unidentifiable)
 *  - currencies differ
 *  - date gap > 1 day
 *  - amount differs
 */
export function contentMatchesExisting(
  stub: ParsedNotificationStub,
  expenses: MinimalExpense[],
): boolean {
  const thisPayee = stubPayeeOf(stub);
  if (!thisPayee) {
    // Unidentifiable stub — never skip (can't confirm it's a dup without a payee)
    return false;
  }

  const stubAmount = Number(stub.amount);
  const stubTime = stub.occurredAt.getTime();

  for (const e of expenses) {
    if (e.isDeleted) continue;
    if (e.currencyCode !== stub.currencyCode) continue;
    if (Number(e.amount) !== stubAmount) continue;

    const eDate = new Date(e.date).getTime();
    if (Math.abs(eDate - stubTime) > DAY_MS) continue;

    const otherPayee = payeeOf(e);
    if (!otherPayee) continue; // unidentifiable existing — skip (don't match against blank)

    if (otherPayee === thisPayee) return true;
  }

  return false;
}
