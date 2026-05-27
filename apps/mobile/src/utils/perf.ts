/* eslint-disable no-console -- dev-only perf logger, hard-gated by __DEV__ */
// Lightweight perf instrumentation. DEV-ONLY: hard-gated by __DEV__ so this
// is a guaranteed no-op in release/production builds (Metro strips dead branches).
// In dev you can additionally silence it at runtime by setting
//   globalThis.__ABA_PERF__ = false
// before the app boots.
//
// Each helper is a no-op when disabled so it's safe to leave call-sites in place.

declare const __DEV__: boolean;

const IS_DEV: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const ENABLED: boolean = IS_DEV && (globalThis as any).__ABA_PERF__ !== false;

const now = (): number => {
  // Hermes exposes performance.now(); fall back to Date.now() otherwise.
  const p: any = (globalThis as any).performance;
  return p && typeof p.now === 'function' ? p.now() : Date.now();
};

export const perf = {
  enabled: ENABLED,

  mark(label: string, extra?: unknown): void {
    if (!ENABLED) return;
    if (extra !== undefined) console.log(`[perf] ${label}`, extra);
    else console.log(`[perf] ${label}`);
  },

  // Returns an end-fn; call it to log the elapsed time.
  //   const done = perf.start('loadExpenses');
  //   ...
  //   done({ count: n });
  start(label: string): (extra?: unknown) => number {
    if (!ENABLED) return () => 0;
    const t0 = now();
    return (extra?: unknown) => {
      const dt = now() - t0;
      if (extra !== undefined) console.log(`[perf] ${label} ${dt.toFixed(1)}ms`, extra);
      else console.log(`[perf] ${label} ${dt.toFixed(1)}ms`);
      return dt;
    };
  },

  // Async-friendly wrapper.
  async measure<T>(label: string, fn: () => Promise<T> | T, extra?: (v: T) => unknown): Promise<T> {
    if (!ENABLED) return await fn();
    const done = perf.start(label);
    const v = await fn();
    done(extra ? extra(v) : undefined);
    return v;
  },
};
