/**
 * API-local copy of the pure safe-to-spend formula.
 *
 * The SAME function is exported from `@budget/shared-utils` (formatting) for the
 * mobile offline fallback. The API must NOT import it from the `@budget/shared-utils`
 * package root at runtime: the prod ESM runtime resolves the package barrel
 * (`shared-utils/src/index.ts` → `export * from './validation'`) and throws
 * `ERR_UNSUPPORTED_DIR_IMPORT` on the directory re-export, crash-looping the API.
 * This mirrors the `budget-period.util.ts` precedent (ABA-171).
 *
 * Keep this copy and the `shared-utils` copy in sync — do NOT add a third copy.
 */

export interface SafeToSpendInputs {
  /** Σ wallet current balances, already converted to base currency */
  walletBalance: number;
  /** Expected income before horizon, 0 when not inferred */
  expectedIncome: number;
  /** Σ upcoming active subscriptions due ≤ horizon, converted */
  upcomingSubscriptions: number;
  /** Σ upcoming recurring expenses due ≤ horizon, converted */
  upcomingRecurring: number;
  /** Σ on-track goal contributions due before horizon, converted */
  goalContributions: number;
  /** Safety buffer (default 0 for v1) */
  buffer: number;
  /** Days remaining until horizon (inclusive, min 1) */
  daysRemaining: number;
}

export interface SafeToSpendResult {
  projectedObligations: number;
  projectedAvailable: number;
  /** max(0, (projectedAvailable - buffer) / daysRemaining) */
  safeToSpendToday: number;
}

/**
 * Pure deterministic safe-to-spend formula.
 * All monetary inputs MUST already be converted to the same base currency.
 */
export function computeSafeToSpend(inputs: SafeToSpendInputs): SafeToSpendResult {
  const {
    walletBalance,
    expectedIncome,
    upcomingSubscriptions,
    upcomingRecurring,
    goalContributions,
    buffer,
    daysRemaining,
  } = inputs;

  const projectedObligations =
    Math.max(0, upcomingSubscriptions) +
    Math.max(0, upcomingRecurring) +
    Math.max(0, goalContributions);

  const projectedAvailable =
    walletBalance + Math.max(0, expectedIncome) - projectedObligations;

  const safeDays = Math.max(1, daysRemaining);
  const safeToSpendToday = Math.max(0, (projectedAvailable - buffer) / safeDays);

  return {
    projectedObligations: Math.round(projectedObligations * 100) / 100,
    projectedAvailable: Math.round(projectedAvailable * 100) / 100,
    safeToSpendToday: Math.round(safeToSpendToday * 100) / 100,
  };
}
