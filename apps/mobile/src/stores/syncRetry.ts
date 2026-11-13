/**
 * Whether a failed push is worth trying again on the next sync (ABA-749, ABA-754):
 * no response at all (offline), a timeout, a rate limit or a server error. Any
 * other 4xx is the server refusing this row for good — no retry would change it.
 * Shared by the expense and income retry paths so both decide alike.
 */
export function isRetriableSyncError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return true;
  return status >= 500 || status === 408 || status === 429;
}
