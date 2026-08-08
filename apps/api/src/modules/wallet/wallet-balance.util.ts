/**
 * The wallet balance formula, in one place.
 *
 * Two callers need it: `getSummary` (one account) and `getSummariesForAccounts`
 * (every account the caller belongs to, for the transfer form's balance display).
 * Keeping the arithmetic inline in both would let them drift on the first edit,
 * and a transfer form quoting a different balance than the wallet screen is worse
 * than showing no balance at all.
 */

export interface WalletBalanceTotals {
  totalIncomes: number;
  totalExpenses: number;
  totalExchangedIn: number;
  totalExchangedOut: number;
  totalTransferredIn: number;
  totalTransferredOut: number;
}

export interface WalletBalanceRow extends WalletBalanceTotals {
  currencyCode: string;
  initialAmount: number;
  currentBalance: number;
}

export const EMPTY_WALLET_TOTALS: WalletBalanceTotals = {
  totalIncomes: 0,
  totalExpenses: 0,
  totalExchangedIn: 0,
  totalExchangedOut: 0,
  totalTransferredIn: 0,
  totalTransferredOut: 0,
};

export function buildWalletBalanceRow(
  currencyCode: string,
  initialAmount: number,
  totals: WalletBalanceTotals,
): WalletBalanceRow {
  const currentBalance =
    initialAmount +
    totals.totalIncomes -
    totals.totalExpenses +
    totals.totalExchangedIn -
    totals.totalExchangedOut +
    totals.totalTransferredIn -
    totals.totalTransferredOut;

  return {
    currencyCode,
    initialAmount,
    ...totals,
    currentBalance,
  };
}

/** Composite key for the per-account totals maps. */
export function accountCurrencyKey(accountId: string, currencyCode: string): string {
  return `${accountId}|${currencyCode}`;
}
