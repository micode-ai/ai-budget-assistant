import { summarizePending, PENDING_VISIBLE_AFTER_MS, type PendingRow } from '../pendingSyncSummary';

const NOW = 1_000_000_000_000;
const row = (p: Partial<PendingRow>): PendingRow => ({
  entity: 'expenses',
  status: 'pending',
  count: 1,
  oldestUpdatedAt: NOW,
  ...p,
});

describe('summarizePending', () => {
  it('is hidden when nothing is pending', () => {
    expect(summarizePending([], NOW)).toMatchObject({ total: 0, visible: false });
  });

  it('keeps a fresh pending row quiet but still counts it', () => {
    const s = summarizePending([row({ count: 3 })], NOW);
    expect(s).toMatchObject({ waiting: 3, total: 3, visible: false });
  });

  it('surfaces pending rows older than the threshold', () => {
    const s = summarizePending([row({ oldestUpdatedAt: NOW - PENDING_VISIBLE_AFTER_MS })], NOW);
    expect(s.visible).toBe(true);
  });

  it('shows failed rows immediately and totals across entities', () => {
    const s = summarizePending(
      [row({ status: 'error', count: 2 }), row({ entity: 'incomes', count: 1 })],
      NOW,
    );
    expect(s).toMatchObject({ failed: 2, waiting: 1, total: 3, visible: true });
    expect(s.byEntity).toEqual({ expenses: 2, incomes: 1 });
  });

  it('ignores zero-count buckets', () => {
    expect(summarizePending([row({ count: 0, status: 'error' })], NOW).visible).toBe(false);
  });
});
