import type { VehicleHistory, VehicleHistoryItem } from '@budget/shared-types';
import { filterItems, itemCaption, kindRows } from '../vehicleDetailDisplay';

const item = (date: string, kind: VehicleHistoryItem['kind'], extra: Partial<VehicleHistoryItem> = {}): VehicleHistoryItem => ({
  expenseId: `${date}-${kind}`,
  clientId: null,
  date,
  kind,
  amount: 10,
  currencyCode: 'PLN',
  amountBase: 10,
  merchant: null,
  description: null,
  ...extra,
});

const history = {
  byKind: { fuel: 300, service: 600, insurance: 0, parking: 100, tax: 0, other: 0 },
  monthly: [
    { month: '2026-10', total: 600, byKind: { service: 600 } },
    { month: '2026-11', total: 400, byKind: { fuel: 300, parking: 100 } },
  ],
} as unknown as VehicleHistory;

describe('vehicle screen display (ABA-811)', () => {
  it('lists the non-zero kinds of the period, largest first, with shares', () => {
    const rows = kindRows(history, null);
    expect(rows.map((r) => r.id)).toEqual(['service', 'fuel', 'parking']);
    expect(rows[0].percentage).toBe(60);
  });

  it('narrows the kinds to a picked month', () => {
    expect(kindRows(history, '2026-11').map((r) => [r.id, r.percentage])).toEqual([
      ['fuel', 75],
      ['parking', 25],
    ]);
  });

  it('narrows the list by month and by kind', () => {
    const items = [item('2026-11-02', 'fuel'), item('2026-11-03', 'parking'), item('2026-10-01', 'service')];
    expect(filterItems(items, '2026-11', null)).toHaveLength(2);
    expect(filterItems(items, null, 'service')).toHaveLength(1);
    expect(filterItems(items, '2026-10', 'fuel')).toHaveLength(0);
  });

  it('never shows ciphertext and prefers the device copy', () => {
    expect(itemCaption(item('2026-11-01', 'fuel', { merchant: 'enc:abc' }))).toBeNull();
    expect(itemCaption(item('2026-11-01', 'fuel', { merchant: 'enc:abc' }), { merchant: 'Station' })).toBe('Station');
    expect(itemCaption(item('2026-11-01', 'fuel', { description: ' note ' }))).toBe('note');
  });
});
