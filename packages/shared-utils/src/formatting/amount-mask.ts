/**
 * Privacy-mode mask (privacy-mode-hide-amounts). One module-level switch read by
 * `formatCurrency` / `formatCompactCurrency`, so every money render that goes
 * through the shared formatter is masked in one place. The app flips it from
 * `privacyStore`; the API never sets it, so server output is unaffected.
 */
export const AMOUNT_MASK = '••••';

let masked = false;

export function setAmountMask(on: boolean): void {
  masked = on;
}

export function isAmountMasked(): boolean {
  return masked;
}

/** Run `fn` with the mask lifted (exports, share images, anything that must carry real figures). */
export function withAmountsRevealed<T>(fn: () => T): T {
  const prev = masked;
  masked = false;
  try {
    return fn();
  } finally {
    masked = prev;
  }
}
