// Manual factory (not bare automock): the real accountStore.ts is safe to
// import in this test file (expo-sqlite is globally mocked in jest.setup.js),
// but readAnchorDay() needs a controllable `getState().currentAccount()`
// return value per test case, so accountStore is mocked here specifically for
// that — the pure resolveFinancialMonth() tests below don't touch it at all.
jest.mock('../../stores/accountStore', () => ({
  useAccountStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

import { resolveFinancialMonth, readAnchorDay } from '../useFinancialMonth';
import { useAccountStore } from '../../stores/accountStore';

const mockGetState = useAccountStore.getState as jest.Mock;

describe('resolveFinancialMonth', () => {
  it('falls back to the calendar month when no account is loaded', () => {
    const { anchorDay, current } = resolveFinancialMonth(null, new Date(2026, 7, 15));
    expect(anchorDay).toBeNull();
    expect(current.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });

  it('uses the account anchor', () => {
    const { anchorDay, current } = resolveFinancialMonth(
      { monthAnchorDay: 10 } as any,
      new Date(2026, 7, 15),
    );
    expect(anchorDay).toBe(10);
    expect(current.start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });

  it('treats a corrupt stored anchor as the calendar month', () => {
    const { anchorDay, current } = resolveFinancialMonth(
      { monthAnchorDay: 99 } as any,
      new Date(2026, 7, 15),
    );
    expect(anchorDay).toBeNull();
    expect(current.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });
});

// Covers the wiring resolveFinancialMonth's own tests can't reach: the
// currentAccount() *invocation* against the store. A regression that drops
// the parens (reads `.currentAccount` as a field) would pass every
// resolveFinancialMonth test above unchanged and still fail here, since the
// mock's `currentAccount` is a function whose `.monthAnchorDay` is undefined
// unless actually called.
describe('readAnchorDay', () => {
  afterEach(() => {
    mockGetState.mockReset();
  });

  it('returns the anchor when the current account carries one', () => {
    mockGetState.mockReturnValue({ currentAccount: () => ({ monthAnchorDay: 15 }) });
    expect(readAnchorDay()).toBe(15);
  });

  it('returns null when the current account has an explicit null anchor', () => {
    mockGetState.mockReturnValue({ currentAccount: () => ({ monthAnchorDay: null }) });
    expect(readAnchorDay()).toBeNull();
  });

  it('returns null when there is no current account at all', () => {
    mockGetState.mockReturnValue({ currentAccount: () => null });
    expect(readAnchorDay()).toBeNull();
  });
});
