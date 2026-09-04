/** @jest-environment jsdom */
jest.mock('@/services/secureStorage', () => ({
  secureStorage: { getItem: jest.fn().mockResolvedValue('token-1') },
}));

import {
  startTelemetrySession,
  trackScreen,
  trackAction,
  flushTelemetry,
  resetTelemetry,
} from '../telemetry.web';

/**
 * Microtasks only — deliberately NOT `setImmediate`, which `jest.useFakeTimers()`
 * also fakes, so a `setImmediate`-based helper never resolves under fake timers.
 * `send()` awaits one promise (the token read) before calling fetch, so a few
 * turns of the microtask queue are enough.
 */
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('telemetry (web)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    resetTelemetry();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('buffers events and sends them as one batch with the bearer token and keepalive', async () => {
    startTelemetrySession();
    trackScreen('expense/new');
    trackAction('expense_manual', 'completed', 1200);

    flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/telemetry/events');
    expect(init.keepalive).toBe(true);
    expect(init.headers.Authorization).toBe('Bearer token-1');
    const body = JSON.parse(init.body);
    expect(body.platform).toBe('web');
    expect(body.sessionId).toEqual(expect.any(String));
    expect(body.events.map((e: { name: string }) => e.name)).toEqual([
      'session_start',
      'screen_view',
      'action',
    ]);
  });

  it('flushes on its own after the interval, with no explicit call', async () => {
    trackScreen('expense/new');

    jest.advanceTimersByTime(20_000);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushes when the page is hidden, which is the unload path', async () => {
    trackScreen('expense/new');

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the buffer is empty', () => {
    flushTelemetry();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the buffer before sending, so a rejected flush cannot resend it', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    trackScreen('expense/new');

    flushTelemetry();
    await flushMicrotasks();
    fetchMock.mockResolvedValue({ ok: true });
    flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when the network rejects', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    trackScreen('expense/new');

    expect(() => flushTelemetry()).not.toThrow();
    await flushMicrotasks();
  });

  it('drops the buffer on reset without sending, for sign-out', async () => {
    trackScreen('expense/new');

    resetTelemetry();
    flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives every session a different id', async () => {
    startTelemetrySession();
    flushTelemetry();
    await flushMicrotasks();
    const first = JSON.parse(fetchMock.mock.calls[0][1].body).sessionId;

    resetTelemetry();
    fetchMock.mockClear();
    startTelemetrySession();
    flushTelemetry();
    await flushMicrotasks();
    const second = JSON.parse(fetchMock.mock.calls[0][1].body).sessionId;

    expect(second).not.toBe(first);
  });

  it('a flush starting while another is still in flight sends nothing — the buffer was cleared, not deferred', async () => {
    let releaseFetch: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseFetch = resolve;
      }),
    );

    trackScreen('expense/new');
    flushTelemetry();
    await flushMicrotasks(); // let send() get as far as calling fetch

    // The first request has not settled. A implementation that cleared the
    // buffer in a `finally` instead of before dispatch would still be holding
    // the event here, and this second flush would re-send it.
    flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    releaseFetch({ ok: true }); // don't leave a pending promise behind
    await flushMicrotasks();
  });

  it('drops the oldest event rather than growing past the cap', async () => {
    // 45 events against MAX_BUFFERED = 40: the first five are dropped.
    for (let i = 0; i < 45; i += 1) trackScreen(`expense/${i}`);

    flushTelemetry();
    await flushMicrotasks();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events).toHaveLength(40);
    expect(body.events[0].screen).toBe('expense/5');
    expect(body.events[39].screen).toBe('expense/44');
  });
});
