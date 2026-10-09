import { resolveImportReportStatus, rollForwardRenewal, startOfMonth } from '../importReport';

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

describe('resolveImportReportStatus', () => {
  it('keeps a failed load apart from a successful "not enough data" answer', () => {
    // The import succeeded in both; only the first can be retried. Collapsing them was the defect.
    expect(resolveImportReportStatus('failed', null)).toBe('failed');
    expect(resolveImportReportStatus('loaded', { hasEnoughData: false })).toBe('insufficient');
  });
  it('is ready only for a loaded report with enough data', () => {
    expect(resolveImportReportStatus('loaded', { hasEnoughData: true })).toBe('ready');
  });
  it('is loading until the request settles, whatever a stale report says', () => {
    expect(resolveImportReportStatus('loading', null)).toBe('loading');
    expect(resolveImportReportStatus('loading', { hasEnoughData: true })).toBe('loading');
  });
  it('never reports ready without a report, even when the load claims to have finished', () => {
    expect(resolveImportReportStatus('loaded', null)).toBe('failed');
  });
});
