import { rollForwardRenewal, startOfMonth } from '../importReport';

describe('rollForwardRenewal', () => {
  const today = new Date(2026, 9, 8); // 2026-10-08
  it('keeps a future date', () => {
    expect(rollForwardRenewal('2026-10-20', 'monthly', today)).toBe('2026-10-20');
  });
  it('keeps today', () => {
    expect(rollForwardRenewal('2026-10-08', 'monthly', today)).toBe('2026-10-08');
  });
  it('rolls a past monthly date forward by whole months', () => {
    expect(rollForwardRenewal('2026-08-02', 'monthly', today)).toBe('2026-11-02');
  });
  it('keeps the anchor day across a short month', () => {
    expect(rollForwardRenewal('2027-01-31', 'monthly', new Date(2027, 1, 10))).toBe('2027-02-28');
  });
  it('rolls a weekly date by weeks', () => {
    expect(rollForwardRenewal('2026-09-30', 'weekly', today)).toBe('2026-10-14');
  });
});

describe('startOfMonth', () => {
  it('is the 1st', () => {
    expect(startOfMonth(new Date(2026, 9, 8)).getDate()).toBe(1);
  });
});
