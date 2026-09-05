import {
  calendarPartsInTimezone,
  formatInTimezone,
  yearMonthIdInTimezone,
} from './timezone';

/**
 * The bug these guard (ABA-503): a client serialises local midnight with
 * `toISOString()`, so the start of September in UTC+2 goes out as
 * `2026-08-31T22:00:00.000Z`. Reading that in UTC — which is what the server
 * does by default — answers August.
 */
const startOfSeptemberInWarsaw = new Date('2026-08-31T22:00:00.000Z');

describe('calendarPartsInTimezone', () => {
  it('reads an instant as the calendar day the user is on, not the server', () => {
    expect(calendarPartsInTimezone(startOfSeptemberInWarsaw, 'Europe/Warsaw')).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
  });

  it('gives DIFFERENT answers for two timezones on the same instant', () => {
    // The assertion above passes by accident on a machine that happens to sit
    // in Europe/Warsaw, because a formatter with no timeZone falls back to the
    // host's zone. This one cannot: dropping the option makes both calls
    // return the host's answer and the two sides become equal.
    const warsaw = calendarPartsInTimezone(startOfSeptemberInWarsaw, 'Europe/Warsaw');
    const honolulu = calendarPartsInTimezone(startOfSeptemberInWarsaw, 'Pacific/Honolulu');

    expect(warsaw).toEqual({ year: 2026, month: 9, day: 1 });
    expect(honolulu).toEqual({ year: 2026, month: 8, day: 31 });
    expect(warsaw).not.toEqual(honolulu);
  });

  it('still answers in UTC when that is the timezone', () => {
    expect(calendarPartsInTimezone(startOfSeptemberInWarsaw, 'UTC')).toEqual({
      year: 2026,
      month: 8,
      day: 31,
    });
  });

  it('crosses the other way for a western timezone', () => {
    // Local midnight of 1 Sept in New York is 04:00Z on the 1st; an instant
    // just before it is still August there.
    expect(calendarPartsInTimezone(new Date('2026-09-01T02:00:00.000Z'), 'America/New_York')).toEqual({
      year: 2026,
      month: 8,
      day: 31,
    });
  });

  it('falls back to UTC rather than throwing on a bad timezone', () => {
    // A label is never worth failing a request over.
    expect(calendarPartsInTimezone(startOfSeptemberInWarsaw, 'Mars/Olympus_Mons')).toEqual({
      year: 2026,
      month: 8,
      day: 31,
    });
  });

  it('treats null and empty as UTC', () => {
    expect(calendarPartsInTimezone(startOfSeptemberInWarsaw, null).month).toBe(8);
    expect(calendarPartsInTimezone(startOfSeptemberInWarsaw, '').month).toBe(8);
  });
});

describe('formatInTimezone', () => {
  it('names the month the user is in, and a different one elsewhere', () => {
    // Two zones, for the same reason as above — a single assertion here would
    // pass on a host that already sits in the zone under test.
    expect(
      formatInTimezone(startOfSeptemberInWarsaw, 'Europe/Warsaw', 'en-US', { month: 'long' }),
    ).toBe('September');
    expect(
      formatInTimezone(startOfSeptemberInWarsaw, 'Pacific/Honolulu', 'en-US', { month: 'long' }),
    ).toBe('August');
  });

  it('names the server month when the timezone is UTC — the old behaviour', () => {
    expect(
      formatInTimezone(startOfSeptemberInWarsaw, 'UTC', 'en-US', { month: 'long' }),
    ).toBe('August');
  });
});

describe('yearMonthIdInTimezone', () => {
  it('pads the month and uses the user timezone', () => {
    expect(yearMonthIdInTimezone(startOfSeptemberInWarsaw, 'Europe/Warsaw')).toBe('2026-09');
  });

  it('pads a single-digit month', () => {
    expect(yearMonthIdInTimezone(new Date('2026-03-15T12:00:00.000Z'), 'UTC')).toBe('2026-03');
  });
});
