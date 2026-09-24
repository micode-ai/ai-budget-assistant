/**
 * Wraps a request so callers that arrive while it is still running share it
 * instead of starting another. Once it settles — success or failure — the next
 * call starts fresh, so Retry still retries.
 *
 * Exists because the review screen can mount twice on web in quick succession,
 * and each categorize request may spend one of the account's daily AI passes.
 */
export function shareInFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = fn().finally(() => {
        pending = null;
      });
    }
    return pending;
  };
}
