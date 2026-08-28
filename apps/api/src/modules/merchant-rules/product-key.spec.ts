import { normalizeProductName } from './product-rules.service';

/**
 * Every pair below is two readings of the SAME line, taken from two scans of
 * one Biedronka receipt on consecutive days (expenses 19640134… and f1e6df4c…).
 * Under the old `name.trim().toLowerCase()` key they hashed differently, so the
 * learned rule never matched, the model re-decided, and a second contradictory
 * rule was written beside the first: that one receipt taught 22 rules on day
 * one and 33 more on day two without a single key in common.
 */
describe('normalizeProductName', () => {
  const same = (a: string, b: string) => expect(normalizeProductName(a)).toBe(normalizeProductName(b));

  it('ignores a diacritic the OCR dropped', () => {
    // ł is the one Polish letter NFD will not decompose, and it is the one that
    // actually varied between the two scans.
    same('MasłExtraMIDol200g', 'MaslExtraMIDol200g');
    same('Woda Gaz Żyw 1,75l', 'Woda Gaz Zyw 1,75l');
    same('KołdunyLitewskie450g', 'KoldunyLitewskie450g');
  });

  it('ignores where the receipt printer put its spaces', () => {
    same('BatLetheAAA8szt', 'Bat Lethe AAA 8 szt');
    same('BurakiGotowane500 g', 'BurakiGotowane500g');
    same('Par  Z Szynki 250g', 'Par Z Szynki 250g');
  });

  it('ignores case and surrounding whitespace', () => {
    same('  chust Dada 3x72szt', 'CHUST DADA 3X72SZT');
  });

  it('treats a comma and a dot decimal as the same number', () => {
    same('Nap CocCola1,75l', 'Nap CocCola1.75l');
  });

  it('still tells different products apart', () => {
    const keys = [
      'PiwoŻywiec0,5lPusz',
      'PiwoŻywiec1,5lPusz',
      'PiwoCarlsberg 0,5l',
      'ZupaInstKurczak60g',
      'ZupaInstKurczCurr60g',
    ].map(normalizeProductName);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns an empty key for input that carries no product name', () => {
    for (const blank of ['', '   ', '---', ',.']) {
      expect(normalizeProductName(blank)).toBe('');
    }
  });
});
