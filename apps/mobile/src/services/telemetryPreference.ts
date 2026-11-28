import { MMKV } from 'react-native-mmkv';

/**
 * The "Share usage statistics" switch (Settings → Security & Encryption).
 *
 * Device-local and platform-free: MMKV is a native store on the phone and
 * `localStorage` on web, so both telemetry implementations read the same key.
 * Default ON — the absence of a stored value means the user never turned it
 * off. Written only through `setTelemetryEnabled` in `services/telemetry`,
 * which also clears whatever is queued when it is turned off.
 */
const KEY = 'enabled';
let storage: MMKV | null = null;

/** Lazy so that importing telemetry (which every flow screen does) costs nothing
 *  until an event is actually tracked. */
function store(): MMKV {
  if (storage === null) storage = new MMKV({ id: 'telemetry-preference' });
  return storage;
}

export function isTelemetryEnabled(): boolean {
  try {
    return store().getBoolean(KEY) !== false;
  } catch {
    // A storage failure must not silently opt a user in to anything new — but
    // it also must not crash a screen. Treat it as "off".
    return false;
  }
}

export function writeTelemetryPreference(enabled: boolean): void {
  try {
    store().set(KEY, enabled);
  } catch {
    // Nothing useful to do; the switch reverts on the next read.
  }
}
