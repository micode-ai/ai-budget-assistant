/**
 * The Statement PDF gate: who may request it, and when. The server enforces
 * every rule again (Pro tier guard, ViewerBlockGuard, ENCRYPTED_ACCOUNT); the
 * app checks first so it can say why instead of failing.
 */
import {
  canRequestStatement,
  countPendingForAccount,
  flushLeftPending,
  statementErrorCode,
  statementPreflight,
  statementPeriod,
} from '../statementGate';

const ok = { tier: 'pro', encryptionTier: 0, pendingChanges: 0, canEdit: true };

describe('canRequestStatement', () => {
  it('ok for a Pro editor on an unencrypted account with nothing pending', () => {
    expect(canRequestStatement(ok)).toBe('ok');
    expect(canRequestStatement({ ...ok, tier: 'business' })).toBe('ok');
  });

  it("'pro' on the free tier", () => {
    expect(canRequestStatement({ ...ok, tier: 'free' })).toBe('pro');
  });

  it("'encrypted' at any encryption tier above 0", () => {
    expect(canRequestStatement({ ...ok, encryptionTier: 1 })).toBe('encrypted');
    expect(canRequestStatement({ ...ok, encryptionTier: 2 })).toBe('encrypted');
  });

  it("'pending' while anything for the account is still queued", () => {
    expect(canRequestStatement({ ...ok, pendingChanges: 1 })).toBe('pending');
  });

  it("'viewer' for a viewer — before the paywall: upgrading would not help them", () => {
    expect(canRequestStatement({ ...ok, canEdit: false })).toBe('viewer');
    expect(canRequestStatement({ ...ok, canEdit: false, tier: 'free' })).toBe('viewer');
  });

  it('the paywall comes before encryption and pending', () => {
    expect(canRequestStatement({ ...ok, tier: 'free', encryptionTier: 1, pendingChanges: 3 })).toBe('pro');
    expect(canRequestStatement({ ...ok, encryptionTier: 1, pendingChanges: 3 })).toBe('encrypted');
  });
});

describe('countPendingForAccount', () => {
  it('counts queued child changes plus this account’s pending expenses and incomes', () => {
    const n = countPendingForAccount('acc-1', {
      queuedChildChanges: 2,
      expenses: [
        { accountId: 'acc-1', syncStatus: 'pending', isDeleted: false },
        { accountId: 'acc-1', syncStatus: 'synced', isDeleted: false },
        { accountId: 'acc-2', syncStatus: 'pending', isDeleted: false },
      ],
      incomes: [
        { accountId: 'acc-1', syncStatus: 'pending', isDeleted: false },
        { accountId: 'acc-1', syncStatus: 'error', isDeleted: false },
      ],
    });
    expect(n).toBe(4);
  });

  it('a pending soft delete still counts: the server would still print that expense', () => {
    expect(
      countPendingForAccount('acc-1', {
        queuedChildChanges: 0,
        expenses: [{ accountId: 'acc-1', syncStatus: 'pending', isDeleted: true }],
        incomes: [],
      }),
    ).toBe(1);
  });
});

