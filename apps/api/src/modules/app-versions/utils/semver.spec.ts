import { compareSemver, isSemver } from './semver';

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns negative when a < b', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.1.0')).toBeLessThan(0);
    expect(compareSemver('1.9.0', '1.10.0')).toBeLessThan(0); // numeric, not lexical
    expect(compareSemver('0.9.9', '1.0.0')).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('throws on malformed input', () => {
    expect(() => compareSemver('1.0', '1.0.0')).toThrow();
    expect(() => compareSemver('foo', '1.0.0')).toThrow();
    expect(() => compareSemver('1.0.0-beta', '1.0.0')).toThrow();
  });
});

describe('isSemver', () => {
  it('returns true for valid x.y.z strings', () => {
    expect(isSemver('1.0.0')).toBe(true);
    expect(isSemver('10.20.30')).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isSemver('1.0')).toBe(false);
    expect(isSemver('1.0.0-beta')).toBe(false);
    expect(isSemver('v1.0.0')).toBe(false);
    expect(isSemver('')).toBe(false);
  });
});
