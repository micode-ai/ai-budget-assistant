import { useAccountStore, getTripDaysLeft } from '../accountStore';
import { api } from '../../services/api';
import { tripApi } from '../../services/trip.api';

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
