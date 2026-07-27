import { parseCanonicalNameMap } from './canonical-name-parse.util';

describe('parseCanonicalNameMap', () => {
  it('maps 1-based keys to names', () => {
    const m = parseCanonicalNameMap('{"1":"Mleko Łaciate 3.2%","2":"Heinz Ketchup"}', 2);
    expect(m.get(1)).toBe('Mleko Łaciate 3.2%');
    expect(m.get(2)).toBe('Heinz Ketchup');
    expect(m.size).toBe(2);
  });

  /**
   * The whole point of the rewrite. The old contract matched names to inputs by
   * POSITION after dropping blank lines, so a single omitted entry shifted every
   * later name onto the wrong product — silently, and into the price history that
   * three other features read. With keys, an omission stays an omission.
   */
  it('a missing entry does NOT shift the others onto the wrong product', () => {
    const m = parseCanonicalNameMap('{"1":"Piwo Tyskie","3":"Ser Camembert"}', 3);
    expect(m.get(1)).toBe('Piwo Tyskie');
    expect(m.has(2)).toBe(false);       // a known miss…
    expect(m.get(3)).toBe('Ser Camembert'); // …and #3 still gets ITS OWN name
  });

  it('accepts a wrapper key, which a model told to answer in JSON often adds', () => {
    const m = parseCanonicalNameMap('{"names":{"1":"Masło Extra"}}', 1);
    expect(m.get(1)).toBe('Masło Extra');
  });

  it('recovers from a fenced code block or leading prose', () => {
    const m = parseCanonicalNameMap('Here you go:\n```json\n{"1":"Czereśnie"}\n```', 1);
    expect(m.get(1)).toBe('Czereśnie');
  });

  it('drops keys outside the batch range instead of trusting them', () => {
    const m = parseCanonicalNameMap('{"0":"Zero","1":"Ok","2":"Two","99":"Nope"}', 2);
    expect(m.get(1)).toBe('Ok');
    expect(m.get(2)).toBe('Two');
    expect(m.has(0)).toBe(false);
    expect(m.has(99)).toBe(false);
    expect(m.size).toBe(2);
  });

  it('ignores blank and non-string values rather than storing junk', () => {
    const m = parseCanonicalNameMap('{"1":"   ","2":null,"3":42,"4":"Real Name"}', 4);
    expect(m.size).toBe(1);
    expect(m.get(4)).toBe('Real Name');
  });

  it('trims whitespace around a name', () => {
    expect(parseCanonicalNameMap('{"1":"  Malina Polska  "}', 1).get(1)).toBe('Malina Polska');
  });

  it('returns empty on malformed JSON rather than throwing', () => {
    expect(parseCanonicalNameMap('not json at all', 3).size).toBe(0);
    expect(parseCanonicalNameMap('{"1":', 3).size).toBe(0);
  });

  it('returns empty for an array, an empty reply, or a zero-length batch', () => {
    expect(parseCanonicalNameMap('["Piwo","Ser"]', 2).size).toBe(0);
    expect(parseCanonicalNameMap('', 2).size).toBe(0);
    expect(parseCanonicalNameMap('{"1":"Piwo"}', 0).size).toBe(0);
  });
});
