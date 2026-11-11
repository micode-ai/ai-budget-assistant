import type { LeafletResult } from '@budget/shared-types';
import { reopenableLeaflets } from '../leafletActive';

const leaflet = (id: string, over: Partial<LeafletResult> = {}): LeafletResult => ({
  id,
  chain: 'lidl',
  validFrom: '2026-11-10',
  validTo: '2026-11-16',
  status: 'done',
  pagesRead: 2,
  pagesUnreadable: 0,
  pagesDropped: 0,
  matches: [],
  unmatchedCount: 3,
  ...over,
});

describe('reopenableLeaflets', () => {
  it('keeps every leaflet with at least one page read, in the server order (newest first)', () => {
    const list = [leaflet('a'), leaflet('b', { status: 'failed', pagesRead: 3 }), leaflet('c', { status: 'reading', pagesRead: 1 })];
    expect(reopenableLeaflets(list).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('hides leaflets with nothing read — an abandoned run or a PDF whose upload never arrived', () => {
    const list = [
      leaflet('orphan', { status: 'reading', pagesRead: 0 }),
      leaflet('stale', { status: 'failed', pagesRead: 0 }),
      leaflet('unreadable', { status: 'done', pagesRead: 0, pagesUnreadable: 2 }),
      leaflet('ok'),
    ];
    expect(reopenableLeaflets(list).map((l) => l.id)).toEqual(['ok']);
  });

  it('null (not loaded) reads as an empty list', () => {
    expect(reopenableLeaflets(null)).toEqual([]);
  });
});
