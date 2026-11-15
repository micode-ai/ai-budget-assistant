import { localDayKey } from '../localDayKey';

describe('localDayKey', () => {
  it('uses the local calendar day of a timestamp', () => {
    expect(localDayKey(new Date(2026, 5, 1, 0, 30))).toBe('2026-06-01');
    expect(localDayKey(new Date(2026, 5, 1, 23, 59))).toBe('2026-06-01');
  });

  it('keeps a bare date-only string as the day it names', () => {
    expect(localDayKey('2026-06-01')).toBe('2026-06-01');
  });

  it('parses a full ISO string as an instant and returns its local day', () => {
    const iso = new Date(2026, 5, 1, 12).toISOString();
    expect(localDayKey(iso)).toBe('2026-06-01');
  });
});
