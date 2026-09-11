// Pins the one rule in `useAlertTapThrough` whose correctness is an ORDERING
// rather than a value: `markRead` fires only once the alert's target has
// actually opened, never when the row is tapped.
//
// Why that matters, and why it is worth a test rather than a comment: both
// desktop alert surfaces build their list from `selectUnreadAlerts`, so marking
// an alert read REMOVES its row. `openAlertTargets` may first spend a whole
// forced `loadExpenses({ force: true })` round trip resolving the expense, with
// an inline spinner attached to that row. Marking up front deletes the row and
// its spinner mid-action and leaves the user looking at nothing for the length
// of the pull — a dead click. It was found the hard way once on the attention
// panel; this extraction had to carry it to the alerts panel intact.
//
// The production change this catches is one line moving: hoisting
// `markHandled()` out of the `navigate` callback and up beside the
// `openAlertTargets` call. Nothing else in this repo can observe that — no
// component is rendered in CI, and the two orderings produce identical types,
// identical lint output and an identical final state.
//
// Driven through `react-test-renderer`, a version-pinned direct dependency of
// `jest-expo`, exactly as `useVoiceInput.test.ts` already does and for the same
// reason: the fact under test is a lifecycle/ordering fact, and a hand-rolled
// fake of `useState` would only prove the fake agreed with itself. `Probe`
// renders `null`; nothing here asserts anything about UI.

const mockMarkRead = jest.fn();
const mockDismiss = jest.fn();
const mockLoadMembers = jest.fn();
const mockUpdateExpense = jest.fn();

/** Captured from the mocked `openAlertTargets`, so the test decides WHEN the
 *  target resolves — which is the whole point. */
let capturedNavigate: (() => void) | null = null;
const mockOpenAlertTargets = jest.fn(
  async (_alert: unknown, _ids: unknown, navigate: () => void) => {
    capturedNavigate = navigate;
  },
);

jest.mock('@/features/alerts/resolveAlertExpense', () => ({
  openAlertTargets: (...args: [unknown, unknown, () => void, unknown]) =>
    mockOpenAlertTargets(args[0], args[1], args[2]),
  findAlertExpense: () => ({ id: 'e1', isDeleted: false }),
}));

