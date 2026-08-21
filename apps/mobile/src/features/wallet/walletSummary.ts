import { resolveWalletCurrencies } from '@budget/shared-utils';
import type { Currency, WalletSummary } from '@budget/shared-types';

/** Per-currency totals, exactly as the SQLite aggregate helpers return them. */
export type CurrencyTotals = Record<string, number>;

export interface WalletMovementTotals {
  incomeTotals: CurrencyTotals;
  expenseTotals: CurrencyTotals;
  exchangedIn: CurrencyTotals;
  exchangedOut: CurrencyTotals;
  transferredIn: CurrencyTotals;
  transferredOut: CurrencyTotals;
}

export interface WalletBalanceRowInput {
  currencyCode: string;
  initialAmount: number;
  isDeleted: boolean;
}

/**
 * The mobile mirror of the server's wallet summary (ABA-431).
 *
 * The store used to map over its local `wallet_balances` rows, so a currency
 * with no row — and a row is written only by the "set balance" screen — showed
 * no card however much money moved through it. Pass rows INCLUDING the deleted
 * ones: a soft-deleted row is the user having hidden that currency, and
 * `resolveWalletCurrencies` needs to see it to keep it hidden instead of
 * re-deriving it from the movements.
 */
export function buildWalletSummary(
  rows: WalletBalanceRowInput[],
  totals: WalletMovementTotals,
): WalletSummary[] {
  const resolved = resolveWalletCurrencies(rows, [
    ...Object.keys(totals.incomeTotals),
    ...Object.keys(totals.expenseTotals),
    ...Object.keys(totals.exchangedIn),
    ...Object.keys(totals.exchangedOut),
    ...Object.keys(totals.transferredIn),
    ...Object.keys(totals.transferredOut),
  ]);

  return resolved.map((r) => {
    const totalIncomes = totals.incomeTotals[r.currencyCode] || 0;
    const totalExpenses = totals.expenseTotals[r.currencyCode] || 0;
    const totalExchangedIn = totals.exchangedIn[r.currencyCode] || 0;
    const totalExchangedOut = totals.exchangedOut[r.currencyCode] || 0;
    const totalTransferredIn = totals.transferredIn[r.currencyCode] || 0;
    const totalTransferredOut = totals.transferredOut[r.currencyCode] || 0;

    return {
      currencyCode: r.currencyCode as Currency,
      initialAmount: r.initialAmount,
      totalIncomes,
      totalExpenses,
      totalExchangedIn,
      totalExchangedOut,
      totalTransferredIn,
      totalTransferredOut,
      currentBalance:
        r.initialAmount +
        totalIncomes -
        totalExpenses +
        totalExchangedIn -
        totalExchangedOut +
        totalTransferredIn -
        totalTransferredOut,
    };
  });
}
