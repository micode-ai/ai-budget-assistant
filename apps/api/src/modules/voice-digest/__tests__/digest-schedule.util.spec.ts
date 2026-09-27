import { localParts, isoWeekKey, isDue } from '../digest-schedule.util';

describe('localParts', () => {
  it('reads weekday and hour in the user time zone', () => {
    // 2026-09-28 is a Monday. 06:30 UTC = 08:30 in Warsaw (CEST, +2).
    expect(localParts(new Date('2026-09-28T06:30:00Z'), 'Europe/Warsaw')).toEqual({ weekday: 1, hour: 8, date: '2026-09-28' });
  });
  it('falls back to UTC for an invalid zone', () => {
    expect(localParts(new Date('2026-09-28T06:30:00Z'), 'Not/AZone')).toEqual({ weekday: 1, hour: 6, date: '2026-09-28' });
  });
  it('handles a date line crossing', () => {
    // Sunday 23:30 UTC is Monday 12:30 in Auckland (NZDT, +13).
    expect(localParts(new Date('2026-10-04T23:30:00Z'), 'Pacific/Auckland').weekday).toBe(1);
  });
});

describe('isoWeekKey', () => {
  it('uses the local date', () => {
    expect(isoWeekKey(new Date('2026-09-28T06:30:00Z'), 'Europe/Warsaw')).toBe('2026-W40');
    // 2027-01-01 is a Friday → ISO week 53 of 2026
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe('2026-W53');
  });
});

describe('isDue', () => {
  const base = { timeZone: 'Europe/Warsaw', day: 1, hour: 8, lastSentAt: null };
  it('is due in the chosen local hour of the chosen weekday', () => {
    expect(isDue({ ...base, now: new Date('2026-09-28T06:05:00Z') })).toBe(true);
    expect(isDue({ ...base, now: new Date('2026-09-28T07:05:00Z') })).toBe(false);
    expect(isDue({ ...base, now: new Date('2026-09-29T06:05:00Z') })).toBe(false);
  });
  it('is not due within 6 days of the last send', () => {
    expect(isDue({ ...base, now: new Date('2026-09-28T06:05:00Z'), lastSentAt: new Date('2026-09-23T06:05:00Z') })).toBe(false);
    expect(isDue({ ...base, now: new Date('2026-09-28T06:05:00Z'), lastSentAt: new Date('2026-09-21T06:05:00Z') })).toBe(true);
  });
  it('follows local time across a DST switch (New York)', () => {
    const ny = { timeZone: 'America/New_York', day: 1, hour: 8, lastSentAt: null };
    // Mon 2026-10-26 08:00 EDT = 12:00 UTC; Mon 2026-11-02 08:00 EST = 13:00 UTC
    expect(isDue({ ...ny, now: new Date('2026-10-26T12:10:00Z') })).toBe(true);
    expect(isDue({ ...ny, now: new Date('2026-11-02T12:10:00Z') })).toBe(false);
    expect(isDue({ ...ny, now: new Date('2026-11-02T13:10:00Z') })).toBe(true);
  });
});
