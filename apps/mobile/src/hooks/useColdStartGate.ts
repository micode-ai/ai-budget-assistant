import { useMemo } from 'react';

export interface ColdStartGateInputs {
  isInitializing: boolean;
  isAuthenticated: boolean;
  fontsLoaded: boolean;
}

/**
 * Pure predicate for the shared "app is fully ready" gate used by both the
 * cold-start notification deep-link flush and the trip-invite deep-link
 * flush in `app/_layout.tsx`. Both must navigate the SAME instant — not
 * before the nav tree is mounted (still `isInitializing`) and not before
 * fonts have loaded (the `<Stack>` doesn't render until then) — see the
 * "keep the two deep-link paths gated symmetrically" invariant in CLAUDE.md.
 */
export function computeColdStartGate({
  isInitializing,
  isAuthenticated,
  fontsLoaded,
}: ColdStartGateInputs): boolean {
  return !isInitializing && isAuthenticated && fontsLoaded;
}

/**
 * Thin hook wrapper around `computeColdStartGate` so consumers get a single
 * memoized boolean instead of each re-deriving the same expression.
 */
export function useColdStartGate(inputs: ColdStartGateInputs): boolean {
  const { isInitializing, isAuthenticated, fontsLoaded } = inputs;
  return useMemo(
    () => computeColdStartGate({ isInitializing, isAuthenticated, fontsLoaded }),
    [isInitializing, isAuthenticated, fontsLoaded],
  );
}
