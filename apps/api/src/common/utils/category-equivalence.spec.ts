import { findEquivalentCategory, normalizeCategoryName } from './category-equivalence';

const cat = (name: string) => ({ id: `id-${name}`, name });

describe('normalizeCategoryName', () => {
  it('trims, collapses spaces and lower-cases', () => {
    expect(normalizeCategoryName('  Zakupy   SPOŻYWCZE ')).toBe('zakupy spożywcze');
  });
  it('normalizes to NFC', () => {
    expect(normalizeCategoryName('Spȯżywcze')).toBe(normalizeCategoryName('Spȯżywcze'.normalize('NFC')));
    expect(normalizeCategoryName('é')).toBe('é');
  });
});

describe('findEquivalentCategory', () => {
  it('matches a translated default name', () => {
    const groceries = cat('Groceries');
    expect(findEquivalentCategory('Zakupy spożywcze', [cat('Transport'), groceries])).toBe(groceries);
    expect(findEquivalentCategory('Продукты', [groceries])).toBe(groceries);
  });

  it('matches deposit names across languages', () => {
    const kaucja = cat('Kaucja');
    expect(findEquivalentCategory('Deposit', [kaucja])).toBe(kaucja);
    expect(findEquivalentCategory('Залог за тару', [kaucja])).toBe(kaucja);
  });

  it('matches ignoring case and surrounding spaces', () => {
    const groceries = cat('Groceries');
    expect(findEquivalentCategory(' groceries ', [groceries])).toBe(groceries);
  });

  it('matches equal custom names', () => {
    const c = cat('Hobby');
    expect(findEquivalentCategory('hobby', [c])).toBe(c);
  });

  it('never matches by substring', () => {
    expect(findEquivalentCategory('Car', [cat('Car wash')])).toBeNull();
    expect(findEquivalentCategory('Dom', [cat('Domestic')])).toBeNull();
  });

  it('does not treat semantic overlap as equivalence', () => {
    expect(findEquivalentCategory('Pieczywo', [cat('Groceries')])).toBeNull();
  });

  it('returns null for an empty candidate', () => {
    expect(findEquivalentCategory('  ', [cat('Groceries')])).toBeNull();
  });
});
