/**
 * `captureAcquisition`'s gating of the "we asked Play" flag against the native
 * module's actual answer — pins the Fix round 1 defect: the flag used to be set on
 * ANY resolution, including a transient SERVICE_UNAVAILABLE the native module
 * collapses to `null`, which permanently lost that device's attribution instead of
 * retrying on the next launch. Each test re-mocks `react-native` (Platform +
 * NativeModules) and `react-native-mmkv` fresh via `jest.resetModules()` +
 * `jest.doMock()` + `require()`, so `acquisitionStore.ts`'s module-scope MMKV
 * instance starts empty every time — the pattern already used by
 * `restoreCredentials/__tests__/index.android.test.ts`.
 */

/** Same shape as `telemetry.native.test.ts`'s `flushMicrotasks` — drains the
 *  `.then()/.catch()` chain `captureAcquisition` fires without returning. */
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('attribution.native — captureAcquisition/getAcquisition gating', () => {
  let getInstallReferrer: jest.Mock;
  let captureAcquisition: () => void;
  let getAcquisition: () => Record<string, unknown> | undefined;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    getInstallReferrer = jest.fn();

    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        InstallReferrerModule: { getInstallReferrer },
      },
    }));

    // acquisitionStore's `const mmkv = new MMKV(...)` runs once per fresh require,
    // and each mock instance closes over its OWN Map — so re-requiring after
    // `resetModules()` gives every test a genuinely empty store, no manual reset
    // needed (same isolation `walletStoreWebConsumption.test.ts` relies on, just
    // per-instance instead of per-file since we re-require every test here).
    jest.doMock('react-native-mmkv', () => ({
      MMKV: jest.fn().mockImplementation(() => {
        const store = new Map<string, string>();
        return {
          getString: (k: string) => store.get(k),
          set: (k: string, v: string) => store.set(k, String(v)),
          delete: (k: string) => store.delete(k),
        };
      }),
    }));

    const impl = require('../attribution.native');
    captureAcquisition = impl.captureAcquisition;
    getAcquisition = impl.getAcquisition;
  });

  afterEach(() => {
    jest.dontMock('react-native');
    jest.dontMock('react-native-mmkv');
  });

  it('resolves a real referrer string: value and raw are stored, flag is set', async () => {
    getInstallReferrer.mockResolvedValue('utm_source=google-play&utm_medium=organic');

    captureAcquisition();
    await flushMicrotasks();

    expect(getAcquisition()).toEqual({
      src: 'google-play',
      loc: 'organic',
      referrerRaw: 'utm_source=google-play&utm_medium=organic',
    });

    // Terminal: a second capture call must not re-invoke the native module.
    captureAcquisition();
    await flushMicrotasks();
    expect(getInstallReferrer).toHaveBeenCalledTimes(1);
  });

  it('resolves an empty string: a genuine no-referrer install — nothing to store, but terminal', async () => {
    getInstallReferrer.mockResolvedValue('');

    captureAcquisition();
    await flushMicrotasks();

    expect(getAcquisition()).toBeUndefined();

    // Terminal despite storing nothing: the flag is set, so a second call must not
    // ask Play again.
    captureAcquisition();
    await flushMicrotasks();
    expect(getInstallReferrer).toHaveBeenCalledTimes(1);
  });

  it('resolves null: retryable — nothing stored, and a later launch tries again', async () => {
    getInstallReferrer.mockResolvedValue(null);

    captureAcquisition();
    await flushMicrotasks();

    expect(getAcquisition()).toBeUndefined();

    // Retryable: the flag was never set, so a second capture call DOES ask Play
    // again — this is the exact behaviour Fix round 1 restored.
    captureAcquisition();
    await flushMicrotasks();
    expect(getInstallReferrer).toHaveBeenCalledTimes(2);
  });

  // I4 (ABA-553 final review): the library is documented to decode the referrer
  // before returning it, but if it ever handed back the raw percent-encoded form,
  // a plain `URLSearchParams` parse would see one key with no `=` and silently
  // find nothing — this retries the decoded form so a tagged-link install still
  // gets its labels.
  it('retries decoding when the referrer is still percent-encoded', async () => {
    getInstallReferrer.mockResolvedValue('src%3Dblog%26loc%3Dcta');

    captureAcquisition();
    await flushMicrotasks();

    expect(getAcquisition()).toEqual({
      src: 'blog',
      loc: 'cta',
      referrerRaw: 'src%3Dblog%26loc%3Dcta',
    });
  });

  it('stores the raw string as evidence even when neither the plain nor decoded form parses', async () => {
    // Contains `%26` so the decode-retry gate fires, but the decoded form still
    // has nothing `parseAcquisition` recognizes.
    getInstallReferrer.mockResolvedValue('gclid%3Dabc123%26foo%3Dbar');

    captureAcquisition();
    await flushMicrotasks();

    expect(getAcquisition()).toEqual({
      referrerRaw: 'gclid%3Dabc123%26foo%3Dbar',
    });
  });

  it('first touch wins: an already-stored record is not overwritten by a later, different referrer', async () => {
    // Two captures before either native call has resolved — the genuine race
    // `save`'s own first-touch guard (not `hasRead()`) exists to protect against,
    // since `hasRead()` only flips true once the FIRST promise actually resolves.
    getInstallReferrer
      .mockResolvedValueOnce('utm_source=google-play&utm_medium=organic')
      .mockResolvedValueOnce('utm_source=other&utm_medium=other');

    captureAcquisition();
    captureAcquisition();
    await flushMicrotasks();

    expect(getAcquisition()).toEqual({
      src: 'google-play',
      loc: 'organic',
      referrerRaw: 'utm_source=google-play&utm_medium=organic',
    });
    expect(getInstallReferrer).toHaveBeenCalledTimes(2);
  });
});
