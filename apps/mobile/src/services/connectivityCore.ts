/**
 * Pure connectivity state machine (ABA-648). No React, no fetch, no timers of its own:
 * the caller injects the probe and the scheduler, so it is testable without a device.
 *
 * Signal: any HTTP response from the API proves we are online. A rejected fetch is only an
 * offline CANDIDATE - on web an nginx 429 without CORS headers is also a TypeError, so the
 * candidate becomes `offline` only after a probe of the public /health also fails.
 */
export type ConnectivityStatus = 'online' | 'offline' | 'unknown';

export const BACKOFF_START_MS = 5_000;
export const BACKOFF_MAX_MS = 60_000;

/** 5s, 10s, 20s, 40s, then 60s forever. */
export function nextBackoffMs(attempt: number): number {
  return Math.min(BACKOFF_START_MS * 2 ** Math.max(0, attempt), BACKOFF_MAX_MS);
}

export interface ConnectivityDeps {
  /** Resolves true when the API answered with ANY HTTP response, false when fetch rejected. */
  probe: () => Promise<boolean>;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  onChange: (status: ConnectivityStatus) => void;
}

export function createConnectivity(deps: ConnectivityDeps) {
  let status: ConnectivityStatus = 'unknown';
  let attempt = 0;
  let timer: unknown = null;
  let probing = false;

  const set = (next: ConnectivityStatus) => {
    if (next === status) return;
    status = next;
    deps.onChange(next);
  };

  const clearTimer = () => {
    if (timer !== null) deps.cancel(timer);
    timer = null;
  };

  const runProbe = async () => {
    if (probing) return;
    probing = true;
    let ok = false;
    try {
      ok = await deps.probe();
    } catch {
      ok = false;
    } finally {
      probing = false;
    }
    if (ok) {
      attempt = 0;
      clearTimer();
      set('online');
    } else {
      set('offline');
      clearTimer();
      timer = deps.schedule(() => {
        timer = null;
        void runProbe();
      }, nextBackoffMs(attempt));
      attempt += 1;
    }
  };

  return {
    getStatus: () => status,
    /** The single fetch received an HTTP response (any status). */
    reportResponse() {
      attempt = 0;
      clearTimer();
      set('online');
    },
    /** The single fetch rejected: confirm with a probe before declaring offline. */
    reportFetchFailure() {
      void runProbe();
    },
    /** Hint from the platform (AppState active, window online/offline event). */
    recheck() {
      clearTimer();
      void runProbe();
    },
  };
}
