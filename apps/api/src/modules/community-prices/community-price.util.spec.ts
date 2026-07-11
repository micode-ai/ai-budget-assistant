import { mondayOfWeek, regionBucket, computeContributorKey } from './community-price.util';

describe('mondayOfWeek', () => {
  it('returns the same date (midnight) when given a Monday', () => {
    const monday = new Date('2026-07-06T15:30:00'); // a Monday
    const result = mondayOfWeek(monday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(6);
    expect(result.getHours()).toBe(0);
  });

  it('rolls a mid-week date back to the preceding Monday', () => {
    const wednesday = new Date('2026-07-08T09:00:00');
    const result = mondayOfWeek(wednesday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(6);
    expect(result.getMonth()).toBe(6); // July (0-indexed)
  });

  it('rolls a Sunday back to the Monday six days prior (Monday-based week)', () => {
    const sunday = new Date('2026-07-12T23:59:00');
    const result = mondayOfWeek(sunday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(6);
  });
});

describe('regionBucket', () => {
  it('uses the reverse-geocoded city when available, lowercased and trimmed', () => {
    expect(regionBucket(52.2297, 21.0122, '  Warszawa ')).toBe('warszawa');
  });

  it('falls back to a rounded grid cell when no city is given', () => {
    expect(regionBucket(52.2297, 21.0122, null)).toBe('grid:52.2|21.0');
    expect(regionBucket(52.2297, 21.0122, undefined)).toBe('grid:52.2|21.0');
    expect(regionBucket(52.2297, 21.0122, '')).toBe('grid:52.2|21.0');
  });

  it('grid cell is deterministic and stable for nearby coordinates (~11km bucket)', () => {
    expect(regionBucket(52.234, 21.019, null)).toBe(regionBucket(52.229, 21.011, null));
  });
});

describe('computeContributorKey', () => {
  it('is deterministic: same salt + accountId always produces the same key', () => {
    const a = computeContributorKey('salt-1', 'account-abc');
    const b = computeContributorKey('salt-1', 'account-abc');
    expect(a).toBe(b);
  });

  it('produces a 64-char lowercase hex sha256 digest', () => {
    const key = computeContributorKey('salt-1', 'account-abc');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different accountId -> different key', () => {
    const a = computeContributorKey('salt-1', 'account-abc');
    const b = computeContributorKey('salt-1', 'account-xyz');
    expect(a).not.toBe(b);
  });

  it('different salt -> different key for the same account (anonymity under salt rotation)', () => {
    const a = computeContributorKey('salt-1', 'account-abc');
    const b = computeContributorKey('salt-2', 'account-abc');
    expect(a).not.toBe(b);
  });

  it('never contains the raw accountId as a substring (sanity check on the hash, not the input)', () => {
    const accountId = 'account-abc-123';
    const key = computeContributorKey('salt-1', accountId);
    expect(key).not.toContain(accountId);
  });
});
