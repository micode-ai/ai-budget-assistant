import { headerFingerprint } from './header-fingerprint';

describe('headerFingerprint', () => {
  it('returns a 64-char hex string', () => {
    expect(headerFingerprint(['Data', 'Kwota'])).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable across order, case, and whitespace', () => {
    const a = headerFingerprint(['Data operacji', 'Kwota', 'Opis']);
    const b = headerFingerprint(['  KWOTA ', 'opis', 'data operacji']);
    expect(a).toBe(b);
  });

  it('differs for different header sets', () => {
    expect(headerFingerprint(['A', 'B'])).not.toBe(headerFingerprint(['A', 'B', 'C']));
  });

  it('ignores empty headers', () => {
    expect(headerFingerprint(['Data', '', 'Kwota'])).toBe(headerFingerprint(['Data', 'Kwota']));
  });
});
