/**
 * The API cannot import `@budget/shared-utils`, so the deposit-name table lives
 * in two files. This reads both as text and fails if the lists drift.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../../../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function names(source: string): string[] {
  const block = source.match(/DEPOSIT_CATEGORY_NAMES[^=]*=\s*\{([\s\S]*?)\};/);
  if (!block) throw new Error('DEPOSIT_CATEGORY_NAMES table not found');
  return [...block[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map((m) => `${m[1]}=${m[2]}`);
}

describe('deposit category names parity', () => {
  it('API util and shared-utils mirror hold the same table', () => {
    const api = names(read('apps/api/src/common/utils/deposit-category.ts'));
    const mirror = names(read('packages/shared-utils/src/formatting/deposit-category.ts'));
    expect(api).toHaveLength(9);
    expect(mirror).toEqual(api);
  });
});
