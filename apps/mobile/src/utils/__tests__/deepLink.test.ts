import { extractTripInviteCode } from '../deepLink';

describe('extractTripInviteCode', () => {
  it('extracts the code from a trip-invite URL', () => {
    expect(extractTripInviteCode('https://ai-budget.pl/trip-invite/a1b2c3d4')).toBe('a1b2c3d4');
  });

  it('is case-insensitive on hex characters', () => {
    expect(extractTripInviteCode('https://ai-budget.pl/trip-invite/A1B2C3D4')).toBe('A1B2C3D4');
  });

  it('returns null for unrelated URLs', () => {
    expect(extractTripInviteCode('https://ai-budget.pl/blog/pl/budzet-domowy/')).toBeNull();
  });
});
