/**
 * The native telemetry transport (`telemetry.native.ts`): persisted queue,
 * cap, flush triggers, send outcomes, opt-out, session restart, and the exact
 * shape of every event.
 *
 * Each test re-requires the module after `jest.resetModules()` with fresh
 * `react-native` / `react-native-mmkv` / `secureStorage` mocks, so module
 * state (queue, session, timer, AppState listener) starts empty — the pattern
 * of `attribution.native.test.ts`. The MMKV mock's backing maps live in this
 * file, so a "next launch" can re-require the module over the SAME storage.
 */

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

type Impl = typeof import('../telemetry.native');

/** Storage that outlives a module reload, keyed by MMKV id. */
let disk: Map<string, Map<string, string | boolean>>;
let appStateHandler: ((state: string) => void) | null;
let appStateRemove: jest.Mock;
let screen: { width: number; height: number };
let token: string | null;
let fetchMock: jest.Mock;

function load(os: 'android' | 'ios' = 'android'): Impl {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    Platform: { OS: os },
    Dimensions: { get: () => screen },
    AppState: {
      addEventListener: (_event: string, handler: (state: string) => void) => {
        appStateHandler = handler;
        return { remove: appStateRemove };
      },
    },
  }));
  jest.doMock('react-native-mmkv', () => ({
    MMKV: jest.fn().mockImplementation(({ id }: { id: string }) => {
      if (!disk.has(id)) disk.set(id, new Map());
      const map = disk.get(id)!;
      return {
        getString: (k: string) => {
          const v = map.get(k);
          return typeof v === 'string' ? v : undefined;
        },
        getBoolean: (k: string) => {
          const v = map.get(k);
          return typeof v === 'boolean' ? v : undefined;
        },
        set: (k: string, v: string | boolean) => map.set(k, v),
        delete: (k: string) => map.delete(k),
      };
    }),
  }));
  jest.doMock('@/services/secureStorage', () => ({
    secureStorage: { getItem: jest.fn(async () => token) },
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../telemetry.native') as Impl;
}

/** Lets the debounced write land (pushes are persisted at most every 2 s). */
function settle(): void {
  jest.advanceTimersByTime(2_000);
}

function storedQueue(): unknown[] {
  const raw = disk.get('telemetry-queue')?.get('queue');
  return typeof raw === 'string' ? JSON.parse(raw) : [];
}

function bodyOf(call: number): { platform: string; sessionId: string; events: Record<string, unknown>[] } {
  return JSON.parse(fetchMock.mock.calls[call][1].body);
}

const ok = { ok: true, status: 204 };

describe('telemetry (native)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    disk = new Map();
    appStateHandler = null;
    appStateRemove = jest.fn();
    screen = { width: 412, height: 915 };
    token = 'token-1';
    fetchMock = jest.fn().mockResolvedValue(ok);
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.dontMock('react-native');
    jest.dontMock('react-native-mmkv');
    jest.dontMock('@/services/secureStorage');
  });

  it('does nothing at all before a session starts — no pre-login telemetry, no side effects on import', async () => {
    const t = load();
    t.trackScreen('(auth)/login');
    t.trackAction('expense_manual', 'started');
    t.flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storedQueue()).toEqual([]);
    expect(appStateHandler).toBeNull();
  });

  it('sends one batch with the bearer token, the native platform and the session id, without HttpClient', async () => {
    const t = load('android');
    t.startTelemetrySession('user-a');
    await flushMicrotasks();
    fetchMock.mockClear();

    t.trackScreen('expense/[id]');
    t.flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/telemetry\/events$/);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer token-1' });
    const body = bodyOf(0);
    expect(Object.keys(body).sort()).toEqual(['events', 'platform', 'sessionId']);
    expect(body.platform).toBe('android');
    expect(body.sessionId).toEqual(expect.any(String));
  });

  it('reports ios as its platform on an iPhone', async () => {
    const t = load('ios');
    t.startTelemetrySession('user-a');
    await flushMicrotasks();

    expect(bodyOf(0).platform).toBe('ios');
  });

  // Field by field, never by substring (ABA-780): `ts` digits can contain anything.
  it('sends exactly the allowed keys on every event, and nothing device-identifying', async () => {
    const t = load();
    t.startTelemetrySession('user-a');
    t.trackScreen('expense/new');
    t.trackAction('expense_manual', 'completed', 1234.6);
    t.trackFailure('budget_create', 'amount');
    t.flushTelemetry();
    await flushMicrotasks();

    const events = bodyOf(0).events;
    expect(events.map((e) => e.name)).toEqual(['session_start', 'screen_view', 'action', 'action']);

    expect(Object.keys(events[0]).sort()).toEqual(['name', 'props', 'ts']);
    expect(events[0].props).toEqual({ formFactor: 'phone', display: 'app' });

    expect(Object.keys(events[1]).sort()).toEqual(['name', 'props', 'screen', 'ts']);
    expect(events[1].screen).toBe('expense/new');
    expect(events[1].props).toEqual({ formFactor: 'phone', display: 'app' });

    expect(Object.keys(events[2]).sort()).toEqual(['name', 'props', 'ts']);
    expect(events[2].props).toEqual({
      flow: 'expense_manual',
      status: 'completed',
      ms: 1235,
      formFactor: 'phone',
      display: 'app',
    });

    expect(events[3].props).toEqual({
      flow: 'budget_create',
      status: 'failed',
      reason: 'amount',
      formFactor: 'phone',
      display: 'app',
    });

    for (const event of events) {
      expect(typeof event.ts).toBe('number');
      // The raw screen size never leaves the device.
      for (const value of Object.values(event.props as Record<string, unknown>)) {
        expect(value).not.toBe(412);
        expect(value).not.toBe(915);
      }
      expect(event).not.toHaveProperty('sid');
      expect(event).not.toHaveProperty('sessionId');
    }
  });

  it('classes a device by its shortest side: 600 dp and up is a tablet, in either orientation', () => {
    const t = load();
    expect(t.formFactorForScreen(412, 915)).toBe('phone');
    expect(t.formFactorForScreen(915, 412)).toBe('phone');
    expect(t.formFactorForScreen(800, 1280)).toBe('tablet');
    expect(t.formFactorForScreen(1280, 600)).toBe('tablet');
    expect(t.formFactorForScreen(599, 1000)).toBe('phone');
  });

  it('stamps tablet on a tablet', async () => {
    screen = { width: 1280, height: 800 };
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();

    expect(bodyOf(0).events[0].props).toEqual({ formFactor: 'tablet', display: 'app' });
  });

  it('persists the queue so a killed app sends it on the next launch, under the old session id', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const first = load();
    first.startTelemetrySession('user-a');
    first.trackScreen('analytics');
    await flushMicrotasks();
    settle();
    const oldSession = bodyOf(0).sessionId;
    expect(storedQueue()).toHaveLength(2);

    // "Kill": a fresh module over the same disk, now online.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok);
    const second = load();
    second.startTelemetrySession('user-a');
    await flushMicrotasks();

    // The leftovers go first, as their own batch under their own session...
    expect(bodyOf(0).sessionId).toBe(oldSession);
    expect(bodyOf(0).events.map((e) => e.name)).toEqual(['session_start', 'screen_view']);
    // ...then the new launch's session_start under a new id.
    expect(bodyOf(1).sessionId).not.toBe(oldSession);
    expect(bodyOf(1).events.map((e) => e.name)).toEqual(['session_start']);
    expect(storedQueue()).toEqual([]);
  });

  it('flushes every 15 s while active', async () => {
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();
    fetchMock.mockClear();

    t.trackScreen('budgets');
    expect(fetchMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).events[0].screen).toBe('budgets');
  });

  it('flushes when the app goes to the background', async () => {
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();
    fetchMock.mockClear();

    t.trackScreen('wallet/index');
    appStateHandler!('background');
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).events[0].screen).toBe('wallet/index');
  });

  it('caps the queue at 500, dropping the oldest', () => {
    token = null; // nothing can be sent, so everything stays queued
    const t = load();
    t.startTelemetrySession('user-a'); // event 0: session_start
    for (let i = 0; i < 520; i += 1) t.trackScreen(i % 2 === 0 ? 'expenses' : 'analytics');
    settle();

    const queued = storedQueue() as { name: string; screen?: string }[];
    expect(queued).toHaveLength(t.MAX_QUEUED);
    // 521 queued in total: the session_start and the first 20 screens are gone.
    expect(queued[0].name).toBe('screen_view');
    expect(queued.some((e) => e.name === 'session_start')).toBe(false);
  });

  it('keeps a batch on a network error and resends it on the next flush — never in a tight loop', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const t = load();
    t.startTelemetrySession('user-a');
    t.trackScreen('expenses');
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    settle();
    expect(storedQueue()).toHaveLength(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok);
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).events.map((e) => e.name)).toEqual(['session_start', 'screen_view']);
    expect(storedQueue()).toEqual([]);
  });

  it('keeps a batch on a 5xx and on a throttle', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();
    expect(storedQueue()).toHaveLength(1);

    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks();
    expect(storedQueue()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drops a batch on 401 — an expired token loses it, like web, and never forces a refresh', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const t = load();
    t.startTelemetrySession('user-a');
    t.trackScreen('expenses');
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedQueue()).toEqual([]);
  });

  it('drops a batch the server refuses outright (400), so it cannot block the queue', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();

    expect(storedQueue()).toEqual([]);
  });

  it('keeps everything while there is no token', async () => {
    token = null;
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storedQueue()).toHaveLength(1);
  });

  it('sends a backlog in batches of at most 40, a bounded number per flush', async () => {
    token = null;
    const t = load();
    t.startTelemetrySession('user-a');
    for (let i = 0; i < 300; i += 1) t.trackScreen('expenses');
    await flushMicrotasks(); // the launch flush finds no token and keeps everything
    token = 'token-1';

    t.flushTelemetry();
    await flushMicrotasks();
    for (let i = 0; i < 20; i += 1) await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(t.MAX_REQUESTS_PER_FLUSH);
    for (let i = 0; i < fetchMock.mock.calls.length; i += 1) {
      expect(bodyOf(i).events.length).toBeLessThanOrEqual(t.MAX_PER_REQUEST);
    }
    expect(storedQueue()).toHaveLength(301 - t.MAX_REQUESTS_PER_FLUSH * t.MAX_PER_REQUEST);
  });

  it('opt-out clears the pending queue and stops queuing; opt-in opens a fresh session', async () => {
    token = null;
    const t = load();
    t.startTelemetrySession('user-a');
    t.trackScreen('expenses');
    settle();
    expect(storedQueue()).toHaveLength(2);

    t.setTelemetryEnabled(false);
    expect(storedQueue()).toEqual([]);
    expect(disk.get('telemetry-preference')?.get('enabled')).toBe(false);

    t.trackScreen('analytics');
    t.trackAction('expense_manual', 'started');
    settle();
    expect(storedQueue()).toEqual([]);

    t.setTelemetryEnabled(true);
    settle();
    const queued = storedQueue() as { name: string; screen?: string }[];
    // A fresh session that still says where the user is.
    expect(queued.map((e) => e.name)).toEqual(['session_start', 'screen_view']);
    expect(queued[1].screen).toBe('analytics');
  });

  it('stays off across launches once opted out', async () => {
    const first = load();
    first.setTelemetryEnabled(false);

    const second = load();
    second.startTelemetrySession('user-a');
    second.trackScreen('expenses');
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storedQueue()).toEqual([]);
  });

  it('starts a new session after 30 min in the background, re-stating the current screen', async () => {
    const t = load();
    t.startTelemetrySession('user-a');
    t.trackScreen('budgets');
    await flushMicrotasks();
    const firstSession = bodyOf(0).sessionId;
    fetchMock.mockClear();

    appStateHandler!('background');
    jest.advanceTimersByTime(t.SESSION_RESUME_MS);
    appStateHandler!('active');
    t.flushTelemetry();
    await flushMicrotasks();

    const body = bodyOf(fetchMock.mock.calls.length - 1);
    expect(body.sessionId).not.toBe(firstSession);
    expect(body.events.map((e) => e.name)).toEqual(['session_start', 'screen_view']);
    expect(body.events[1].screen).toBe('budgets');
  });

  it('keeps the session after a short trip to the background', async () => {
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();
    const firstSession = bodyOf(0).sessionId;
    fetchMock.mockClear();

    appStateHandler!('background');
    jest.advanceTimersByTime(t.SESSION_RESUME_MS - 1);
    appStateHandler!('active');
    t.trackScreen('expenses');
    t.flushTelemetry();
    await flushMicrotasks();

    const body = bodyOf(0);
    expect(body.sessionId).toBe(firstSession);
    expect(body.events.map((e) => e.name)).toEqual(['screen_view']);
  });

  it('sign-out clears the queue, stops the timer and the listener, and drops later events', async () => {
    token = null;
    const t = load();
    t.startTelemetrySession('user-a');
    t.trackScreen('expenses');

    t.resetTelemetry();
    expect(storedQueue()).toEqual([]);
    expect(appStateRemove).toHaveBeenCalled();

    token = 'token-1';
    t.trackScreen('analytics');
    jest.advanceTimersByTime(60_000);
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storedQueue()).toEqual([]);
  });

  // Review fix 1: the queue has an owner.
  it("never sends one user's persisted backlog under another user's token", async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const asA = load();
    asA.startTelemetrySession('user-a');
    asA.trackScreen('expenses');
    await flushMicrotasks();
    settle();
    const sessionA = bodyOf(0).sessionId;
    expect(storedQueue()).toHaveLength(2);

    // Next launch, someone else signs in (e.g. password login over a dead
    // biometric session) without any sign-out having run.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok);
    token = 'token-b';
    const asB = load();
    asB.startTelemetrySession('user-b');
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).sessionId).not.toBe(sessionA);
    expect(bodyOf(0).events.map((e) => e.name)).toEqual(['session_start']);
    expect(disk.get('telemetry-queue')?.get('owner')).toBe('user-b');
  });

  it('clears a persisted backlog when the session has no known user', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const first = load();
    first.startTelemetrySession('user-a');
    await flushMicrotasks();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok);
    const second = load();
    second.startTelemetrySession(undefined);
    await flushMicrotasks();

    // Only the new session's own start, never user-a's leftovers.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).events).toHaveLength(1);
  });

  // Review fix 2: a drain never outlives a sign-out.
  it('stops a drain that was in flight across a sign-out, so the next user never posts with the old token', async () => {
    let release: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    token = null;
    const t = load();
    t.startTelemetrySession('user-a');
    for (let i = 0; i < 60; i += 1) t.trackScreen('expenses'); // two batches' worth
    await flushMicrotasks();
    token = 'token-a';
    t.flushTelemetry();
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1); // first batch pending

    t.resetTelemetry();
    token = 'token-b';
    t.startTelemetrySession('user-b');
    t.trackScreen('analytics');
    release(ok);
    for (let i = 0; i < 5; i += 1) await flushMicrotasks();
    // The old drain gave up after its await: it sent nothing more at all.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Nothing more under token-a, and none of user-a's events went out again.
    const calls = fetchMock.mock.calls.map((c) => ({
      auth: c[1].headers.Authorization as string,
      body: JSON.parse(c[1].body) as { events: { screen?: string }[] },
    }));
    expect(calls.filter((c) => c.auth === 'Bearer token-a')).toHaveLength(1);
    for (const call of calls.slice(1)) {
      expect(call.auth).toBe('Bearer token-b');
      expect(call.body.events.some((e) => e.screen === 'expenses')).toBe(false);
    }

    // user-b's events are still there for the next flush.
    jest.advanceTimersByTime(15_000);
    for (let i = 0; i < 5; i += 1) await flushMicrotasks();
    const last = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(last[1].headers.Authorization).toBe('Bearer token-b');
    expect(JSON.parse(last[1].body).events.map((e: { name: string }) => e.name)).toEqual([
      'session_start',
      'screen_view',
    ]);
  });

  it('bounds every request with an abort signal', async () => {
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();

    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });

  // Review fix 3: storage is untrusted.
  it('skips malformed persisted entries instead of failing every flush', async () => {
    disk.set(
      'telemetry-queue',
      new Map<string, string | boolean>([
        ['owner', 'user-a'],
        [
          'queue',
          JSON.stringify([
            null,
            42,
            { name: 'screen_view' },
            { sid: 'old-session', name: 'screen_view', screen: 'budgets', props: { display: 'app' }, ts: 1 },
          ]),
        ],
      ]),
    );
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();

    expect(bodyOf(0).sessionId).toBe('old-session');
    expect(bodyOf(0).events).toEqual([
      { name: 'screen_view', screen: 'budgets', props: { display: 'app' }, ts: 1 },
    ]);
  });

  // Review fix 4: no ticking in the background.
  it('stops the interval in the background and restarts it on return', async () => {
    const t = load();
    t.startTelemetrySession('user-a');
    await flushMicrotasks();
    appStateHandler!('background');
    await flushMicrotasks();
    fetchMock.mockClear();

    t.trackScreen('expenses');
    jest.advanceTimersByTime(60_000);
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();

    appStateHandler!('active');
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Review fix 5: debounced writes, synchronous on flush and on background.
  it('debounces queue writes, and writes at once on background', () => {
    token = null;
    const t = load();
    t.startTelemetrySession('user-a'); // the launch flush writes synchronously
    expect(storedQueue()).toHaveLength(1);

    t.trackScreen('expenses');
    t.trackScreen('analytics');
    expect(storedQueue()).toHaveLength(1);
    jest.advanceTimersByTime(1_999);
    expect(storedQueue()).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(storedQueue()).toHaveLength(3);

    t.trackScreen('budgets');
    appStateHandler!('background');
    expect(storedQueue()).toHaveLength(4);
  });
});
