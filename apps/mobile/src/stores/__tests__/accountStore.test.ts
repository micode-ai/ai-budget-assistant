import { useAccountStore, getTripDaysLeft } from '../accountStore';
import { api } from '../../services/api';
import { tripApi } from '../../services/trip.api';
import { loadAllAccounts, insertAccount } from '../../db/accountRepository';
import { secureStorage } from '../../services/secureStorage';

// Manual factory (not bare automock): automocking still `require()`s the real
// module to infer its shape, which would pull in `./client` -> expo-sqlite's
// native `openDatabaseSync` and crash outside a real app runtime.
jest.mock('../../db/accountRepository', () => ({
  loadAllAccounts: jest.fn().mockResolvedValue([]),
  insertAccounts: jest.fn().mockResolvedValue(undefined),
  updateAccountInDb: jest.fn().mockResolvedValue(undefined),
  deleteAccountFromDb: jest.fn().mockResolvedValue(undefined),
  insertAccount: jest.fn().mockResolvedValue(undefined),
  loadMembersByAccountId: jest.fn().mockResolvedValue([]),
  insertMembers: jest.fn().mockResolvedValue(undefined),
  deleteMembersByAccountId: jest.fn().mockResolvedValue(undefined),
  clearAllAccounts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseRepository', () => ({
  clearAllExpenses: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/walletRepository', () => ({
  clearAllWalletBalances: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/currencyExchangeRepository', () => ({
  clearAllExchanges: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/api', () => ({
  api: {
    createAccount: jest.fn(),
    updateAccount: jest.fn(),
    deleteAccount: jest.fn(),
    getAccounts: jest.fn(),
    setAccountIdGetter: jest.fn(),
  },
}));

jest.mock('../../services/trip.api', () => ({
  tripApi: {
    archiveTrip: jest.fn(),
    updatePaymentInfo: jest.fn(),
  },
}));

describe('getTripDaysLeft', () => {
  it('returns null for non-trip accounts', () => {
    expect(getTripDaysLeft({ type: 'shared' } as any)).toBeNull();
  });

  it('computes days remaining for an active trip', () => {
    const tripEndDate = new Date();
    tripEndDate.setDate(tripEndDate.getDate() + 5);
    expect(
      getTripDaysLeft({ type: 'trip', tripStatus: 'active', tripEndDate: tripEndDate.toISOString() } as any),
    ).toBe(5);
  });

  it('returns 0 when the trip ends today', () => {
    expect(
      getTripDaysLeft({ type: 'trip', tripStatus: 'active', tripEndDate: new Date().toISOString() } as any),
    ).toBe(0);
  });
});

