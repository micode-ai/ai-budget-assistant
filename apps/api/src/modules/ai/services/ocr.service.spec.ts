import { buildCanonicalNameFallback } from './ocr.service';

describe('buildCanonicalNameFallback', () => {
  it('returns first word >= 3 chars that is not purely numeric', () => {
    expect(buildCanonicalNameFallback('MLEKO 3,2% ŁACIATE 1L')).toBe('MLEKO');
  });

  it('skips purely numeric tokens', () => {
    expect(buildCanonicalNameFallback('123 CHLEB 500G')).toBe('CHLEB');
  });

  it('skips tokens shorter than 3 chars', () => {
    expect(buildCanonicalNameFallback('AB MLEKO')).toBe('MLEKO');
  });

  it('returns null when no suitable token exists', () => {
    expect(buildCanonicalNameFallback('12 AB')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(buildCanonicalNameFallback('')).toBeNull();
  });
});
