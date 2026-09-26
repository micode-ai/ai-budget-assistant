import type { Income } from '@budget/shared-types';

/** Same clientId the server and `accountTransferActions` give a transfer's income row. */
const TRANSFER_INCOME_PREFIX = 'transfer-income-';

/**
 * Whether an income belongs in the "sort incomes" pass — what the banner
 * counts, mirroring the server's candidate query. Debts, debt repayments and
 * transfers counted as income are excluded: a transfer is the user's own money
 * moving between their accounts, so no income category fits it (ABA-604).
 * The server excludes transfers by their link; the device has no link, so it
 * reads the clientId pattern both sides already share.
 */
export function isCategorizableIncome(
  income: Pick<Income, 'id' | 'categoryId' | 'isDebt' | 'isDebtRepayment'> & { clientId?: string | null; localId?: string },
): boolean {
  if (income.categoryId || income.isDebt || income.isDebtRepayment) return false;
  const ids = [income.id, income.clientId, income.localId];
  return !ids.some((id) => typeof id === 'string' && id.startsWith(TRANSFER_INCOME_PREFIX));
}