describe('accountStore trip actions', () => {
  beforeEach(() => {
    useAccountStore.setState({
      accounts: [],
      currentAccountId: null,
      members: {},
      isLoading: false,
      error: null,
    });
    jest.clearAllMocks();
  });

  it('createTripAccount calls api.createAccount with type "trip" and appends the result with myRole owner', async () => {
    const serverAccount = {
      id: 'trip-1',
      name: 'Bali Trip',
      type: 'trip',
      currencyCode: 'USD',
      ownerId: 'user-1',
      isActive: true,
      tripStartDate: '2026-08-01',
      tripEndDate: '2026-08-10',
      tripStatus: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (api.createAccount as jest.Mock).mockResolvedValue(serverAccount);
    // Mirrors what a real insertAccount + loadAllAccounts round trip through
    // SQLite would return — the persisted source of truth loadAccounts()
    // re-reads on every hydration cycle (app resume, tab focus, pull-to-
    // refresh). Without insertAccount actually persisting the new trip
    // account, the next such reload wiped it from the in-memory list.
    (loadAllAccounts as jest.Mock).mockResolvedValue([
      { ...serverAccount, myRole: 'owner' },
    ]);

    const result = await useAccountStore
      .getState()
      .createTripAccount('Bali Trip', '2026-08-10', 'USD', '2026-08-01');

    expect(api.createAccount).toHaveBeenCalledWith({
      name: 'Bali Trip',
      type: 'trip',
      currencyCode: 'USD',
      tripEndDate: '2026-08-10',
      tripStartDate: '2026-08-01',
    });
    expect(insertAccount).toHaveBeenCalledWith(serverAccount, 'owner', undefined);
    expect(result).toBe(serverAccount);
    expect(useAccountStore.getState().accounts).toHaveLength(1);
    expect(useAccountStore.getState().accounts[0]).toMatchObject({
      id: 'trip-1',
      myRole: 'owner',
      tripStatus: 'active',
    });
    expect(useAccountStore.getState().isLoading).toBe(false);
  });

  it('createTripAccount sets error and rethrows on failure', async () => {
    (api.createAccount as jest.Mock).mockRejectedValue(new Error('boom'));

    await expect(
      useAccountStore.getState().createTripAccount('Bali Trip', '2026-08-10', 'USD'),
    ).rejects.toThrow('boom');

    expect(useAccountStore.getState().error).toBe('boom');
    expect(useAccountStore.getState().isLoading).toBe(false);
  });

  it('archiveTrip calls tripApi.archiveTrip and merges the returned account into state', async () => {
    useAccountStore.setState({
      accounts: [
        {
          id: 'trip-1',
          name: 'Bali Trip',
          type: 'trip',
          currencyCode: 'USD',
          ownerId: 'user-1',
          isActive: true,
          tripStatus: 'active',
          myRole: 'owner',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ],
    });
    (tripApi.archiveTrip as jest.Mock).mockResolvedValue({
      id: 'trip-1',
      tripStatus: 'archived',
    });

    await useAccountStore.getState().archiveTrip('trip-1', true);

    expect(tripApi.archiveTrip).toHaveBeenCalledWith('trip-1', true);
    expect(useAccountStore.getState().accounts[0]).toMatchObject({
      id: 'trip-1',
      tripStatus: 'archived',
      myRole: 'owner', // preserved from prior local state
    });
    expect(useAccountStore.getState().isLoading).toBe(false);
  });

  it('archiveTrip sets error and rethrows on failure', async () => {
    (tripApi.archiveTrip as jest.Mock).mockRejectedValue(new Error('cannot archive'));

    await expect(useAccountStore.getState().archiveTrip('trip-1')).rejects.toThrow(
      'cannot archive',
    );

    expect(useAccountStore.getState().error).toBe('cannot archive');
    expect(useAccountStore.getState().isLoading).toBe(false);
  });

  it('updatePaymentInfo calls tripApi.updatePaymentInfo with the DTO shape', async () => {
    (tripApi.updatePaymentInfo as jest.Mock).mockResolvedValue({
      paymentMethod: 'revolut',
      paymentHandle: '@jdoe',
    });

    await useAccountStore.getState().updatePaymentInfo('trip-1', 'revolut', '@jdoe');

    expect(tripApi.updatePaymentInfo).toHaveBeenCalledWith('trip-1', {
      paymentMethod: 'revolut',
      paymentHandle: '@jdoe',
    });
  });
});

describe('accountStore canEdit', () => {
  beforeEach(() => {
    useAccountStore.setState({
      accounts: [],
      currentAccountId: null,
      members: {},
      isLoading: false,
      error: null,
    });
  });

  function setCurrentAccount(overrides: Record<string, unknown>) {
    useAccountStore.setState({
      accounts: [
        {
          id: 'acc-1',
          name: 'Trip',
          type: 'trip',
          currencyCode: 'USD',
          ownerId: 'user-1',
          isActive: true,
          myRole: 'owner',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...overrides,
        } as any,
      ],
      currentAccountId: 'acc-1',
    });
  }

  it('returns false when there is no current account', () => {
    expect(useAccountStore.getState().canEdit()).toBe(false);
  });

  it('returns true for an owner on a non-archived trip', () => {
    setCurrentAccount({ myRole: 'owner', tripStatus: 'active' });
    expect(useAccountStore.getState().canEdit()).toBe(true);
  });

  it('returns false for a viewer', () => {
    setCurrentAccount({ myRole: 'viewer', tripStatus: 'active' });
    expect(useAccountStore.getState().canEdit()).toBe(false);
  });

  it('returns false for an owner/editor once the trip is archived', () => {
    setCurrentAccount({ myRole: 'owner', tripStatus: 'archived' });
    expect(useAccountStore.getState().canEdit()).toBe(false);

    setCurrentAccount({ myRole: 'editor', tripStatus: 'archived' });
    expect(useAccountStore.getState().canEdit()).toBe(false);
  });

  it('is unaffected by tripStatus on non-trip accounts (field is undefined)', () => {
    setCurrentAccount({ type: 'shared', myRole: 'editor', tripStatus: undefined });
    expect(useAccountStore.getState().canEdit()).toBe(true);
  });
});

// The SQLite read-back after a write returns nothing on web, where the DB client
// is an in-memory no-op mock. Assigning that straight into state blanked the
// account list and stranded the user on "Account not found" right after saving.
// `loadAllAccounts` is already mocked to resolve `[]` here, so these tests run
// under exactly that condition.
describe('accountStore write paths survive an empty SQLite read-back (web)', () => {
  const seeded = {
    id: 'acc-1',
    name: 'Personal',
    type: 'personal',
    currencyCode: 'PLN',
    ownerId: 'user-1',
    isActive: true,
    myRole: 'owner',
    monthAnchorDay: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (loadAllAccounts as jest.Mock).mockResolvedValue([]);
    useAccountStore.setState({
      accounts: [{ ...seeded } as any],
      currentAccountId: 'acc-1',
      members: {},
      isLoading: false,
      error: null,
    });
  });

  it('keeps the account and applies the change after updateAccount', async () => {
    (api.updateAccount as jest.Mock).mockResolvedValue({ ...seeded, monthAnchorDay: 10 });

    await useAccountStore.getState().updateAccount('acc-1', { monthAnchorDay: 10 } as any);

    const { accounts } = useAccountStore.getState();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe('acc-1');
    expect((accounts[0] as any).monthAnchorDay).toBe(10);
    expect(accounts[0].myRole).toBe('owner');
  });

  it('keeps the other accounts after deleteAccount removes one', async () => {
    useAccountStore.setState({
      accounts: [{ ...seeded } as any, { ...seeded, id: 'acc-2', name: 'Family' } as any],
      currentAccountId: 'acc-1',
    });
    (api.deleteAccount as jest.Mock).mockResolvedValue(undefined);

    await useAccountStore.getState().deleteAccount('acc-2');

    const { accounts } = useAccountStore.getState();
    expect(accounts.map((a) => a.id)).toEqual(['acc-1']);
  });

  it('adds the new account after createAccount instead of blanking the list', async () => {
    (api.createAccount as jest.Mock).mockResolvedValue({
      ...seeded,
      id: 'acc-3',
      name: 'Business',
    });

    await useAccountStore.getState().createAccount({ name: 'Business' } as any);

    const { accounts } = useAccountStore.getState();
    expect(accounts.map((a) => a.id).sort()).toEqual(['acc-1', 'acc-3']);
  });

  it('still prefers SQLite when it actually returns rows (native)', async () => {
    (loadAllAccounts as jest.Mock).mockResolvedValue([
      { ...seeded, name: 'From SQLite', monthAnchorDay: 10 },
    ]);
    (api.updateAccount as jest.Mock).mockResolvedValue({ ...seeded, monthAnchorDay: 10 });

    await useAccountStore.getState().updateAccount('acc-1', { monthAnchorDay: 10 } as any);

    expect(useAccountStore.getState().accounts[0].name).toBe('From SQLite');
  });
});

describe('the selected account survives a web page refresh', () => {
  // `loadAccounts` reads the persisted selection, but only AFTER its
  // zero-local-rows branch — and on web `db/client.web.ts` is an in-memory
  // mock, so `loadAllAccounts` always returns [] and that branch always
  // returns early. `loadAccountsFromServer` is therefore the only path that
  // runs on web, and it took `currentAccountId` from memory, which is null on
  // a fresh page load. Result: every refresh reset the user to the first
  // account. These tests pin the read, not the write — the write was already
  // fine (secureStorage.web.ts is localStorage and survives a refresh).
  const acc = (id: string, name: string) => ({
    id,
    name,
    type: 'personal',
    currencyCode: 'PLN',
    ownerId: 'user-1',
    isActive: true,
    myRole: 'owner',
    monthAnchorDay: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (loadAllAccounts as jest.Mock).mockResolvedValue([]); // web: no SQLite
    (api.getAccounts as jest.Mock).mockResolvedValue([acc('acc-1', 'Personal'), acc('acc-2', 'Family')]);
    useAccountStore.setState({
      accounts: [],
      currentAccountId: null, // a fresh page load has nothing in memory
      members: {},
      isLoading: false,
      error: null,
    });
  });

  it('restores the stored selection instead of falling back to the first account', async () => {
    (secureStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === 'currentAccountId' ? 'acc-2' : null,
    );

    await useAccountStore.getState().loadAccountsFromServer();

    expect(useAccountStore.getState().currentAccountId).toBe('acc-2');
  });

  it('falls back to the first account when nothing was stored', async () => {
    (secureStorage.getItem as jest.Mock).mockResolvedValue(null);

    await useAccountStore.getState().loadAccountsFromServer();

    expect(useAccountStore.getState().currentAccountId).toBe('acc-1');
  });

  it('does not resurrect an account the user is no longer a member of, and clears it from storage', async () => {
    (secureStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === 'currentAccountId' ? 'acc-gone' : null,
    );

    await useAccountStore.getState().loadAccountsFromServer();

    expect(useAccountStore.getState().currentAccountId).toBe('acc-1');
    // The dead id must not be left behind, or every later refresh repeats this
    // lookup against an account that no longer exists (deleteAccount already
    // re-persists on fallback for the same reason).
    expect(secureStorage.setItem).toHaveBeenCalledWith('currentAccountId', 'acc-1');
  });

  it('keeps a live in-memory selection rather than an older stored one', async () => {
    // The other callers of loadAccountsFromServer -- accepting an invitation,
    // and Settings -> "Sync now" -- run with a selection already made. Storage
    // must not win there.
    useAccountStore.setState({ currentAccountId: 'acc-2' });
    (secureStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === 'currentAccountId' ? 'acc-1' : null,
    );

    await useAccountStore.getState().loadAccountsFromServer();

    expect(useAccountStore.getState().currentAccountId).toBe('acc-2');
  });
});
