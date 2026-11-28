import type * as Stub from '../telemetry';
import type * as Native from '../telemetry.native';
import type * as Web from '../telemetry.web';

/**
 * Type-level parity: everything a caller can import from `services/telemetry`
 * (whose types come from the extensionless stub) must exist, with a compatible
 * signature, in BOTH real implementations. Checked by `tsc --noEmit` — a
 * platform file that drops or changes an export fails to compile here, rather
 * than crashing only in the bundle that resolves it.
 */
type StubApi = typeof Stub;

function acceptsStubApi(_api: StubApi): void {}

declare const nativeApi: typeof Native;
declare const webApi: typeof Web;

describe('telemetry export parity', () => {
  it('both platform implementations satisfy the stub API (enforced by tsc)', () => {
    // Never called at runtime: the `declare`d values do not exist. The check
    // is the type-checker accepting these two calls.
    const check = () => {
      acceptsStubApi(nativeApi);
      acceptsStubApi(webApi);
    };
    expect(typeof check).toBe('function');
  });
});
