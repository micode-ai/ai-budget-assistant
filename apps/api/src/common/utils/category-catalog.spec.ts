import { readFileSync } from 'fs';
import { join } from 'path';
import { getDefaultCategories } from '../../modules/accounts/default-categories';
import { DEPOSIT_CATEGORY_NAMES } from './deposit-category';
import {
  CATEGORY_CATALOG,
  catalogEntry,
  catalogKeyForName,
  catalogName,
  type CatalogLocale,
} from './category-catalog';

const LOCALES: CatalogLocale[] = ['en', 'de', 'es', 'fr', 'pl', 'ru', 'ua', 'be', 'nl'];
const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

describe('category catalog', () => {
  it('every entry has all nine non-empty names', () => {
    for (const e of CATEGORY_CATALOG) {
      for (const l of LOCALES) {
        expect(typeof e.names[l]).toBe('string');
        expect(e.names[l].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keys are unique per type', () => {
    const seen = new Set(CATEGORY_CATALOG.map((e) => `${e.type}:${e.key}`));
    expect(seen.size).toBe(CATEGORY_CATALOG.length);
  });

  it('no (type, normalized name) maps to two keys', () => {
    const seen = new Map<string, string>();
    for (const e of CATEGORY_CATALOG) {
      for (const l of LOCALES) {
        const id = `${e.type}:${norm(e.names[l])}`;
        const prev = seen.get(id);
        if (prev !== undefined) expect({ id, key: e.key }).toEqual({ id, key: prev });
        seen.set(id, e.key);
      }
    }
    for (const [id, key] of seen) {
      const [type, ...rest] = id.split(':');
      expect(catalogKeyForName(rest.join(':'), type as 'expense' | 'income')).toBe(key);
    }
  });

  it('getDefaultCategories output is unchanged for every locale', () => {
    const snap = JSON.parse(readFileSync(join(__dirname, 'category-catalog.snapshot.json'), 'utf8'));
    for (const l of LOCALES) expect(getDefaultCategories(l)).toEqual(snap[l]);
    expect(getDefaultCategories('xx')).toEqual(snap.en);
  });

  it('matches names to keys, scoped by type', () => {
    expect(catalogKeyForName('Zakupy spożywcze', 'expense')).toBe('groceries');
    expect(catalogKeyForName('Health & Fitness', 'expense')).toBe('health');
    expect(catalogKeyForName(' groceries ', 'expense')).toBe('groceries');
    expect(catalogKeyForName('Groceries', 'income')).toBeNull();
    expect(catalogKeyForName('Gifts', 'income')).toBe('gifts');
    expect(catalogKeyForName('Gifts', 'expense')).toBe('gifts');
    expect(catalogEntry('gifts', 'income')).not.toBe(catalogEntry('gifts', 'expense'));
    expect(catalogEntry('gifts', 'income')?.type).toBe('income');
    expect(catalogEntry('gifts', 'expense')?.type).toBe('expense');
  });

  it('catalogName falls back to en for an unknown locale and null for an unknown key', () => {
    expect(catalogName('groceries', 'expense', 'pl')).toBe('Zakupy spożywcze');
    expect(catalogName('groceries', 'expense', 'xx')).toBe('Groceries');
    expect(catalogName('nope', 'expense', 'en')).toBeNull();
  });

  it('deposit names equal DEPOSIT_CATEGORY_NAMES and the deposit is not seeded', () => {
    const d = catalogEntry('deposit', 'expense');
    expect(d?.names).toEqual(DEPOSIT_CATEGORY_NAMES);
    expect(d?.seeded).toBe(false);
  });

  it('seeded flags: only the entries default-categories seeds today', () => {
    const seeded = CATEGORY_CATALOG.filter((e) => e.seeded).map((e) => `${e.type}:${e.key}`);
    expect(seeded).toHaveLength(17);
    for (const k of ['coffeeAndDrinks', 'personalCare']) expect(catalogEntry(k, 'expense')?.seeded).toBe(false);
    for (const k of ['investments', 'gifts', 'otherIncome']) expect(catalogEntry(k, 'income')?.seeded).toBe(false);
  });
});
