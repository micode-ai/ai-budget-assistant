import { toDateInputValue, fromDateInputValue } from '../dateInput';

describe('toDateInputValue', () => {
  it('formats using the local calendar day, not UTC', () => {
    // 1 Jan 2026 00:30 local. `toISOString()` would report 2025-12-31 for any
    // positive UTC offset — the whole reason this helper exists.
    expect(toDateInputValue(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });

  it('formats a late-evening date without rolling to the next day', () => {
    expect(toDateInputValue(new Date(2026, 6, 29, 23, 45))).toBe('2026-07-29');
  });

  it('zero-pads month and day', () => {
    expect(toDateInputValue(new Date(2026, 2, 5, 12))).toBe('2026-03-05');
  });
});

describe('fromDateInputValue', () => {
  const base = new Date(2026, 6, 29, 14, 35, 12, 250);

  it('parses to the same local calendar day that was typed', () => {
    const parsed = fromDateInputValue('2026-01-01', base);
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(0);
    expect(parsed!.getDate()).toBe(1);
  });

  it('round-trips through toDateInputValue', () => {
    const parsed = fromDateInputValue('2026-03-05', base);
    expect(toDateInputValue(parsed!)).toBe('2026-03-05');
  });

  it('carries the time of day over from the base date', () => {
    const parsed = fromDateInputValue('2026-02-10', base)!;
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(35);
    expect(parsed.getSeconds()).toBe(12);
    expect(parsed.getMilliseconds()).toBe(250);
  });

  it('returns null for an empty or partial value instead of an Invalid Date', () => {
    expect(fromDateInputValue('', base)).toBeNull();
    expect(fromDateInputValue('2026-07', base)).toBeNull();
    expect(fromDateInputValue('2026-7-9', base)).toBeNull();
    expect(fromDateInputValue('not-a-date', base)).toBeNull();
  });

  it('rejects an out-of-range month or day', () => {
    expect(fromDateInputValue('2026-13-01', base)).toBeNull();
    expect(fromDateInputValue('2026-00-10', base)).toBeNull();
    expect(fromDateInputValue('2026-07-00', base)).toBeNull();
    expect(fromDateInputValue('2026-07-32', base)).toBeNull();
  });

  it('rejects a day that does not exist in that month rather than rolling forward', () => {
    // `new Date(2026, 1, 31)` silently becomes 3 March — must not be accepted.
    expect(fromDateInputValue('2026-02-31', base)).toBeNull();
    expect(fromDateInputValue('2026-04-31', base)).toBeNull();
  });

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(fromDateInputValue('2024-02-29', base)).not.toBeNull();
    expect(fromDateInputValue('2026-02-29', base)).toBeNull();
  });
});
