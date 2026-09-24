/**
 * Wraps a request so callers that arrive with the same key while it is still
 * running share it instead of starting another. Once it settles — success or
 * failure — the next call starts fresh, so Retry still retries.
 *
 * Keyed (by account id, at the call site) so a request started for one account
 * is never handed to a screen that has since switched to another.
 *
 * Exists because the review screen can mount twice on web in quick succession,
 * and each categorize request may spend one of the account's daily AI passes.
 */
export function shareInFlight<T>(fn: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const pending = new Map<string, Promise<T>>();
  return (key) => {
    let request = pending.get(key);
    if (!request) {
      request = fn(key).finally(() => {
        pending.delete(key);
      });
      pending.set(key, request);
    }
    return request;
  };
}
