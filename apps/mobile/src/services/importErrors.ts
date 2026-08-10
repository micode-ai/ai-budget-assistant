/**
 * The import endpoints answer with typed error bodies — notably a 403
 * `{ code: 'TIER_REQUIRED', requiredTier }` for PDF extraction on a free
 * account. The raw fetch helpers used to collapse every failure into
 * `new Error(message)`, which made those bodies unreadable and the paywall
 * unreachable. This carries them through.
 */
export class ImportRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requiredTier?: 'pro' | 'business',
  ) {
    super(message);
    this.name = 'ImportRequestError';
  }
}

export function isTierRequiredError(e: unknown): e is ImportRequestError {
  return e instanceof ImportRequestError && e.status === 403 && e.code === 'TIER_REQUIRED';
}
