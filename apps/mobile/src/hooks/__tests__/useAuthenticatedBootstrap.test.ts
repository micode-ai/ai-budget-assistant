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
  api: { updateProfile: jest.fn().mockResolvedValue(undefined), updateAcquisition: jest.fn() },
}));
jest.mock('@/i18n', () => ({ language: 'en' }));
jest.mock('@/features/auth/restoreCredential', () => ({
  registerRestoreCredential: jest.fn(),
}));
jest.mock('@/stores/restoreCredentialStore', () => ({
  restoreCredentialFlag: { hasSynced: jest.fn() },
}));
jest.mock('@/stores/acquisitionStore', () => ({
  acquisitionFlag: { hasPushed: jest.fn(), markPushed: jest.fn() },
}));
jest.mock('@/services/attribution', () => ({ getAcquisition: jest.fn() }));

import { useAuthStore } from '@/stores/authStore';
import { registerForPushNotifications } from '@/services/notifications';
import { api } from '@/services/api';
import { registerRestoreCredential } from '@/features/auth/restoreCredential';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';
import { acquisitionFlag } from '@/stores/acquisitionStore';
import { getAcquisition } from '@/services/attribution';
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

// Fix round 1 (ABA-553): drains the `.then()/.catch()` chain
// `runDelayedAuthenticatedBootstrap` fires for the acquisition PATCH without
// returning or awaiting it — same shape as `attribution.native.test.ts` /
// `telemetry.native.test.ts`'s own `flushMicrotasks`.
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('acquisition backfill', () => {
  beforeEach(() => {
    // This block's own tests don't care about the user id, but leaving
    // `mockGetState` unset means they'd silently inherit whatever the LAST
    // test of the describe block above happened to leave in the shared mock
    // — `jest.clearAllMocks()` in the top-level `beforeEach` resets call
    // history, not a previously-set `mockReturnValue`. Fix round 1 caught
    // this: running this block in isolation
    // (`-t "acquisition backfill"`) used to throw `Cannot read properties
    // of undefined (reading 'user')` from `useAuthStore.getState().user?.id`.
    mockGetState.mockReturnValue({ user: undefined });
    (api.updateAcquisition as jest.Mock).mockResolvedValue(undefined);
  });

  it('sends the stored acquisition once, for a user who registered before capture existed', () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(false);
    (getAcquisition as jest.Mock).mockReturnValue({
      src: 'google-play',
      loc: 'organic',
      referrerRaw: 'utm_source=google-play&utm_medium=organic',
    });

    runDelayedAuthenticatedBootstrap();

    expect(api.updateAcquisition).toHaveBeenCalledWith({
      src: 'google-play',
      loc: 'organic',
      referrerRaw: 'utm_source=google-play&utm_medium=organic',
    });
  });

  it('does not send twice', () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(true);
    runDelayedAuthenticatedBootstrap();
    expect(api.updateAcquisition).not.toHaveBeenCalled();
  });

  it('sends nothing when there is no referrer to report', () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(false);
    (getAcquisition as jest.Mock).mockReturnValue(undefined);
    runDelayedAuthenticatedBootstrap();
    expect(api.updateAcquisition).not.toHaveBeenCalled();
  });

  // I1 (ABA-553 final review): a web-sourced record can carry `src`/`loc` labels
  // with no `referrerRaw` at all (localStorage, first-touch, no timestamp) — that
  // must NOT be backfilled, or a months-old registration could be retroactively
  // relabelled by whatever the user happens to click today.
  it('sends nothing when the acquisition has labels but no referrerRaw', () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(false);
    (getAcquisition as jest.Mock).mockReturnValue({ src: 'landing', loc: 'hero' });
    runDelayedAuthenticatedBootstrap();
    expect(api.updateAcquisition).not.toHaveBeenCalled();
  });

  // Fix round 1 (ABA-553): the invariant this whole task turns on had no
  // assertion protecting it — moving `markPushed()` ahead of the `.then()`
  // would have passed every test above unchanged. `runDelayedAuthenticatedBootstrap`
  // never awaits the PATCH (deliberately fire-and-forget), so the test drains
  // the promise chain itself via `flushMicrotasks`.
  it('marks pushed only after the request resolves', async () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(false);
    (getAcquisition as jest.Mock).mockReturnValue({
      src: 'google-play',
      referrerRaw: 'utm_source=google-play',
    });
    (api.updateAcquisition as jest.Mock).mockResolvedValue(undefined);

    runDelayedAuthenticatedBootstrap();
    await flushMicrotasks();

    expect(acquisitionFlag.markPushed).toHaveBeenCalledTimes(1);
  });

  it('does not mark pushed when the request rejects, and never throws out of the caller', async () => {
    (acquisitionFlag.hasPushed as jest.Mock).mockReturnValue(false);
    (getAcquisition as jest.Mock).mockReturnValue({
      src: 'google-play',
      referrerRaw: 'utm_source=google-play',
    });
    const failure = new Error('network down');
    // The production `.catch()` is chained synchronously in the same call
    // that produces this rejection, so it must never surface here as an
    // unhandled-rejection warning — test output must stay pristine.
    (api.updateAcquisition as jest.Mock).mockRejectedValue(failure);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => runDelayedAuthenticatedBootstrap()).not.toThrow();
    await flushMicrotasks();

    expect(acquisitionFlag.markPushed).not.toHaveBeenCalled();
    // ABA-157: a fire-and-forget failure warns, it never errors — a red
    // LogBox overlay for a failed analytics write is a bug in this codebase.
    expect(warnSpy).toHaveBeenCalledWith('[Attribution] acquisition backfill failed:', failure);
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
