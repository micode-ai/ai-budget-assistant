export interface FirstRunInputs {
  /** The shared "app is fully ready" gate — see useColdStartGate. */
  gateOpen: boolean;
  /** Device-local: has this install already shown the screen? */
  seen: boolean;
  /** Authoritative count from SQLite, NOT the in-memory stores. */
  hasTransactions: boolean;
  /** A viewer cannot create a transaction, so has nothing to be onboarded to. */
  canEdit: boolean;
}

/**
 * Whether to send the user to the first-run screen.
 *
 * Pure so the decision can be tested without a navigator, mirroring
 * `computeColdStartGate`, which this deliberately composes with rather than
 * re-deriving.
 */
export function shouldShowFirstRun({
  gateOpen,
  seen,
  hasTransactions,
  canEdit,
}: FirstRunInputs): boolean {
  return gateOpen && !seen && !hasTransactions && canEdit;
}
