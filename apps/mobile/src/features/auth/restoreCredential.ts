import type { AuthResponse } from '@budget/shared-types';
import {
  createRestoreCredential,
  getRestoreCredential,
  isRestoreCredentialAvailable,
} from '@/services/restoreCredentials';
import { api } from '@/services/api';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';

/**
 * Shared timeout for both flows below — each bounds the WHOLE attempt
 * (server round-trip + Credential Manager + server verify), not just the
 * bridge call in the middle.
 *
 * `attemptRestoreSession` runs inside authStore.initialize(), before the
 * first screen is drawn — `isInitializing` only flips once this resolves,
 * `useAppBootstrap` awaits it, and `SplashScreen.hideAsync()` waits on that
 * — so an unbounded await there freezes the app on the splash screen
 * forever, on every logged-out cold start, worse than the feature not
 * working. `registerRestoreCredential` runs off the boot path (fire-and-
 * forget after sign-in), so an unbounded await there can't hang the splash
 * screen — but it WOULD leave the in-flight guard stuck `true`, silently
 * blocking every later registration attempt in the process (see the
 * doc comment on `registerRestoreCredential`).
 *
 * `HttpClient.request` uses a plain `fetch` with no `AbortController` and
 * RN's OkHttp has no configured read/connect timeout, so a stalled socket
 * never resolves on its own — this is a real failure mode both flows must
 * guard against, not a hypothetical one. Five seconds is a guess at "slow
 * device, cold start"; production is what will correct it. Same shape of
 * problem and answer as captureCurrentLocation's 4s race.
 */
export const RESTORE_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  // `clearTimeout` on the loser: without it, every call that resolves before
  // the deadline (the overwhelming majority) still leaves a real 5s timer
  // running, which is an open handle that stalls Jest's exit and would tick
  // needlessly in production too.
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// Module-level, not per-call: `registerRestoreCredential` is fired
// fire-and-forget from THREE authStore sign-in sites (login/googleLogin/
// verifyEmail) AND from useAuthenticatedBootstrap's delayed re-check on every
// authenticated launch. Each sign-in flips `isAuthenticated`, which arms that
// hook's 1500ms timer; the hook re-checks `hasSynced`, which is still false
// because the direct call hasn't reached `markSynced` yet — two concurrent
// `createCredential` calls, two attestations, two rows. The guard lives here,
// in the function, rather than as a check at each call site: call sites will
// keep multiplying (every future sign-in-like flow needs one), and a guard
// inside the function can't be forgotten the way a guard at each call site
// can.
let registrationInFlight = false;

/**
 * The register body itself — split out so it can be raced against the same
 * timeout `attemptRestoreSession` uses (see `registerRestoreCredential`
 * below). Has no try/catch of its own: `registerRestoreCredential`'s own
 * try/catch already wraps the `withTimeout(...)` call, so a rejection here
 * (network error, bad JSON) propagates out to that one handler exactly as it
 * did before this was split into two functions.
 */
async function registerRestoreCredentialAttempt(userId: string): Promise<void> {
  const options = await api.getRestoreRegistrationOptions();
  const responseJson = await createRestoreCredential(JSON.stringify(options));
  if (!responseJson) return;
  await api.verifyRestoreRegistration(JSON.parse(responseJson));
  restoreCredentialFlag.markSynced(userId);
}

/**
 * Registers this device's Credential Manager passkey with the server, so a
 * future restore-from-backup can sign the user back in automatically. Called
 * fire-and-forget after a successful sign-in (Tasks 4-6) — nothing the user
 * sees waits on this, so every failure is swallowed and only logged.
 *
 * The flag is set ONLY after the server confirms the attestation. Setting it
 * earlier (e.g. right after the bridge call) would mean a network failure or a
 * server rejection permanently stops any retry on a later launch, and the
 * device would never end up with a working restore credential.
 *
 * Bounded by the same `RESTORE_TIMEOUT_MS` as `attemptRestoreSession`: its
 * two `api.*` calls sit on the same `AbortController`-less `fetch`. Without
 * this, a stalled network call would leave `registrationInFlight` stuck
 * `true` for the rest of the process — the 1500ms launch re-check
 * (`useAuthenticatedBootstrap`) silently no-ops forever, and so does every
 * later sign-in in that session, including as a DIFFERENT user, since the
 * guard is global rather than per-`userId`. `withTimeout` doesn't cancel the
 * underlying network calls (no `AbortController`), so a slow-but-eventually-
 * successful attempt can still call `markSynced` after this function has
 * already returned and released the guard — harmless (idempotent), and no
 * worse than the pre-guard behavior for two attempts spaced further apart
 * than the timeout.
 */
export async function registerRestoreCredential(userId: string): Promise<void> {
  // Checked before the in-flight guard AND before any api. call: iOS/web (and
  // an Android build whose native module failed to register) can never
  // succeed here, so there's nothing to guard and nothing worth calling the
  // server for.
  if (!isRestoreCredentialAvailable()) return;
  if (registrationInFlight) return;
  registrationInFlight = true;
  try {
    await withTimeout(registerRestoreCredentialAttempt(userId), RESTORE_TIMEOUT_MS);
  } catch (e) {
    console.warn('[RestoreCredentials] registration failed:', e);
  } finally {
    registrationInFlight = false;
  }
}

async function attemptRestoreSessionAttempt(): Promise<AuthResponse | null> {
  try {
    const options = await api.getRestoreAuthenticationOptions();
    const responseJson = await getRestoreCredential(JSON.stringify(options));
    if (!responseJson) return null;
    return await api.verifyRestoreAuthentication(JSON.parse(responseJson));
  } catch {
    // Every failure is the same to the caller: show the login screen.
    return null;
  }
}

/**
 * Tries to sign the user back in from a Credential Manager passkey restored
 * onto this device (Android backup/restore). Called from authStore.initialize()
 * before the first screen renders, so it must never hang and never throw —
 * every failure path is identical to the caller: no session, show login.
 *
 * On iOS/web (and an Android build with no registered native module) this
 * returns immediately without touching the network: the alternative — calling
 * the public, IP-throttled `GET /auth/restore/options` endpoint on EVERY
 * logged-out cold start on those platforms, only to throw the result away —
 * would run on the entire non-Android install base, forever.
 */
export async function attemptRestoreSession(): Promise<AuthResponse | null> {
  if (!isRestoreCredentialAvailable()) return null;
  // The whole attempt is bounded, not just the bridge call in the middle of
  // it — see RESTORE_TIMEOUT_MS above. attemptRestoreSessionAttempt() already
  // never rejects (its own try/catch resolves null on any failure), so racing
  // it against the timeout can only ever resolve, never reject.
  return withTimeout(attemptRestoreSessionAttempt(), RESTORE_TIMEOUT_MS);
}
