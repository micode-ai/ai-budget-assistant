import { useTripStore } from '../tripStore';
import { tripApi } from '../../services/trip.api';

jest.mock('../../services/trip.api', () => ({
  tripApi: {
    getSettleUp: jest.fn(),
    payDebt: jest.fn(),
    confirmPayment: jest.fn(),
  },
}));

describe('tripStore', () => {
  beforeEach(() => {
    useTripStore.setState({
      balances: [],
      suggestedTransfers: [],
      pendingTransactions: [],
      isLoading: false,
    });
    jest.clearAllMocks();
  });

  it('loadSettleUp populates balances and suggestedTransfers', async () => {
    (tripApi.getSettleUp as jest.Mock).mockResolvedValue({
      balances: [{ userId: 'alice', userName: 'Alice', netAmount: 60 }],
      suggestedTransfers: [{ fromUserId: 'bob', toUserId: 'alice', amount: 60 }],
      currencyCode: 'USD',
      fxApproximate: false,
      pendingTransactions: [],
    });

    await useTripStore.getState().loadSettleUp('acc-1');

    expect(useTripStore.getState().balances).toHaveLength(1);
    expect(useTripStore.getState().suggestedTransfers).toHaveLength(1);
    expect(useTripStore.getState().isLoading).toBe(false);
  });

  it('loadSettleUp populates pendingTransactions from the server response', async () => {
    const pendingTxn = {
      id: 'txn-1',
      accountId: 'acc-1',
      fromUserId: 'bob',
      toUserId: 'alice',
      amount: 60,
      method: null,
      status: 'pending',
      confirmedAt: null,
      createdAt: '2026-06-15T00:00:00.000Z',
    };
    (tripApi.getSettleUp as jest.Mock).mockResolvedValue({
      balances: [{ userId: 'alice', userName: 'Alice', netAmount: 60 }],
      suggestedTransfers: [{ fromUserId: 'bob', toUserId: 'alice', amount: 60 }],
      currencyCode: 'USD',
      fxApproximate: false,
      pendingTransactions: [pendingTxn],
    });

    await useTripStore.getState().loadSettleUp('acc-1');

    expect(useTripStore.getState().pendingTransactions).toEqual([pendingTxn]);
  });

  it('loadSettleUp defaults pendingTransactions to an empty array when the response omits it', async () => {
    (tripApi.getSettleUp as jest.Mock).mockResolvedValue({
      balances: [],
      suggestedTransfers: [],
      currencyCode: 'USD',
      fxApproximate: false,
    });

    await useTripStore.getState().loadSettleUp('acc-1');

    expect(useTripStore.getState().pendingTransactions).toEqual([]);
  });

  it('payDebt returns the payment response from the API', async () => {
    (tripApi.payDebt as jest.Mock).mockResolvedValue({
      transactionId: 'txn-1',
      paymentLink: 'https://revolut.me/jdoe?amount=60&currency=USD',
      manualInstructions: false,
      paymentHandle: 'jdoe',
    });

    const result = await useTripStore.getState().payDebt('acc-1', 'bob', 'alice', 60);
    expect(result.paymentLink).toContain('revolut.me');
  });
});
