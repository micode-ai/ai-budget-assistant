import { kmPerDay, serviceForecast, serviceTargetKm } from './service-interval.util';

const today = new Date('2026-11-24T00:00:00Z');
const d = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86_400_000);

describe('service-interval.util', () => {
  it('target: the interval pair wins over the legacy target', () => {
    expect(serviceTargetKm({ intervalKm: 10000, lastServiceKm: 50000, legacyTargetKm: 55000 })).toBe(60000);
    expect(serviceTargetKm({ intervalKm: null, lastServiceKm: 50000, legacyTargetKm: 55000 })).toBe(55000);
    expect(serviceTargetKm({ intervalKm: 10000, lastServiceKm: null, legacyTargetKm: null })).toBeNull();
  });

  it('rate: needs two readings spanning a week inside the last 60 days', () => {
    expect(kmPerDay([{ date: d(1), odometerKm: 1000 }], today)).toBeNull();
    expect(kmPerDay([{ date: d(10), odometerKm: 1000 }, { date: d(8), odometerKm: 1100 }], today)).toBeNull();
    expect(kmPerDay([{ date: d(40), odometerKm: 1000 }, { date: d(10), odometerKm: 1600 }], today)).toBeCloseTo(20);
    expect(kmPerDay([{ date: d(90), odometerKm: 0 }, { date: d(70), odometerKm: 1000 }], today)).toBeNull();
  });

  it('forecast extrapolates with a rate and gives days left', () => {
    const f = serviceForecast({
      intervalKm: 10000,
      lastServiceKm: 50000,
      legacyTargetKm: null,
      readings: [{ date: d(40), odometerKm: 58000 }, { date: d(10), odometerKm: 58600 }],
      today,
    })!;
    expect(f.kmPerDay).toBe(20);
    expect(f.estimatedKm).toBe(58800);
    expect(f.remainingKm).toBe(1200);
    expect(f.daysLeft).toBe(60);
  });

  it('sparse readings: remaining from the latest reading, no days', () => {
    const f = serviceForecast({
      intervalKm: 10000,
      lastServiceKm: 50000,
      legacyTargetKm: null,
      readings: [{ date: d(3), odometerKm: 59100 }],
      today,
    })!;
    expect(f).toMatchObject({ estimatedKm: 59100, remainingKm: 900, daysLeft: null, kmPerDay: null });
  });

  it('overdue is negative with no days; nothing configured or no readings is null', () => {
    const f = serviceForecast({
      intervalKm: 5000,
      lastServiceKm: 50000,
      legacyTargetKm: null,
      readings: [{ date: d(1), odometerKm: 56000 }],
      today,
    })!;
    expect(f.remainingKm).toBe(-1000);
    expect(f.daysLeft).toBeNull();
    expect(
      serviceForecast({ intervalKm: null, lastServiceKm: null, legacyTargetKm: null, readings: [{ date: d(1), odometerKm: 1 }], today }),
    ).toBeNull();
    expect(serviceForecast({ intervalKm: 5000, lastServiceKm: 1, legacyTargetKm: null, readings: [], today })).toBeNull();
  });
});
