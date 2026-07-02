import { buildCanonicalNameFallback } from './ocr.service';

describe('buildCanonicalNameFallback', () => {
  it('preserves size discriminators: fat% and volume (original token order)', () => {
    expect(buildCanonicalNameFallback('MLEKO 3,2% ŁACIATE 1L')).toBe('MLEKO 3,2% ŁACIATE 1L');
  });

  it('preserves weight and skips purely numeric prefix', () => {
    expect(buildCanonicalNameFallback('123 CHLEB 500G')).toBe('CHLEB 500G');
  });

  it('skips tokens shorter than 3 chars (unless size token)', () => {
    expect(buildCanonicalNameFallback('AB MLEKO')).toBe('MLEKO');
  });

  it('returns null when no suitable token exists', () => {
    expect(buildCanonicalNameFallback('12 AB')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(buildCanonicalNameFallback('')).toBeNull();
  });

  it('strips pack quantity (6SZT) but keeps per-unit volume (1L)', () => {
    expect(buildCanonicalNameFallback('MLEKO ŁACIATE 1L 6SZT')).toBe('MLEKO ŁACIATE 1L');
  });

  it('extracts per-unit size from multiplier+size token (4X130G → 130G)', () => {
    expect(buildCanonicalNameFallback('SERK DANIO TRUSKAWKOWY 4X130G')).toBe('SERK DANIO TRUSKAWKOWY 130G');
  });

  it('extracts per-unit size from × multiplier (6x0,5L)', () => {
    expect(buildCanonicalNameFallback('PIWO TYSKIE 6x0,5L')).toBe('PIWO TYSKIE 0,5L');
  });

  it('keeps alcohol and volume for beer/wine', () => {
    expect(buildCanonicalNameFallback('PIWO TYSKIE 0,5L 4,7%')).toBe('PIWO TYSKIE 0,5L 4,7%');
  });

  it('caps at 3 text tokens but includes all size tokens', () => {
    expect(buildCanonicalNameFallback('JOGURT ACTIVIA TRUSKAWKOWY BRZOSKWINIA 150G')).toBe('JOGURT ACTIVIA TRUSKAWKOWY 150G');
  });

  it('handles 1L (2-char) size token that was previously filtered by length check', () => {
    expect(buildCanonicalNameFallback('SOK JABŁKOWY 1L')).toBe('SOK JABŁKOWY 1L');
  });

  it('filters bare multiplier without unit (4X alone)', () => {
    expect(buildCanonicalNameFallback('BATONIK SNICKERS 4X')).toBe('BATONIK SNICKERS');
  });
});
