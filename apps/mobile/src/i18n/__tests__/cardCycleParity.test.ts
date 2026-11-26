/** The API cannot import `@budget/shared-utils`; the card-cycle maths lives in two files. */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const body = (source: string): string => {
  const i = source.indexOf('*/');
  if (i < 0) throw new Error('header comment not found');
  return source.slice(i + 2);
};

describe('card-cycle parity', () => {
  it('API util and shared-utils mirror hold the same rules', () => {
    const api = body(read('apps/api/src/common/utils/card-cycle.ts'));
    const mirror = body(read('packages/shared-utils/src/formatting/card-cycle.ts'));
    expect(api).toContain('currentCycle');
    expect(mirror).toBe(api);
  });
});
