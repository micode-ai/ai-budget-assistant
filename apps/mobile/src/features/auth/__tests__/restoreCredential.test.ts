jest.mock('@/services/restoreCredentials', () => ({
  createRestoreCredential: jest.fn(),
  getRestoreCredential: jest.fn(),
  clearRestoreCredential: jest.fn(),
  isRestoreCredentialAvailable: jest.fn(),
}));
jest.mock('@/services/api', () => ({ api: {
  getRestoreRegistrationOptions: jest.fn(),
  verifyRestoreRegistration: jest.fn(),
  getRestoreAuthenticationOptions: jest.fn(),
  verifyRestoreAuthentication: jest.fn(),
} }));
jest.mock('@/stores/restoreCredentialStore', () => ({
  restoreCredentialFlag: { hasSynced: jest.fn(), markSynced: jest.fn() },
}));

import {
  createRestoreCredential,
  getRestoreCredential,
  isRestoreCredentialAvailable,
} from '@/services/restoreCredentials';
import { api } from '@/services/api';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';
import {
  registerRestoreCredential,
  attemptRestoreSession,
  RESTORE_TIMEOUT_MS,
} from '../restoreCredential';

const mockIsAvailable = isRestoreCredentialAvailable as jest.Mock;

// Mocks are module-scoped and otherwise accumulate call history across `it`
// blocks (e.g. a `.not.toHaveBeenCalled()` in one test would see a call made
// by an earlier test) — same convention as locationCapture.test.ts.
beforeEach(() => {
  jest.clearAllMocks();
  // The overwhelming majority of these tests exercise the "bridge is
  // available" path (real device or the test simulating one) — only the
  // dedicated availability-gate tests below flip this to false.
  mockIsAvailable.mockReturnValue(true);
});

