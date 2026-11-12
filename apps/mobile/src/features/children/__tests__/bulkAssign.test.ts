import type { AttributionMode } from '@budget/shared-utils';
import { planBulkAssign } from '../bulkAssign';

describe('planBulkAssign', () => {
  const modes: Record<string, AttributionMode> = { a: 'none', b: 'lines', c: 'whole', d: 'lines' };
  const modeOf = (id: string): AttributionMode => modes[id] ?? 'none';

  it("planBulkAssign skips 'lines' expenses and counts them", () => {
    expect(planBulkAssign(['a', 'b', 'c', 'd'], modeOf)).toEqual({ assign: ['a', 'c'], skipped: 2 });
  });

  it('keeps the selection order and assigns whole and unattributed expenses', () => {
    expect(planBulkAssign(['c', 'a'], modeOf)).toEqual({ assign: ['c', 'a'], skipped: 0 });
  });

  it('dedupes a repeated id', () => {
    expect(planBulkAssign(['a', 'a', 'b', 'b'], modeOf)).toEqual({ assign: ['a'], skipped: 1 });
  });

  it('returns an empty plan for an empty selection', () => {
    expect(planBulkAssign([], modeOf)).toEqual({ assign: [], skipped: 0 });
  });
});
