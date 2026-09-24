import {
  validateCategorization,
  normalizeProposalName,
  MAX_NEW_CATEGORIES,
  merchantWords,
  matchByMerchant,
} from './categorize-suggestions.util';

const CATS = [
  { id: 'c-tax', name: 'Tax' },
  { id: 'c-notary', name: 'Kancelaria' },
];

describe('validateCategorization', () => {
  it('maps assignments by name, case-insensitively', () => {
    const r = validateCategorization(
      { assignments: [{ index: 0, categoryName: 'tax' }] },
      2,
      CATS,
    );
    expect(r.assignments.get(0)).toBe('c-tax');
    expect(r.unassigned).toEqual([1]);
  });

  it('drops invented names and out-of-range or non-integer indexes', () => {
    const r = validateCategorization(
      {
        assignments: [
          { index: 0, categoryName: 'Groceries' },
          { index: 7, categoryName: 'Tax' },
          { index: -1, categoryName: 'Tax' },
          { index: 1.5, categoryName: 'Tax' },
          { index: 'x', categoryName: 'Tax' },
        ],
      },
      2,
      CATS,
    );
    expect(r.assignments.size).toBe(0);
    expect(r.unassigned).toEqual([0, 1]);
  });

  it('does not treat Object.prototype keys as category names', () => {
    const r = validateCategorization(
      { assignments: [{ index: 0, categoryName: 'constructor' }] },
      1,
      CATS,
    );
    expect(r.assignments.size).toBe(0);
  });

  it('keeps a proposal covering two or more expenses', () => {
    const r = validateCategorization(
      { newCategories: [{ name: 'Materiały budowlane', indexes: [0, 1, 2] }] },
      3,
      CATS,
    );
    expect(r.proposals).toEqual([{ name: 'Materiały budowlane', indexes: [0, 1, 2] }]);
    expect(r.unassigned).toEqual([]);
  });

  it('drops a single-expense proposal and leaves its expense unassigned', () => {
    const r = validateCategorization(
      { newCategories: [{ name: 'Podróże', indexes: [1] }] },
      2,
      CATS,
    );
    expect(r.proposals).toEqual([]);
    expect(r.unassigned).toEqual([0, 1]);
  });

  it('gives a contested index to the existing-category assignment', () => {
    const r = validateCategorization(
      {
        assignments: [{ index: 0, categoryName: 'Tax' }],
        newCategories: [{ name: 'Fees', indexes: [0, 1] }],
      },
      2,
      CATS,
    );
    expect(r.assignments.get(0)).toBe('c-tax');
    // Only index 1 is left for "Fees", below the two-expense minimum.
    expect(r.proposals).toEqual([]);
    expect(r.unassigned).toEqual([1]);
  });

  it('folds a proposal that names an existing category into that category', () => {
    const r = validateCategorization(
      { newCategories: [{ name: '  kancelaria ', indexes: [0] }] },
      1,
      CATS,
    );
    expect(r.assignments.get(0)).toBe('c-notary');
    expect(r.proposals).toEqual([]);
  });

  it('merges two proposals with the same name', () => {
    const r = validateCategorization(
      {
        newCategories: [
          { name: 'Podróże', indexes: [0] },
          { name: 'podróże', indexes: [1] },
        ],
      },
      2,
      CATS,
    );
    expect(r.proposals).toEqual([{ name: 'Podróże', indexes: [0, 1] }]);
  });

  it(`keeps at most ${MAX_NEW_CATEGORIES} proposals`, () => {
    const newCategories = Array.from({ length: 6 }, (_, i) => ({
      name: `Group ${String.fromCharCode(65 + i)}`,
      indexes: [i * 2, i * 2 + 1],
    }));
    const r = validateCategorization({ newCategories }, 12, CATS);
    expect(r.proposals).toHaveLength(MAX_NEW_CATEGORIES);
    expect(r.unassigned).toEqual([10, 11]);
  });

  it('returns everything unassigned for garbage input', () => {
    expect(validateCategorization(null, 2, CATS).unassigned).toEqual([0, 1]);
    expect(validateCategorization({ assignments: 'x' }, 1, CATS).unassigned).toEqual([0]);
  });
});

describe('normalizeProposalName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeProposalName('  Opłaty   notarialne ')).toBe('Opłaty notarialne');
  });
  it('rejects too short, too long, letterless and non-strings', () => {
    expect(normalizeProposalName('A')).toBeNull();
    expect(normalizeProposalName('x'.repeat(31))).toBeNull();
    expect(normalizeProposalName('123 45')).toBeNull();
    expect(normalizeProposalName(42)).toBeNull();
  });
  it('accepts Cyrillic', () => {
    expect(normalizeProposalName('Стройматериалы')).toBe('Стройматериалы');
  });
});

describe('merchantWords', () => {
  it('lowercases and splits on anything that is not a letter or digit', () => {
    expect(merchantWords('LEROY MERLIN Gdynia')).toEqual(['leroy', 'merlin', 'gdynia']);
    expect(merchantWords('  Kantor - Łódź ')).toEqual(['kantor', 'łódź']);
    expect(merchantWords(null)).toEqual([]);
  });
});

describe('matchByMerchant', () => {
  const groups = [
    { key: 'g-build', merchants: ['Leroy Merlin', 'OBI'] },
    { key: 'g-travel', merchants: ['Bilety Brest', 'Bilety Warszawa'] },
  ];

  it('joins a store variant whose words extend a grouped merchant', () => {
    const r = matchByMerchant([{ id: 'e1', merchant: 'LEROY MERLIN GDYNIA' }], groups);
    expect(r.get('e1')).toBe('g-build');
  });

  it('matches the same merchant regardless of case and spacing', () => {
    expect(matchByMerchant([{ id: 'e1', merchant: ' obi ' }], groups).get('e1')).toBe('g-build');
  });

  it('does not extend a one-word merchant into a different service', () => {
    const r = matchByMerchant(
      [{ id: 'e1', merchant: 'Uber Eats' }, { id: 'e2', merchant: 'OBI Gdańsk' }],
      [{ key: 'g-transport', merchants: ['Uber'] }, { key: 'g-build', merchants: ['OBI'] }],
    );
    expect(r.size).toBe(0);
  });

  it('does not match merchants that only share a first word', () => {
    // "Bilety Kraków" shares only "bilety" with the travel rows — neither word list is a prefix of the other.
    expect(matchByMerchant([{ id: 'e1', merchant: 'Bilety Kraków' }], groups).size).toBe(0);
  });

  it('skips a merchant that would match more than one group', () => {
    const ambiguous = [
      { key: 'a', merchants: ['Leroy Merlin'] },
      { key: 'b', merchants: ['Leroy Merlin Oliwa'] },
    ];
    expect(matchByMerchant([{ id: 'e1', merchant: 'Leroy Merlin' }], ambiguous).size).toBe(0);
  });

  it('ignores expenses with no merchant and merchants shorter than three letters', () => {
    const r = matchByMerchant(
      [{ id: 'e1', merchant: null }, { id: 'e2', merchant: 'AB' }],
      [{ key: 'g', merchants: ['AB Foods', null] }],
    );
    expect(r.size).toBe(0);
  });
});
