import { tokenVersionMatches } from './token-version.util';

describe('tokenVersionMatches (ABA-809)', () => {
  it('accepts a token issued at the current version', () => {
    expect(tokenVersionMatches({ tv: 3 }, { tokenVersion: 3 })).toBe(true);
  });

  it('rejects a token issued before a password reset or e-mail change bumped the version', () => {
    expect(tokenVersionMatches({ tv: 2 }, { tokenVersion: 3 })).toBe(false);
  });

  it('treats a token from before ABA-809 (no tv) as version 0, so existing sessions survive the deploy', () => {
    expect(tokenVersionMatches({}, { tokenVersion: 0 })).toBe(true);
    expect(tokenVersionMatches({}, { tokenVersion: 1 })).toBe(false);
  });
});
