import { NativeModules, Platform } from 'react-native';
import { parseAcquisition, type Acquisition } from './attribution.types';
import { acquisitionFlag, truncateReferrer } from '@/stores/acquisitionStore';

export type { Acquisition } from './attribution.types';

/**
 * Read the Play Install Referrer once per install and park it in MMKV.
 *
 * Stays `(): void` so the entry point's call site is unchanged, and so
 * `getAcquisition()` below can stay synchronous — it is called inside the request
 * body in `auth.api.ts`, and making it async would ripple into the auth surface for
 * a field that is optional by design. The read is fire-and-forget: by the time a
 * user reaches the register screen the value is there, and if it is not, the field
 * is simply omitted, exactly as before this existed.
 *
 * `hasRead()` guards the native call, not the value — Play's referrer never changes
 * for an install, so one TERMINAL read is final. A terminal read is any resolved
 * STRING, including the empty string: that is Play's genuine "no referrer" answer,
 * not a failure. `null` is different — the native module (Task 3) collapses every
 * non-terminal cause into that one value alike (a transient SERVICE_UNAVAILABLE,
 * FEATURE_NOT_SUPPORTED, a thrown exception), so `null` must NOT mark the flag: it
 * leaves the next launch free to try again. A device that can never get anything
 * but `null` (no Play Services, a non-Play build) simply retries one cheap failed
 * bind forever — fire-and-forget, and such a device has no attribution to lose.
 */
export function captureAcquisition(): void {
  if (Platform.OS !== 'android') return;
  if (acquisitionFlag.hasRead()) return;
  const native = NativeModules.InstallReferrerModule as
    | { getInstallReferrer: () => Promise<string | null> }
    | undefined;
  if (!native) return;
  native
    .getInstallReferrer()
    .then((referrer) => {
      // See the doc comment above: `null` is retryable and must not touch the
      // store at all, not even to mark the read flag.
      if (referrer === null) return;
      const raw = truncateReferrer(referrer);
      // An empty referrer is still a terminal read: store the flag, not a value,
      // so we stop asking Play on every launch.
      let parsed = raw ? parseAcquisition(raw) : undefined;
      // I4 (ABA-553 final review): the Install Referrer library is documented to
      // hand back a DECODED value, and almost certainly does. But if it ever
      // returned the still-percent-encoded form (`src%3Dblog%26loc%3D...`),
      // `URLSearchParams` would see one key with no `=`, `parseAcquisition` would
      // return `undefined`, and every tagged-link install would silently land
      // with empty labels while Play-organic installs kept working — reading as
      // "our links produce nothing, ASO carries everything", the exact wrong
      // conclusion this feature exists to prevent. This can only RESCUE a read,
      // never degrade one: `raw` is stored as evidence below regardless of which
      // form (or neither) parses.
      if (!parsed && raw && /%3D|%26/i.test(raw)) {
        try {
          parsed = parseAcquisition(decodeURIComponent(raw));
        } catch {
          /* malformed percent-encoding — keep `parsed` undefined, `raw` still saved */
        }
      }
      acquisitionFlag.save(parsed, raw);
    })
    .catch((e) => {
      // The native side resolves rather than rejects, so this is defensive only.
      console.warn('[Attribution] install referrer read failed:', e);
    });
}

export function getAcquisition(): Acquisition | undefined {
  const stored = acquisitionFlag.stored();
  const raw = acquisitionFlag.storedRaw();
  if (!stored && !raw) return undefined;
  // `referrerRaw` rides with the labels rather than in its own call: the backfill
  // endpoint's first-touch guard would refuse a later PATCH for a user whose
  // registration already set a source, and the raw string would be lost for them.
  return { ...(stored ?? {}), ...(raw ? { referrerRaw: raw } : {}) };
}

/**
 * Native no-op: an install carries no query string, so there is nothing here
 * to parse — unlike `captureAcquisition` above, which reads the Play Install
 * Referrer directly rather than a URL. A referral code reaches a native
 * signup only by the user typing the code printed in the share message.
 */
export function captureReferralCode(): void {}

export function getReferralCode(): string | undefined {
  return undefined;
}
