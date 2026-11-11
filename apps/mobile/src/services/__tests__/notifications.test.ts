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
jest.mock('../api', () => ({
  api: { updatePushToken: jest.fn(), markLeafletPushOpened: jest.fn(() => Promise.resolve()) },
}));
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
import { api } from '../api';

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

describe('handleNotificationResponse — split_item_flagged (ABA guest-split-item-dispute)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the participant id the same way split_payment_claimed does, and deep-links to the split screen', () => {
    resolveExpenseId.mockReturnValue('expense-42');

    handleNotificationResponse(
      notificationResponse({ type: 'split_item_flagged', participantId: 'participant-1' }),
    );

    expect(resolveExpenseId).toHaveBeenCalledWith('participant-1');
    expect(push).toHaveBeenCalledWith({
      pathname: '/expense/split',
      params: { expenseId: 'expense-42' },
    });
  });

  it('falls back to the expenses list when the participant is unknown locally', () => {
    resolveExpenseId.mockReturnValue(undefined);

    handleNotificationResponse(
      notificationResponse({ type: 'split_item_flagged', participantId: 'participant-unknown' }),
    );

    expect(push).toHaveBeenCalledWith('/(tabs)/expenses');
  });
});

describe('handleNotificationResponse — group pushes (ABA-653)', () => {
  beforeEach(() => push.mockClear());

  it('group_activity opens the group', () => {
    handleNotificationResponse(notificationResponse({ type: 'group_activity', groupId: 'g1' }));
    expect(push).toHaveBeenCalledWith('/groups/g1');
  });

  it('a debtor reminder opens the settle screen on the suggested pair', () => {
    handleNotificationResponse(
      notificationResponse({ type: 'group_reminder', groupId: 'g1', reminder: 'owe', fromMemberId: 'a', toMemberId: 'b' }),
    );
    expect(push).toHaveBeenCalledWith({ pathname: '/groups/g1/settle', params: { from: 'a', to: 'b' } });
  });

  it('a creditor reminder opens Record a payment', () => {
    handleNotificationResponse(notificationResponse({ type: 'group_reminder', groupId: 'g1', reminder: 'owed' }));
    expect(push).toHaveBeenCalledWith('/groups/g1/settle');
  });
});

describe('handleNotificationResponse — activation_nudge (ABA-737)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the receipt scanner, the entry new users are steered to', () => {
    handleNotificationResponse(notificationResponse({ type: 'activation_nudge' }));
    expect(push).toHaveBeenCalledWith('/expense/receipt');
  });
});

// R14: the push opens the leaflet screen in its idle state (the list of active leaflets), never
// the photo gallery — `from=push` is what tells the screen not to open the picker.
const LEAFLETS_FROM_PUSH = { pathname: '/leaflets', params: { from: 'push' } };

describe('handleNotificationResponse — leaflet_promo (Gazetka match)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the leaflet screen and reports the open with its pushKey', () => {
    handleNotificationResponse(notificationResponse({ type: 'leaflet_promo', pushKey: 'log-1' }));
    expect(push).toHaveBeenCalledWith(LEAFLETS_FROM_PUSH);
    expect(api.markLeafletPushOpened).toHaveBeenCalledWith('log-1');
  });

  it('still opens the screen without a pushKey, and reports nothing', () => {
    handleNotificationResponse(notificationResponse({ type: 'leaflet_promo' }));
    expect(push).toHaveBeenCalledWith(LEAFLETS_FROM_PUSH);
    expect(api.markLeafletPushOpened).not.toHaveBeenCalled();
  });

  it('a failed open report never throws into the tap handler', async () => {
    (api.markLeafletPushOpened as jest.Mock).mockReturnValueOnce(Promise.reject(new Error('offline')));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => handleNotificationResponse(notificationResponse({ type: 'leaflet_promo', pushKey: 'log-2' }))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(push).toHaveBeenCalledWith(LEAFLETS_FROM_PUSH);
    warn.mockRestore();
  });
});
