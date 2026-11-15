/**
 * The API cannot import `@budget/shared-utils`, so the cash-flow date rules
 * (subscription renewals, recurring due dates, monthly income cadence) live in
 * two files. Fails if the bodies (everything after the header comment) drift.
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

describe('cash-flow dates parity', () => {
  it('API util and shared-utils mirror hold the same rules', () => {
    const api = body(read('apps/api/src/common/utils/cash-flow-dates.ts'));
    const mirror = body(read('packages/shared-utils/src/formatting/cash-flow-dates.ts'));
    expect(api).toContain('detectMonthlyIncomeSeries');
    expect(mirror).toBe(api);
  });
});
