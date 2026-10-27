/**
 * The API cannot import `@budget/shared-utils`, so the keyed category catalog
 * lives in two files. This reads both as text and fails if the bodies drift
 * (everything from `export type CatalogLocale` on; the headers differ).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../../../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const body = (source: string): string => {
  const i = source.indexOf('export type CatalogLocale');
  if (i < 0) throw new Error('catalog body not found');
  return source.slice(i);
};

describe('category catalog parity', () => {
  it('API util and shared-utils mirror hold the same catalog', () => {
    const api = body(read('apps/api/src/common/utils/category-catalog.ts'));
    const mirror = body(read('packages/shared-utils/src/formatting/category-catalog.ts'));
    expect(api).toContain('CATEGORY_CATALOG');
    expect(mirror).toBe(api);
  });
});
