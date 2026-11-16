import { digestPeriodsEndingYesterday } from './monthly-digest-period.util';

describe('digestPeriodsEndingYesterday', () => {
  it('reports the previous calendar month on the 1st, and nothing on other days', () => {
    const p = digestPeriodsEndingYesterday(new Date(2026, 10, 1, 9), null)!;
    expect(p.start).toEqual(new Date(2026, 9, 1));
    expect(p.end).toEqual(new Date(2026, 9, 31));
    expect(p.prevStart).toEqual(new Date(2026, 8, 1));
    expect(p.prevEnd).toEqual(new Date(2026, 8, 30));
    expect(p.label).toBe('October 2026');
    expect(digestPeriodsEndingYesterday(new Date(2026, 10, 2, 9), null)).toBeNull();
  });

  it('reports the previous financial month on the anchor day, with its span in the label', () => {
    const p = digestPeriodsEndingYesterday(new Date(2026, 10, 10, 9), 10)!;
    expect(p.start).toEqual(new Date(2026, 9, 10));
    expect(p.end).toEqual(new Date(2026, 10, 9));
    expect(p.prevStart).toEqual(new Date(2026, 8, 10));
    expect(p.prevEnd).toEqual(new Date(2026, 9, 9));
    expect(p.label).toBe('October 2026 (Oct 10 – Nov 9)');
    expect(digestPeriodsEndingYesterday(new Date(2026, 10, 1, 9), 10)).toBeNull();
  });

  it('clamps an anchor past the end of a short month', () => {
    // Anchor 31: February's period starts on the 28th.
    const p = digestPeriodsEndingYesterday(new Date(2027, 1, 28, 9), 31)!;
    expect(p.start).toEqual(new Date(2027, 0, 31));
    expect(p.end).toEqual(new Date(2027, 1, 27));
  });
});