describe('statementPeriod', () => {
  const now = new Date(2026, 10, 12, 15, 0); // 12 Nov 2026, local

  it('this year: 1 January to today', () => {
    expect(statementPeriod('thisYear', now)).toEqual({ from: '2026-01-01', to: '2026-11-12' });
  });

  it('last year: the whole previous calendar year', () => {
    expect(statementPeriod('lastYear', now)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('last 12 months: from the first of the month 11 months back, to today', () => {
    expect(statementPeriod('last12Months', now)).toEqual({ from: '2025-12-01', to: '2026-11-12' });
  });
});

describe('statementErrorCode', () => {
  it('maps the server refusals to gate codes', () => {
    expect(statementErrorCode({ status: 403, code: 'TIER_REQUIRED' })).toBe('pro');
    expect(statementErrorCode({ status: 403, code: 'ENCRYPTED_ACCOUNT' })).toBe('encrypted');
    // An unrecognised 403 is not proof of a viewer: say it failed rather than blame the role.
    expect(statementErrorCode({ status: 403 })).toBe('failed');
    expect(statementErrorCode({ status: 403, code: 'SOMETHING_ELSE' })).toBe('failed');
    expect(statementErrorCode({ status: 500 })).toBe('failed');
    expect(statementErrorCode(new Error('Network request failed'))).toBe('failed');
  });
});

describe('flushLeftPending', () => {
  it('refuses only when something was pending AND the flush could not be trusted', () => {
    expect(flushLeftPending({ pendingBefore: 0, offline: true, flushFailed: true })).toBe(false);
    expect(flushLeftPending({ pendingBefore: 2, offline: false, flushFailed: false })).toBe(false);
    expect(flushLeftPending({ pendingBefore: 2, offline: true, flushFailed: false })).toBe(true);
    expect(flushLeftPending({ pendingBefore: 2, offline: false, flushFailed: true })).toBe(true);
  });
});

describe('statementPreflight (the gate path the action runs)', () => {
  /**
   * Before ABA-749 the expense push marked a row synced even when its request
   * failed, so the re-count alone could read 0 while an expense never reached the
   * server. The snapshot taken BEFORE the flush still catches an offline flush.
   */
  function deps(over: Partial<Parameters<typeof statementPreflight>[0]> = {}) {
    let pending = 1;
    return {
      tier: () => 'pro',
      canEdit: () => true,
      // The (buggy) push clears the pending mark whatever happened.
      snapshotPending: () => pending,
      isOffline: () => false,
      flushChildQueue: jest.fn(async () => undefined),
      flushExpenses: jest.fn(async () => {
        pending = 0;
      }),
      flushIncomes: jest.fn(async () => undefined),
      countQueuedChildChanges: jest.fn(async () => 0),
      readEncryptionTier: jest.fn(async () => 0),
      ...over,
    };
  }

  it('ok when the flush ran online and left nothing', async () => {
    await expect(statementPreflight(deps())).resolves.toBe('ok');
  });

  it("'pending' when offline with something pending before the flush, though the re-count reads 0", async () => {
    const d = deps({ isOffline: () => true });
    await expect(statementPreflight(d)).resolves.toBe('pending');
  });

  it("'pending' when a flush call threw", async () => {
    const d = deps({ flushIncomes: jest.fn(async () => Promise.reject(new Error('Network request failed'))) });
    await expect(statementPreflight(d)).resolves.toBe('pending');
  });

  it('offline with nothing pending is not a refusal here (the request itself will say)', async () => {
    const d = deps({ snapshotPending: () => 0, isOffline: () => true });
    await expect(statementPreflight(d)).resolves.toBe('ok');
  });

  it("'pending' when child changes are still queued, or the queue cannot be read", async () => {
    await expect(statementPreflight(deps({ countQueuedChildChanges: jest.fn(async () => 2) }))).resolves.toBe('pending');
    await expect(
      statementPreflight(deps({ countQueuedChildChanges: jest.fn(async () => Promise.reject(new Error('db'))) })),
    ).resolves.toBe('pending');
  });

  it("'pending' while an expense delete has not reached the server, or that count cannot be read (ABA-749)", async () => {
    await expect(statementPreflight(deps({ countPendingDeletes: jest.fn(async () => 1) }))).resolves.toBe('pending');
    await expect(
      statementPreflight(deps({ countPendingDeletes: jest.fn(async () => Promise.reject(new Error('db'))) })),
    ).resolves.toBe('pending');
    await expect(statementPreflight(deps({ countPendingDeletes: jest.fn(async () => 0) }))).resolves.toBe('ok');
  });

  it("viewer and free tier answer before anything is flushed", async () => {
    const v = deps({ canEdit: () => false });
    await expect(statementPreflight(v)).resolves.toBe('viewer');
    expect(v.flushExpenses).not.toHaveBeenCalled();
    const f = deps({ tier: () => 'free' });
    await expect(statementPreflight(f)).resolves.toBe('pro');
    expect(f.flushExpenses).not.toHaveBeenCalled();
  });

  it("'encrypted' from the account's tier; an unreadable tier is left to the server", async () => {
    await expect(statementPreflight(deps({ readEncryptionTier: jest.fn(async () => 1) }))).resolves.toBe('encrypted');
    await expect(
      statementPreflight(deps({ readEncryptionTier: jest.fn(async () => Promise.reject(new Error('x'))) })),
    ).resolves.toBe('ok');
  });
});
