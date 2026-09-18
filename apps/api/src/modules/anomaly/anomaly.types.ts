import type { AnomalyAlertType } from '@budget/shared-types';

export interface CreateAlertBase {
  accountId: string;
  userId: string;
  type: AnomalyAlertType;
  dedupKey: string;
  params: Record<string, unknown>;
  expenseId?: string;
  categoryId?: string;
}

/**
 * Discriminated on `skipPush` so a future detector that forgets pushTitle/
 * pushBody for a pushing alert fails to COMPILE instead of silently never
 * pushing. Feed-only alerts (currently only price_overcharge) explicitly opt
 * out via `skipPush: true`; every other alert must supply both narrators.
 */
export type CreateAlertInput = CreateAlertBase &
  (
    | { skipPush: true; pushTitle?: never; pushBody?: never }
    | { skipPush?: false; pushTitle: (lang: string) => string; pushBody: (lang: string) => string }
  );

/** The expense fields the detectors read — callers must pass a Prisma Expense row (or superset). */
export interface DetectorExpense {
  id: string;
  merchant: string | null;
  description: string | null;
  amount: string | number | { toString(): string }; // Prisma Decimal serializes as string | number — always wrap with Number() for arithmetic
  currencyCode: string;
  date: Date;
  recurringId: string | null;
  isRecurring: boolean;
  categoryId: string | null;
  importBatchId: string | null;
  /** Present on full Prisma rows; only detectDuplicateCharge's merge-suggestion reads it. */
  source?: string | null;
}
