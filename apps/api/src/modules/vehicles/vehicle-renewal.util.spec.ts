import { dueRenewals, odometerNudgeDue, rollForwardYear, daysUntil } from './vehicle-renewal.util';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const empty = { nextInsuranceDate: null, nextInspectionDate: null, nextServiceDate: null };

describe('vehicle renewal util', () => {
  it('fires at 14 and 2 days only', () => {
    const today = d('2026-06-01');
    expect(dueRenewals({ ...empty, nextInsuranceDate: d('2026-06-15') }, today)).toEqual([{ kind: 'insurance', days: 14 }]);
    expect(dueRenewals({ ...empty, nextInspectionDate: d('2026-06-03') }, today)).toEqual([{ kind: 'inspection', days: 2 }]);
    expect(dueRenewals({ ...empty, nextServiceDate: d('2026-06-10') }, today)).toEqual([]);
  });

  it('never fires for a past date and ignores the time of day', () => {
    expect(dueRenewals({ ...empty, nextServiceDate: d('2026-05-30') }, d('2026-06-01'))).toEqual([]);
    expect(daysUntil(d('2026-06-03'), new Date('2026-06-01T23:59:00Z'))).toBe(2);
  });

  it('nudges within 500 km once per target', () => {
    expect(odometerNudgeDue(60000, 59500, null)).toBe(true);
    expect(odometerNudgeDue(60000, 61000, null)).toBe(true);
    expect(odometerNudgeDue(60000, 59000, null)).toBe(false);
    expect(odometerNudgeDue(60000, 59800, 60000)).toBe(false);
    expect(odometerNudgeDue(null, 59800, null)).toBe(false);
    expect(odometerNudgeDue(60000, null, null)).toBe(false);
  });

  it('rolls a year forward, clamping Feb 29', () => {
    expect(rollForwardYear(d('2026-06-15')).toISOString().slice(0, 10)).toBe('2027-06-15');
    expect(rollForwardYear(d('2028-02-29')).toISOString().slice(0, 10)).toBe('2029-02-28');
  });
});
