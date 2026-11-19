import type { PetHistory, PetHistoryItem } from '@budget/shared-types';
import {
  careDateStatus,
  chunkPetIds,
  filterPetItems,
  petAgeYears,
  petDaysUntil,
  petItemCaption,
  petKindRows,
  topPetKinds,
} from '../petDisplay';

const item = (date: string, kind: PetHistoryItem['kind'], extra: Partial<PetHistoryItem> = {}): PetHistoryItem => ({
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
  byKind: { food: 300, vet: 600, grooming: 0, supplies: 100, insurance: 0, other: 0 },
  monthly: [
    { month: '2026-10', total: 600, byKind: { vet: 600 } },
    { month: '2026-11', total: 400, byKind: { food: 300, supplies: 100 } },
  ],
} as unknown as PetHistory;

describe('pet screen display (ABA-831)', () => {
  it('lists the non-zero kinds of the period, largest first, with shares', () => {
    const rows = petKindRows(history, null);
    expect(rows.map((r) => r.id)).toEqual(['vet', 'food', 'supplies']);
    expect(rows[0].percentage).toBe(60);
  });

  it('narrows the breakdown to a picked month', () => {
    expect(petKindRows(history, '2026-11').map((r) => r.id)).toEqual(['food', 'supplies']);
    expect(petKindRows(history, '2026-01')).toEqual([]);
  });

  it('filters the list by month and kind', () => {
    const items = [item('2026-11-02', 'food'), item('2026-10-05', 'vet'), item('2026-11-20', 'vet')];
    expect(filterPetItems(items, '2026-11', null)).toHaveLength(2);
    expect(filterPetItems(items, '2026-11', 'vet').map((i) => i.date)).toEqual(['2026-11-20']);
    expect(filterPetItems(items, null, null)).toHaveLength(3);
  });

  it('takes the two largest kinds for the analytics caption', () => {
    expect(topPetKinds(history.byKind).map((k) => k.kind)).toEqual(['vet', 'food']);
    expect(topPetKinds({})).toEqual([]);
  });

  it('never shows ciphertext and prefers the decrypted local copy', () => {
    expect(petItemCaption(item('2026-11-01', 'food', { merchant: 'enc:abc' }))).toBeNull();
    expect(petItemCaption(item('2026-11-01', 'food', { merchant: 'enc:abc' }), { merchant: 'Zooplus' })).toBe('Zooplus');
    expect(petItemCaption(item('2026-11-01', 'food', { description: ' Kibble ' }))).toBe('Kibble');
  });
});

describe('pet care dates', () => {
  const today = new Date(2026, 10, 19, 15, 30); // 19 Nov 2026, local afternoon

  it('counts local calendar days, whatever the time of day', () => {
    expect(petDaysUntil('2026-11-21', today)).toBe(2);
    expect(petDaysUntil('2026-11-19', today)).toBe(0);
    expect(petDaysUntil('2026-11-18', today)).toBe(-1);
  });

  it('is overdue once past and soon within two weeks', () => {
    expect(careDateStatus('2026-11-18', today)).toBe('overdue');
    expect(careDateStatus('2026-12-03', today)).toBe('soon');
    expect(careDateStatus('2026-12-04', today)).toBe('later');
  });

  it('computes the age in whole years', () => {
    expect(petAgeYears('2020-11-19', today)).toBe(6);
    expect(petAgeYears('2020-11-20', today)).toBe(5);
    expect(petAgeYears(null, today)).toBeNull();
    expect(petAgeYears('2027-01-01', today)).toBeNull();
  });
});

describe('bulk assign chunking', () => {
  it('splits into server-sized requests and drops duplicates', () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `e${i}`);
    expect(chunkPetIds(ids).map((c) => c.length)).toEqual([500, 500, 1]);
    expect(chunkPetIds(['a', 'b', 'a'])).toEqual([['a', 'b']]);
    expect(chunkPetIds([])).toEqual([]);
  });
});
