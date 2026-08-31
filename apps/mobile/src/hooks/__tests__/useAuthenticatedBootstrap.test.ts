// Pins the load-bearing half of the restore-credential feature (ABA-465):
// the delayed re-check that catches every already-signed-in user who will
// never hit a `login()`/`googleLogin()`/`verifyEmail()` call site again.
//
// Tested as a plain function (`runDelayedAuthenticatedBootstrap`), not by
// rendering `useAuthenticatedBootstrap` itself — this codebase has no
// react-test-renderer / @testing-library/react-native dependency (see
// CLAUDE.md), and hooks cannot be invoked outside a React render. The
// `useEffect` in `useAuthenticatedBootstrap` schedules exactly this function
// via `setTimeout`, unwrapped, so pinning this function's behavior pins the
// delayed block's contract: gated on the sync flag, reading the user id from
// the store, not the hook's own argument.

jest.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: jest.fn() },
}));
jest.mock('@/stores/subscriptionStore', () => ({
  useSubscriptionStore: { getState: jest.fn(() => ({ loadSubscription: jest.fn() })) },
}));
jest.mock('@/stores/themeStore', () => ({
  seedLegacyThemeFromLocal: jest.fn(),
}));
jest.mock('@/services/notifications', () => ({
  registerForPushNotifications: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  api: { updateProfile: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/i18n', () => ({ language: 'en' }));
jest.mock('@/features/auth/restoreCredential', () => ({
  registerRestoreCredential: jest.fn(),
}));
jest.mock('@/stores/restoreCredentialStore', () => ({
  restoreCredentialFlag: { hasSynced: jest.fn() },
}));

import { useAuthStore } from '@/stores/authStore';
import { registerForPushNotifications } from '@/services/notifications';
import { api } from '@/services/api';
import { registerRestoreCredential } from '@/features/auth/restoreCredential';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';
import { runDelayedAuthenticatedBootstrap } from '../useAuthenticatedBootstrap';

const mockGetState = useAuthStore.getState as jest.Mock;
const mockHasSynced = restoreCredentialFlag.hasSynced as jest.Mock;
const mockRegister = registerRestoreCredential as jest.Mock;
const mockUpdateProfile = api.updateProfile as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateProfile.mockResolvedValue(undefined);
});

describe('runDelayedAuthenticatedBootstrap', () => {
  it('registers the restore credential, reading the user id from the auth store', () => {
    mockGetState.mockReturnValue({ user: { id: 'u1' } });
    mockHasSynced.mockReturnValue(false);

    runDelayedAuthenticatedBootstrap();

    expect(registerForPushNotifications).toHaveBeenCalledTimes(1);
    expect(api.updateProfile).toHaveBeenCalledWith({ language: 'en' });
    expect(mockHasSynced).toHaveBeenCalledWith('u1');
    expect(mockRegister).toHaveBeenCalledWith('u1');
  });

  // The whole point of this re-check: an already-synced device must not
  // re-register (and re-attest) on every single authenticated launch.
  it('does not register when the flag says this device already synced', () => {
    mockGetState.mockReturnValue({ user: { id: 'u1' } });
    mockHasSynced.mockReturnValue(true);

    runDelayedAuthenticatedBootstrap();

    expect(mockHasSynced).toHaveBeenCalledWith('u1');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('does not register when there is no user id in the store', () => {
    mockGetState.mockReturnValue({ user: null });

    runDelayedAuthenticatedBootstrap();

    expect(mockHasSynced).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  // Push registration and the language sync must not depend on the restore
  // credential outcome — they run regardless of hasSynced.
  it('still registers for push and syncs language when there is no user id', () => {
    mockGetState.mockReturnValue({ user: undefined });

    runDelayedAuthenticatedBootstrap();

    expect(registerForPushNotifications).toHaveBeenCalledTimes(1);
    expect(api.updateProfile).toHaveBeenCalledWith({ language: 'en' });
  });
});
