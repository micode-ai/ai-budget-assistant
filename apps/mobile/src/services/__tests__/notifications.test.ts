/**
 * `handleNotificationResponse` is a plain function (not a React hook), so —
 * unlike `split.tsx` itself — it's directly testable: call the real function
 * and assert on the `router.push` call it produced.
 */
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ expoConfig: {}, easConfig: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../api', () => ({ api: { updatePushToken: jest.fn() } }));
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: {
    getState: jest.fn(() => ({ currentAccountId: null, accounts: [], switchAccount: jest.fn() })),
  },
}));
jest.mock('@/stores/receiptSplitParticipantIndex', () => ({
  resolveExpenseIdForParticipant: jest.fn(),
}));

import { router } from 'expo-router';
import { handleNotificationResponse } from '../notifications';
import { resolveExpenseIdForParticipant } from '@/stores/receiptSplitParticipantIndex';

const push = router.push as jest.Mock;
const resolveExpenseId = resolveExpenseIdForParticipant as jest.Mock;

function notificationResponse(data: Record<string, unknown>) {
  return {
    notification: { request: { content: { data } } },
  } as unknown as Parameters<typeof handleNotificationResponse>[0];
}

describe('handleNotificationResponse — split_payment_claimed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deep-links straight to the split screen when the participant is known locally', () => {
    resolveExpenseId.mockReturnValue('expense-42');

    handleNotificationResponse(
      notificationResponse({ type: 'split_payment_claimed', participantId: 'participant-1' }),
    );

    expect(resolveExpenseId).toHaveBeenCalledWith('participant-1');
    expect(push).toHaveBeenCalledWith({
      pathname: '/expense/split',
      params: { expenseId: 'expense-42' },
    });
  });

  it('falls back to the expenses list — never a no-op — when the participant is unknown', () => {
    resolveExpenseId.mockReturnValue(undefined);

    handleNotificationResponse(
      notificationResponse({ type: 'split_payment_claimed', participantId: 'participant-unknown' }),
    );

    expect(push).toHaveBeenCalledWith('/(tabs)/expenses');
  });
});
