import { createConnectivity, nextBackoffMs, type ConnectivityStatus } from '../connectivityCore';

function setup(probeResults: boolean[]) {
  const timers: { fn: () => void; ms: number }[] = [];
  const changes: ConnectivityStatus[] = [];
  let i = 0;
  const probe = jest.fn(async () => probeResults[Math.min(i++, probeResults.length - 1)]);
  const c = createConnectivity({
    probe,
    schedule: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return t;
    },
    cancel: (h) => {
      const idx = timers.indexOf(h as (typeof timers)[number]);
      if (idx >= 0) timers.splice(idx, 1);
    },
    onChange: (s) => changes.push(s),
  });
  return { c, timers, changes, probe };
}
const flush = () => new Promise((r) => setImmediate(r));

describe('connectivityCore', () => {
  it('starts unknown', () => {
    expect(setup([true]).c.getStatus()).toBe('unknown');
  });

  it('a response means online', () => {
    const { c, changes } = setup([true]);
    c.reportResponse();
    expect(changes).toEqual(['online']);
  });

  it('fetch failure + failed probe -> offline, then recovers when probe succeeds', async () => {
    const { c, timers, changes } = setup([false, true]);
    c.reportFetchFailure();
    await flush();
    expect(c.getStatus()).toBe('offline');
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(5000);
    timers.shift()!.fn();
    await flush();
    expect(changes).toEqual(['offline', 'online']);
    expect(timers).toHaveLength(0);
  });

  it('429-shaped TypeError with a healthy probe stays online', async () => {
    const { c, changes } = setup([true]);
    c.reportResponse();
    c.reportFetchFailure();
    await flush();
    expect(c.getStatus()).toBe('online');
    expect(changes).toEqual(['online']);
  });

  it('a failure from unknown with a healthy probe goes online, never offline', async () => {
    const { c, changes } = setup([true]);
    c.reportFetchFailure();
    await flush();
    expect(changes).toEqual(['online']);
  });

  it('backs off 5s -> 60s while probes keep failing', async () => {
    const { c, timers } = setup([false]);
    c.reportFetchFailure();
    const seen: number[] = [];
    for (let n = 0; n < 6; n++) {
      await flush();
      seen.push(timers[0].ms);
      timers.shift()!.fn();
    }
    expect(seen).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
  });

  it('a response while offline recovers and cancels the retry', async () => {
    const { c, timers } = setup([false]);
    c.reportFetchFailure();
    await flush();
    c.reportResponse();
    expect(c.getStatus()).toBe('online');
    expect(timers).toHaveLength(0);
  });

  it('nextBackoffMs is capped', () => {
    expect(nextBackoffMs(0)).toBe(5000);
    expect(nextBackoffMs(99)).toBe(60000);
  });
});
