/**
 * Mocked to RESOLVE a token, which is what makes the behavioural assertion
 * below discriminating. The native module never reads storage, so this is inert
 * for it — but the web implementation reaches `fetch` only after a successful
 * token read, so without this mock a web re-export would bail out before
 * sending and "no fetch" would prove nothing.
 */
jest.mock('@/services/secureStorage', () => ({
  secureStorage: { getItem: jest.fn().mockResolvedValue('token-1') },
}));

/**
 * The extensionless file, by its full name. A bare `'../telemetry'` would NOT
 * reach it here: jest-expo resolves with React Native's haste platforms
 * (`ios`, then `native`), so it picks `telemetry.native.ts` — the real
 * implementation, tested in `telemetry.native.test.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativeTelemetry = require('../telemetry.ts') as typeof import('../telemetry');

const {
  trackScreen,
  trackAction,
  trackFailure,
  startTelemetrySession,
  flushTelemetry,
  resetTelemetry,
  setTelemetryEnabled,
} = nativeTelemetry;

/**
 * Microtasks only — the same helper shape as `telemetry.web.test.ts`, and for
 * the same reason: the web implementation reaches `fetch` only AFTER awaiting
 * `secureStorage.getItem`, so a synchronous assertion is worthless here. This
 * test used to make exactly that mistake — it called the five functions and
 * asserted `fetch` was not called in the same tick, which no implementation
 * could ever fail, web included. It would have passed unchanged if
 * `telemetry.ts` had re-exported `telemetry.web`, which is the one regression
 * it exists to catch.
 */
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Whatever sits between the first `{` and the last `}` of a function source. */
const bodyOf = (fn: (...args: never[]) => unknown): string => {
  const source = fn.toString();
  return source.slice(source.indexOf('{') + 1, source.lastIndexOf('}')).trim();
};

/**
 * The platform-blind fallback must stay a no-op even though both platforms now
 * have a real implementation: it pins the stub's BEHAVIOUR (nothing is sent)
 * and its IDENTITY (the exports really are no-ops), so a re-export of either
 * sibling fails on both counts rather than sliding through on a technicality.
 */
describe('telemetry (extensionless stub)', () => {
  it('sends nothing and throws nothing, even after the microtask queue drains', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    expect(() => {
      startTelemetrySession();
      trackScreen('expense/new');
      trackAction('expense_manual', 'completed', 1200);
      trackFailure('budget_create', 'amount');
      setTelemetryEnabled(true);
      flushTelemetry();
      resetTelemetry();
    }).not.toThrow();

    await flushMicrotasks();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('every exported function has an empty body — a re-export of telemetry.web would not', () => {
    const exported = [
      startTelemetrySession,
      trackScreen,
      trackAction,
      trackFailure,
      flushTelemetry,
      resetTelemetry,
      setTelemetryEnabled,
    ];

    expect(exported).toHaveLength(7);
    for (const fn of exported) {
      expect(bodyOf(fn)).toBe('');
    }
  });

  it('names no browser or transport global anywhere in the module source', () => {
    // `fetch`, `document` and `window` are named only in the platform files. Reads the real function sources rather than
    // the file, so it cannot be fooled by a comment mentioning them. Note this
    // is a property of the native file itself, not the re-export guard — the
    // web module's own exported functions call a private `send()` and do not
    // name `fetch` in their own bodies either. The empty-body test above is
    // what catches a re-export structurally.
    const source = Object.values(nativeTelemetry)
      .filter((value): value is (...args: never[]) => unknown => typeof value === 'function')
      .map((fn) => fn.toString())
      .join('\n');

    expect(source).not.toMatch(/\bfetch\b/);
    expect(source).not.toMatch(/\bdocument\b/);
    expect(source).not.toMatch(/\bwindow\b/);
  });
});
