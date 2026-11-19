import {
  dayKey,
  daysBetween,
  dueRenewals,
  expenseDayKey,
  isOverdue,
  latestOdometer,
  proposedRenewal,
  renewalFieldForCost,
  renewalFormFrom,
  renewalPatch,
  rollForwardYear,
  todayKey,
} from '../vehicleRenewals';

const none = { nextInsuranceDate: null, nextInspectionDate: null, nextServiceDate: null, nextServiceOdometer: null };

describe('vehicleRenewals (ABA-829)', () => {
  it('reads a bare day and a midnight-UTC stamp as the same calendar day', () => {
    expect(dayKey('2027-03-01')).toBe('2027-03-01');
    expect(dayKey('2027-03-01T00:00:00.000Z')).toBe('2027-03-01');
    expect(dayKey(null)).toBeNull();
    expect(dayKey('junk')).toBeNull();
  });

  it('counts calendar days across months and DST', () => {
    expect(daysBetween('2026-11-19', '2026-11-20')).toBe(1);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-11-19', '2026-11-01')).toBe(-18);
  });

  it('takes today from local components, never UTC', () => {
    expect(todayKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });

  it('shows dates within 30 days or overdue, overdue first', () => {
    const due = dueRenewals(
      { ...none, nextInsuranceDate: '2026-12-10', nextInspectionDate: '2026-11-10', nextServiceDate: '2027-02-01' },
      '2026-11-19',
      null,
    );
    expect(due).toEqual([
      { kind: 'inspection', by: 'date', date: '2026-11-10', days: -9 },
      { kind: 'insurance', by: 'date', date: '2026-12-10', days: 21 },
    ]);
    expect(isOverdue(due[0])).toBe(true);
    expect(isOverdue(due[1])).toBe(false);
  });

  it('includes the 30th day and today', () => {
    expect(dueRenewals({ ...none, nextServiceDate: '2026-12-19' }, '2026-11-19', null)).toHaveLength(1);
    expect(dueRenewals({ ...none, nextServiceDate: '2026-12-20' }, '2026-11-19', null)).toHaveLength(0);
    expect(dueRenewals({ ...none, nextServiceDate: '2026-11-19' }, '2026-11-19', null)[0]).toMatchObject({ days: 0 });
  });

  it('shows the service by odometer within 500 km, overdue past the target', () => {
    expect(dueRenewals({ ...none, nextServiceOdometer: 60000 }, '2026-11-19', 59400)).toEqual([]);
    expect(dueRenewals({ ...none, nextServiceOdometer: 60000 }, '2026-11-19', 59500)).toEqual([
      { kind: 'service', by: 'odometer', targetKm: 60000, kmLeft: 500 },
    ]);
    const past = dueRenewals({ ...none, nextServiceOdometer: 60000 }, '2026-11-19', 60200);
    expect(past[0]).toMatchObject({ kmLeft: -200 });
    expect(isOverdue(past[0])).toBe(true);
    // No fill-up yet: nothing to compare against.
    expect(dueRenewals({ ...none, nextServiceOdometer: 60000 }, '2026-11-19', null)).toEqual([]);
  });

  it('rolls a year forward, clamping Feb 29', () => {
    expect(rollForwardYear('2026-11-19')).toBe('2027-11-19');
    expect(rollForwardYear('2028-02-29')).toBe('2029-02-28');
    expect(rollForwardYear('2026-12-31')).toBe('2027-12-31');
  });

  it('patches only what changed, a cleared date as null', () => {
    const initial = renewalFormFrom({ ...none, nextInsuranceDate: '2027-01-01T00:00:00.000Z', nextServiceOdometer: 60000 });
    expect(initial).toEqual({
      nextInsuranceDate: '2027-01-01',
      nextInspectionDate: null,
      nextServiceDate: null,
      nextServiceOdometer: '60000',
    });
    expect(renewalPatch(initial, initial, 60000)).toEqual({});
    expect(
      renewalPatch(initial, { ...initial, nextInsuranceDate: null, nextServiceDate: '2027-05-01', nextServiceOdometer: '' }, null),
    ).toEqual({ nextInsuranceDate: null, nextServiceDate: '2027-05-01', nextServiceOdometer: null });
    // An unreadable odometer is left out (the form blocks saving anyway).
    expect(renewalPatch(initial, { ...initial, nextServiceOdometer: 'x' }, undefined)).toEqual({});
  });

  it('takes the server odometer, else the highest listed reading', () => {
    expect(latestOdometer({ latestOdometerKm: 70000, items: [{ odometerKm: 1 }] })).toBe(70000);
    expect(latestOdometer({ items: [{ odometerKm: 100 }, {}, { odometerKm: 300 }] })).toBe(300);
    expect(latestOdometer({ items: [] })).toBeNull();
    expect(latestOdometer({})).toBeNull();
  });

  it('reads an expense day from a Date or a string', () => {
    expect(expenseDayKey(new Date(2026, 10, 3, 23, 30))).toBe('2026-11-03');
    expect(expenseDayKey('2026-11-03T00:00:00.000Z')).toBe('2026-11-03');
    expect(expenseDayKey(new Date('invalid'))).toBeNull();
  });

  it('maps cost kinds to the renewal they pay for', () => {
    expect(renewalFieldForCost('insurance')).toBe('nextInsuranceDate');
    expect(renewalFieldForCost('service')).toBe('nextServiceDate');
    expect(renewalFieldForCost('fuel')).toBeNull();
    expect(renewalFieldForCost('tax')).toBeNull();
  });

  it('offers a roll-forward only while the date is due, else from the expense day', () => {
    expect(proposedRenewal('2026-12-01', '2026-11-19', '2026-11-19')).toBe('2027-12-01');
    expect(proposedRenewal('2026-10-01T00:00:00.000Z', '2026-11-19', '2026-11-19')).toBe('2027-10-01');
    // Already a year out: it was rolled before.
    expect(proposedRenewal('2027-11-01', '2026-11-19', '2026-11-19')).toBeNull();
    expect(proposedRenewal(null, '2026-11-15', '2026-11-19')).toBe('2027-11-15');
  });
});