describe('registerRestoreCredential', () => {
  it('posts the attestation and marks the user synced', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (createRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreRegistration as jest.Mock).mockResolvedValue({ ok: true });

    await registerRestoreCredential('u1');

    expect(createRestoreCredential).toHaveBeenCalledWith(JSON.stringify({ challenge: 'c' }));
    expect(api.verifyRestoreRegistration).toHaveBeenCalledWith({ id: 'cred' });
    expect(restoreCredentialFlag.markSynced).toHaveBeenCalledWith('u1');
  });

  // The flag is what stops a retry on the next launch. Setting it on a failed
  // attempt would mean the user never gets a credential and nothing ever tries again.
  it('does not mark synced when the bridge returns null', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (createRestoreCredential as jest.Mock).mockResolvedValue(null);

    await registerRestoreCredential('u1');

    expect(api.verifyRestoreRegistration).not.toHaveBeenCalled();
    expect(restoreCredentialFlag.markSynced).not.toHaveBeenCalled();
  });

  it('does not mark synced when the server rejects the attestation', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (createRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreRegistration as jest.Mock).mockRejectedValue(new Error('400'));

    await expect(registerRestoreCredential('u1')).resolves.toBeUndefined();
    expect(restoreCredentialFlag.markSynced).not.toHaveBeenCalled();
  });

  it('never throws when fetching options fails', async () => {
    (api.getRestoreRegistrationOptions as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(registerRestoreCredential('u1')).resolves.toBeUndefined();
  });

  // A second sign-in-triggered call site (direct call from login/googleLogin/
  // verifyEmail plus useAuthenticatedBootstrap's delayed re-check) racing the
  // first must not double-register: two attestations for one device.
  describe('concurrent calls', () => {
    it('ignores a second call while the first is still in flight', async () => {
      (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
      let resolveCreate!: (v: string) => void;
      (createRestoreCredential as jest.Mock).mockReturnValue(
        new Promise<string>((resolve) => {
          resolveCreate = resolve;
        }),
      );
      (api.verifyRestoreRegistration as jest.Mock).mockResolvedValue({ ok: true });

      const first = registerRestoreCredential('u1');
      const second = registerRestoreCredential('u1');

      resolveCreate('{"id":"cred"}');
      await Promise.all([first, second]);

      expect(api.getRestoreRegistrationOptions).toHaveBeenCalledTimes(1);
      expect(createRestoreCredential).toHaveBeenCalledTimes(1);
      expect(restoreCredentialFlag.markSynced).toHaveBeenCalledTimes(1);
    });

    it('releases the guard afterwards so a later call proceeds', async () => {
      (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
      (createRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
      (api.verifyRestoreRegistration as jest.Mock).mockResolvedValue({ ok: true });

      await registerRestoreCredential('u1');
      await registerRestoreCredential('u1');

      expect(api.getRestoreRegistrationOptions).toHaveBeenCalledTimes(2);
      expect(restoreCredentialFlag.markSynced).toHaveBeenCalledTimes(2);
    });

    // The guard must release even when the in-flight attempt fails, or one
    // failed registration would permanently block every later retry.
    it('releases the guard after a failure so a later call proceeds', async () => {
      (api.getRestoreRegistrationOptions as jest.Mock)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ challenge: 'c' });
      (createRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
      (api.verifyRestoreRegistration as jest.Mock).mockResolvedValue({ ok: true });

      await registerRestoreCredential('u1');
      expect(restoreCredentialFlag.markSynced).not.toHaveBeenCalled();

      await registerRestoreCredential('u1');
      expect(restoreCredentialFlag.markSynced).toHaveBeenCalledTimes(1);
    });

    // The guard must release even when the network call itself stalls
    // forever, not just when it settles (success or failure) — otherwise a
    // single stalled registration leaves `registrationInFlight` stuck `true`
    // for the rest of the process: the 1500ms launch re-check silently
    // no-ops on every later authenticated launch, and so does every later
    // direct sign-in call, including as a different user (the guard is
    // global, not per-userId).
    it('gives up after the timeout instead of leaving the guard stuck, so a later call is not blocked', async () => {
      jest.useFakeTimers();
      (api.getRestoreRegistrationOptions as jest.Mock).mockReturnValue(new Promise(() => {}));

      const p = registerRestoreCredential('u1');
      await jest.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS);

      await expect(p).resolves.toBeUndefined();
      jest.useRealTimers();

      // Guard released — a subsequent call proceeds rather than no-oping.
      (api.getRestoreRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
      (createRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
      (api.verifyRestoreRegistration as jest.Mock).mockResolvedValue({ ok: true });

      await registerRestoreCredential('u1');
      expect(restoreCredentialFlag.markSynced).toHaveBeenCalledWith('u1');
    });
  });
});

describe('attemptRestoreSession', () => {
  it('returns the session when the assertion verifies', async () => {
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreAuthentication as jest.Mock).mockResolvedValue({ accessToken: 'a' });

    await expect(attemptRestoreSession()).resolves.toEqual({ accessToken: 'a' });
  });

  it('returns null when the device has no credential', async () => {
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockResolvedValue(null);

    await expect(attemptRestoreSession()).resolves.toBeNull();
    expect(api.verifyRestoreAuthentication).not.toHaveBeenCalled();
  });

  // This runs before the first screen is drawn. A hung native call without a
  // timeout freezes the app on the splash screen.
  it('gives up after the timeout instead of hanging the boot', async () => {
    jest.useFakeTimers();
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockReturnValue(new Promise(() => {}));

    const p = attemptRestoreSession();
    await jest.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS);

    await expect(p).resolves.toBeNull();
    jest.useRealTimers();
  });

  // The timeout used to wrap only the bridge call in the middle of the flow —
  // a stall in the server call that BRACKETS it (getRestoreAuthenticationOptions
  // runs first, unbounded) hung forever. `fetch` has no AbortController here
  // and RN's OkHttp has no configured read/connect timeout, so this is a real
  // failure mode, not a hypothetical one.
  it('gives up after the timeout even when fetching options never settles', async () => {
    jest.useFakeTimers();
    (api.getRestoreAuthenticationOptions as jest.Mock).mockReturnValue(new Promise(() => {}));

    const p = attemptRestoreSession();
    await jest.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS);

    await expect(p).resolves.toBeNull();
    expect(getRestoreCredential).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('returns null when the server rejects the assertion', async () => {
    (api.getRestoreAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'c' });
    (getRestoreCredential as jest.Mock).mockResolvedValue('{"id":"cred"}');
    (api.verifyRestoreAuthentication as jest.Mock).mockRejectedValue(new Error('401'));

    await expect(attemptRestoreSession()).resolves.toBeNull();
  });
});

// iOS, web, and an Android build whose native module failed to register all
// report unavailable. Without this gate, EVERY logged-out cold start and
// EVERY sign-in on those platforms would call the server (options + verify)
// only to throw the result away — forever, for the whole non-Android install
// base.
describe('availability gate', () => {
  it('registerRestoreCredential calls no API when the bridge is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);

    await registerRestoreCredential('u1');

    expect(api.getRestoreRegistrationOptions).not.toHaveBeenCalled();
    expect(createRestoreCredential).not.toHaveBeenCalled();
    expect(restoreCredentialFlag.markSynced).not.toHaveBeenCalled();
  });

  it('attemptRestoreSession calls no API when the bridge is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);

    await expect(attemptRestoreSession()).resolves.toBeNull();

    expect(api.getRestoreAuthenticationOptions).not.toHaveBeenCalled();
    expect(getRestoreCredential).not.toHaveBeenCalled();
  });
});
