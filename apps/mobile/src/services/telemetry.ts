import type { TelemetryFlow, TelemetryStatus } from './telemetry.types';

export type { TelemetryFlow, TelemetryStatus };

/**
 * Native no-op — and, unlike its siblings, THIS extensionless file IS the real
 * native implementation, not a resolution stub. `secureStorage`/`attribution`/
 * `fileExport` each have a real `.native.ts` AND a real `.web.ts`, so their
 * extensionless file is an arbitrary stub that just re-exports `.web` (only
 * used when something resolves the bare import platform-blind, e.g.
 * TypeScript/Jest). Telemetry has no `.native.ts` — do NOT add one — because
 * that would make this file dead code and reopen the hole it exists to close:
 * a stub re-exporting `.web` here would mean any resolution surprise pulls
 * `telemetry.web.ts`'s `document`/`fetch` calls (and a live network send) into
 * the native bundle, whereas the no-op below fails safe. The web
 * implementation lives in `telemetry.web.ts` and Metro resolves the platform
 * file at bundle time, so nothing there ever reaches the native app — a
 * property of the bundler, not a promise.
 *
 * To add mobile telemetry later, implement these five functions here; every
 * existing call site starts reporting with no further change.
 */
export function startTelemetrySession(): void {}
export function trackScreen(_screen: string): void {}
export function trackAction(_flow: TelemetryFlow, _status: TelemetryStatus, _ms?: number): void {}
export function flushTelemetry(): void {}
export function resetTelemetry(): void {}
