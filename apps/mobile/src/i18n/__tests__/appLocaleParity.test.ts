/**
 * The API cannot import `@budget/shared-utils`, so the app-locale resolver lives
 * in two files. Fails if the bodies (everything after the header comment) drift.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const body = (source: string): string => {
  const i = source.indexOf('*/');
  if (i < 0) throw new Error('header comment not found');
  return source.slice(i + 2);
};

describe('app-locale parity', () => {
  it('API util and shared-utils mirror hold the same resolver', () => {
    const api = body(read('apps/api/src/common/utils/app-locale.ts'));
    const mirror = body(read('packages/shared-utils/src/formatting/app-locale.ts'));
    expect(api).toContain('resolveAppLocale');
    expect(mirror).toBe(api);
  });
});
