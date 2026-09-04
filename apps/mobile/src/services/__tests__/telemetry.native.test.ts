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

import * as nativeTelemetry from '../telemetry';

const {
  trackScreen,
  trackAction,
  startTelemetrySession,
  flushTelemetry,
  resetTelemetry,
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
 * The CI expression of the spec's binding "mobile must not be touched"
 * constraint. It pins the native module's BEHAVIOUR (nothing is sent) and its
 * IDENTITY (the exports really are no-ops), so a re-export of the web file
 * fails on both counts rather than sliding through on a technicality.
 */
describe('telemetry (native)', () => {
  it('sends nothing and throws nothing, even after the microtask queue drains', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    expect(() => {
      startTelemetrySession();
      trackScreen('expense/new');
      trackAction('expense_manual', 'completed', 1200);
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
      flushTelemetry,
      resetTelemetry,
    ];

    expect(exported).toHaveLength(5);
    for (const fn of exported) {
      expect(bodyOf(fn)).toBe('');
    }
  });

  it('names no browser or transport global anywhere in the module source', () => {
    // The structural half of decision 3: `fetch`, `document` and `window` are
    // named only in the web file. Reads the real function sources rather than
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
