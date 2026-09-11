import { normalizeProductName } from '@budget/shared-utils';

/**
 * Parity check against the API's canonical copy's own test file
 * (`apps/api/src/modules/merchant-rules/product-key.spec.ts`) — the two
 * `normalizeProductName` implementations must stay byte-identical, so this
 * mirrors those exact cases rather than inventing new ones. See that file's
 * doc comment for where each example came from.
 */
describe('normalizeProductName (shared-utils mirror)', () => {
  const same = (a: string, b: string) => expect(normalizeProductName(a)).toBe(normalizeProductName(b));

  it('ignores a diacritic the OCR dropped', () => {
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