jest.mock('@/stores/alertStore', () => ({
  useAlertStore: (selector: (s: unknown) => unknown) =>
    selector({ markRead: mockMarkRead, dismiss: mockDismiss }),
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: (selector: (s: unknown) => unknown) =>
    selector({
      currentAccount: () => ({ id: 'acc1', type: 'personal' }),
      members: {},
      loadMembers: mockLoadMembers,
    }),
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { currencyCode: 'USD' } }) },
}));
jest.mock('@/stores/userSubscriptionStore', () => ({
  useUserSubscriptionStore: { getState: () => ({ createSubscription: jest.fn() }) },
}));
// The real module transitively requires `src/i18n/index.ts` (via
// `utils/entityLabel.ts`), which calls `i18n.use(initReactI18next)` — and
// this file's own `react-i18next` mock below only exports `useTranslation`,
// so a real import here fails with "You are passing an undefined module!"
// long before any test body runs. Mocked the same way every other store in
// this file is.
jest.mock('@/stores/expenseStore', () => ({
  useExpenseStore: { getState: () => ({ updateExpense: mockUpdateExpense }) },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { AnomalyAlert } from '@budget/shared-types';
import { useAlertTapThrough, type AlertTapThrough } from '../useAlertTapThrough';

function alert(over: Partial<AnomalyAlert> = {}): AnomalyAlert {
  return {
    id: 'a1',
    accountId: 'acc1',
    type: 'duplicate_charge',
    params: {},
    expenseId: 'e1',
    readAt: null,
    dismissedAt: null,
    createdAt: '2026-09-06T10:00:00Z',
    ...over,
  } as AnomalyAlert;
}

/** Minimal hook driver — `Probe` exists only to give the hook a render to live in. */
function renderTapThrough(canEdit = true) {
  let hook!: AlertTapThrough;
  function Probe() {
    hook = useAlertTapThrough({ canEdit });
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    get current(): AlertTapThrough {
      return hook;
    },
    rerender: () =>
      act(() => {
        renderer.update(createElement(Probe));
      }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedNavigate = null;
});

describe('useAlertTapThrough — the markRead ordering rule', () => {
  it('does NOT mark the alert read when the row is tapped', async () => {
    const view = renderTapThrough();
    await act(async () => {
      view.current.onAlertPress(alert());
    });

    expect(mockOpenAlertTargets).toHaveBeenCalledTimes(1);
    // The row is still on screen, still explained, still spinning if the pull
    // is slow. Marking read here would have removed it.
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('marks it read once, only after the target actually opens', async () => {
    const view = renderTapThrough();
    await act(async () => {
      view.current.onAlertPress(alert());
    });
    expect(mockMarkRead).not.toHaveBeenCalled();

    await act(async () => {
      capturedNavigate?.();
    });

    expect(mockMarkRead).toHaveBeenCalledTimes(1);
    expect(mockMarkRead).toHaveBeenCalledWith('a1');
  });

  it('never marks read for a viewer, who cannot write', async () => {
    const view = renderTapThrough(false);
    await act(async () => {
      view.current.onAlertPress(alert());
    });
    await act(async () => {
      capturedNavigate?.();
    });
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('opens the expense dialog only after the target resolves', async () => {
    const view = renderTapThrough();
    expect(view.current.dialogProps).toBeNull();

    await act(async () => {
      view.current.onAlertPress(alert());
    });
    view.rerender();
    // Still nothing: the id has not resolved yet, so there is no row to host.
    expect(view.current.dialogProps).toBeNull();

    await act(async () => {
      capturedNavigate?.();
    });
    view.rerender();
    expect(view.current.dialogProps).not.toBeNull();
    expect(view.current.dialogProps?.canEdit).toBe(true);
  });
});

describe('useAlertTapThrough — onMarkRecurring (recurring-bill-detection-nudge)', () => {
  const recurringAlert = alert({
    type: 'recurring_suggestion',
    id: 'a9',
    expenseId: 'e9',
    params: { merchant: 'Mieszkanie', amount: '4374.18', currencyCode: 'PLN', cycle: 'monthly' },
  });

  it('writes the recurring patch to the alert\'s own expense and dismisses', () => {
    const view = renderTapThrough();
    view.current.onMarkRecurring(recurringAlert);

    expect(mockUpdateExpense).toHaveBeenCalledTimes(1);
    const [expenseId, patch] = mockUpdateExpense.mock.calls[0];
    expect(expenseId).toBe('e9');
    expect(patch).toMatchObject({ isRecurring: true, recurringPeriod: 'monthly' });
    expect(typeof patch.recurringId).toBe('string');
    expect(mockDismiss).toHaveBeenCalledWith('a9');
  });

  it('does nothing when the alert cannot honestly build an update', () => {
    // Wrong type — `buildMarkRecurringUpdate` returns null.
    const view = renderTapThrough();
    view.current.onMarkRecurring(alert({ type: 'duplicate_charge' }));
    expect(mockUpdateExpense).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });
});

describe('useAlertTapThrough — rows with nothing to open', () => {
  it('does nothing at all for a recurring suggestion, whose own button owns the action', async () => {
    // `alertAction` returns 'track' here. A stray click on the row body must
    // not create a subscription, and must not consume the alert either.
    const view = renderTapThrough();
    await act(async () => {
      view.current.onAlertPress(alert({ type: 'recurring_suggestion' }));
    });
    expect(mockOpenAlertTargets).not.toHaveBeenCalled();
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('does nothing for an alert carrying no expense', async () => {
    const view = renderTapThrough();
    await act(async () => {
      view.current.onAlertPress(alert({ expenseId: null }));
    });
    expect(mockOpenAlertTargets).not.toHaveBeenCalled();
  });
});
