import { isInQuietHours, quietHoursReleaseAt } from './quiet-hours.util';

describe('quiet hours util', () => {
  const at = (iso: string) => new Date(iso);

  it('detects a window that wraps midnight', () => {
    expect(isInQuietHours(at('2026-11-26T23:00:00Z'), 'UTC', 1320, 480)).toBe(true);
    expect(isInQuietHours(at('2026-11-26T03:00:00Z'), 'UTC', 1320, 480)).toBe(true);
    expect(isInQuietHours(at('2026-11-26T12:00:00Z'), 'UTC', 1320, 480)).toBe(false);
    expect(isInQuietHours(at('2026-11-26T08:00:00Z'), 'UTC', 1320, 480)).toBe(false);
  });

  it('handles a same-day window and an empty window', () => {
    expect(isInQuietHours(at('2026-11-26T13:30:00Z'), 'UTC', 780, 840)).toBe(true);
    expect(isInQuietHours(at('2026-11-26T13:30:00Z'), 'UTC', 600, 600)).toBe(false);
  });

  it('uses the user timezone', () => {
    expect(isInQuietHours(at('2026-11-26T23:00:00Z'), 'Europe/Warsaw', 1320, 480)).toBe(true);
    expect(isInQuietHours(at('2026-11-26T20:00:00Z'), 'Europe/Warsaw', 1320, 480)).toBe(false);
  });

  it('falls back to UTC on a bad timezone', () => {
    expect(isInQuietHours(at('2026-11-26T23:00:00Z'), 'Nope/Zone', 1320, 480)).toBe(true);
  });

  it('computes the release instant', () => {
    expect(quietHoursReleaseAt(at('2026-11-26T23:30:00Z'), 'UTC', 480).toISOString()).toBe('2026-11-27T08:00:00.000Z');
    expect(quietHoursReleaseAt(at('2026-11-26T03:10:00Z'), 'UTC', 480).toISOString()).toBe('2026-11-26T08:00:00.000Z');
    expect(quietHoursReleaseAt(at('2026-11-26T23:30:00Z'), 'Europe/Warsaw', 480).toISOString()).toBe('2026-11-27T07:00:00.000Z');
  });
});
