import {
  createRestoreCredential,
  getRestoreCredential,
  clearRestoreCredential,
  isRestoreCredentialAvailable,
} from '../index.ios';

// The stubs exist so call sites need no platform branching. If one of them
// ever rejects instead of resolving, an unhandled rejection surfaces during
// app boot on iOS — the one platform where this feature does nothing at all.
describe('restoreCredentials stubs', () => {
  it('resolve null rather than rejecting', async () => {
    await expect(createRestoreCredential('{}')).resolves.toBeNull();
    await expect(getRestoreCredential('{}')).resolves.toBeNull();
    await expect(clearRestoreCredential()).resolves.toBeUndefined();
  });

  // The orchestration layer checks this BEFORE calling the server, so this
  // being `false` is what stops iOS/web from ever issuing a restore-credential
  // API call in the first place.
  it('isRestoreCredentialAvailable is false', () => {
    expect(isRestoreCredentialAvailable()).toBe(false);
  });
});
