import { IMPORT_ENTRIES, importSourceLabel } from '../importEntries';

describe('IMPORT_ENTRIES', () => {
  // This is the regression this file exists for. The hub forwards entry.id as
  // `bankId`, and an explicit bankId short-circuits the server's parser
  // resolution — so the AI path, which lives behind `if (!parser)`, is
  // reachable only from an entry that sends no id at all. Give this entry an
  // id and the whole AI import silently becomes unreachable from the app.
  it('has exactly one entry with no id — the auto-detect row that reaches the AI path', () => {
    const idless = IMPORT_ENTRIES.filter((e) => e.id === undefined);
    expect(idless).toHaveLength(1);
  });

  it('puts the auto-detect entry first, so it is what a user reaches for', () => {
    expect(IMPORT_ENTRIES[0].id).toBeUndefined();
  });

  it('labels the auto-detect entry from i18n and every bank by brand name', () => {
    const [auto, ...banks] = IMPORT_ENTRIES;
    expect(auto.labelKey).toBe('bankImport.autoDetect');
    expect(auto.label).toBeUndefined();

    for (const b of banks) {
      expect(typeof b.id).toBe('string');
      expect(typeof b.label).toBe('string');
      expect(b.labelKey).toBeUndefined();
    }
  });

  it('gives the auto-detect entry an icon that does not read as a bank', () => {
    expect(IMPORT_ENTRIES[0].icon).toBe('sparkles-outline');
    expect(IMPORT_ENTRIES.slice(1).every((e) => e.icon === 'business-outline')).toBe(true);
  });

  it('has no duplicate ids', () => {
    const ids = IMPORT_ENTRIES.map((e) => e.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('importSourceLabel', () => {
  it('maps a bank source to its brand label', () => {
    expect(importSourceLabel('bank:mbank')).toBe('mBank');
    expect(importSourceLabel('bank:pko')).toBe('PKO BP');
  });

  it('handles Wise, which is not a bank: source', () => {
    expect(importSourceLabel('wise')).toBe('Wise');
  });

  it('falls back to the raw id for a parser with no entry — e.g. the ai PDF parser', () => {
    expect(importSourceLabel('bank:ai')).toBe('ai');
    expect(importSourceLabel('bank:santander')).toBe('santander');
  });

  it('passes through an unrecognised source unchanged', () => {
    expect(importSourceLabel('manual')).toBe('manual');
  });
});
