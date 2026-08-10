import { ImportRequestError, isTierRequiredError } from '../importErrors';

describe('ImportRequestError', () => {
  it('carries status, code and requiredTier', () => {
    const e = new ImportRequestError('nope', 403, 'TIER_REQUIRED', 'pro');
    expect(e.message).toBe('nope');
    expect(e.status).toBe(403);
    expect(e.code).toBe('TIER_REQUIRED');
    expect(e.requiredTier).toBe('pro');
    expect(e instanceof Error).toBe(true);
  });
});

describe('isTierRequiredError', () => {
  it('accepts a 403 with the TIER_REQUIRED code', () => {
    expect(isTierRequiredError(new ImportRequestError('x', 403, 'TIER_REQUIRED', 'pro'))).toBe(true);
  });

  it('rejects a 403 without the code', () => {
    expect(isTierRequiredError(new ImportRequestError('x', 403))).toBe(false);
  });

  it('rejects the right code on the wrong status', () => {
    expect(isTierRequiredError(new ImportRequestError('x', 400, 'TIER_REQUIRED'))).toBe(false);
  });

  it('rejects a plain Error and a non-error', () => {
    expect(isTierRequiredError(new Error('x'))).toBe(false);
    expect(isTierRequiredError('x')).toBe(false);
    expect(isTierRequiredError(null)).toBe(false);
  });
});
