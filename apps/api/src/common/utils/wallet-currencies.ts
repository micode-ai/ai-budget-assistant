/**
 * Which currencies the wallet should show for an account.
 *
 * The wallet used to render exactly one card per `wallet_balances` row, so a
 * currency the user had never explicitly set an initial balance for stayed
 * invisible no matter how much income, spend, exchange or transfer volume it
 * carried (ABA-431: a shared account held 124 484 USD of income and showed
 * only its PLN card). A `wallet_balances` row is written solely by the
 * "set balance" screen, so for most accounts most currencies had no row.
 *
 * NOTE: this file is a deliberately duplicated pair with
 * `packages/shared-utils/src/formatting/wallet-currencies.ts` — the API has no
 * build step for workspace packages and must not import `@budget/shared-utils`
 * at runtime (see the check-no-shared-utils-runtime-import.sh deploy guard),
 * while the mobile app computes its own wallet summary locally and needs the
 * same answer. Same rule table on both sides — change one, change the other.
 */

export interface WalletCurrencyRow {
  currencyCode: string;
  isDeleted: boolean;
  initialAmount: number;
}

export interface ResolvedWalletCurrency {
  currencyCode: string;
  initialAmount: number;
  /** No `wallet_balances` row backs this currency yet — it came from the movements alone. */
  derived: boolean;
}

export function resolveWalletCurrencies(
  rows: WalletCurrencyRow[],
  currenciesWithMovements: Iterable<string>,
): ResolvedWalletCurrency[] {
  const resolved = new Map<string, ResolvedWalletCurrency>();
  // Every row counts as "known", deleted ones included: a soft-deleted row is
  // the user having hidden that currency, and hiding has to survive the next
  // transaction in it. That is the whole reason a currency is not re-derived
  // from movements when a row already exists.
  const known = new Set<string>();

  for (const row of rows) {
    known.add(row.currencyCode);
    if (row.isDeleted) continue;
    resolved.set(row.currencyCode, {
      currencyCode: row.currencyCode,
      initialAmount: row.initialAmount,
      derived: false,
    });
  }

  for (const code of currenciesWithMovements) {
    if (!code || !code.trim() || known.has(code)) continue;
    resolved.set(code, { currencyCode: code, initialAmount: 0, derived: true });
  }

  return [...resolved.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}
