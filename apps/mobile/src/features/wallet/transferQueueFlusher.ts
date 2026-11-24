/**
 * Single-flight, throttled trigger for the account-transfer write queue.
 * Pure: the caller injects `flush` and the clock, so it is testable without a device.
 */
export const TRANSFER_FLUSH_MIN_INTERVAL_MS = 15_000;

export interface TransferQueueFlusherDeps {
  flush: () => Promise<void>;
  now: () => number;
  minIntervalMs?: number;
}

export function createTransferQueueFlusher(deps: TransferQueueFlusherDeps) {
  const minInterval = deps.minIntervalMs ?? TRANSFER_FLUSH_MIN_INTERVAL_MS;
  let inFlight = false;
  let lastStart = -Infinity;

  return {
    /** Resolves true when a flush ran, false when it was skipped. Never throws. */
    async request(): Promise<boolean> {
      const t = deps.now();
      if (inFlight || t - lastStart < minInterval) return false;
      inFlight = true;
      lastStart = t;
      try {
        await deps.flush();
      } catch (e) {
        // Expected while offline; console.error would raise a LogBox overlay (ABA-157).
        console.warn('Transfer queue auto-flush failed:', e);
      } finally {
        inFlight = false;
      }
      return true;
    },
  };
}
