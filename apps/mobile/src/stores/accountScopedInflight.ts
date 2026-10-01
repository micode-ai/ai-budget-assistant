/**
 * Coalesces concurrent calls to an account-scoped load — but only calls for
 * the SAME account.
 *
 * The plain `if (inflight) return inflight` guard the loaders used to have was
 * account-blind: switch accounts while a load for the previous account was
 * still running and the new account's load was handed the OLD promise. That
 * run then hit its own "account switched" guard and returned without writing
 * anything, so the new account was never loaded at all and the screen kept
 * the previous account's figures until some later reload.
 *
 * A call for a different account is chained AFTER the running one instead of
 * joining it, so the last-started run is also the last to write.
 */
export function createAccountScopedInflight() {
  let inflight: Promise<void> | null = null;
  let inflightAccountId: string | null = null;

  return (accountId: string | null, run: () => Promise<void>): Promise<void> => {
    if (inflight && inflightAccountId === accountId) return inflight;

    const prev = inflight;
    const p = (prev ? prev.catch(() => undefined) : Promise.resolve()).then(run);
    inflight = p;
    inflightAccountId = accountId;
    const clear = () => {
      if (inflight === p) {
        inflight = null;
        inflightAccountId = null;
      }
    };
    p.then(clear, clear);
    return p;
  };
}
