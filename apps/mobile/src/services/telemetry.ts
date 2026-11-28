import type { TelemetryFailReason, TelemetryFlow, TelemetryStatus } from './telemetry.types';

export type { TelemetryFailReason, TelemetryFlow, TelemetryStatus };

/**
 * The platform-blind fallback — and it must stay a NO-OP, never a re-export.
 *
 * Both real implementations exist: `telemetry.native.ts` (Android/iOS) and
 * `telemetry.web.ts`, and Metro picks one per platform at bundle time. This
 * extensionless file is what a platform-blind resolver sees (TypeScript, and
 * any tooling that does not know the `.native`/`.web` suffixes), so it decides
 * what happens on a resolution surprise. A re-export of either sibling would
 * turn that surprise into a live network send; the empty bodies below fail
 * safe instead. `telemetry.stub.test.ts` pins them.
 *
 * Every export here must match the two real files' signatures.
 */
export function startTelemetrySession(_ownerId?: string): void {}
export function trackScreen(_screen: string): void {}
export function trackAction(_flow: TelemetryFlow, _status: TelemetryStatus, _ms?: number): void {}

export function trackFailure(_flow: TelemetryFlow, _reason: TelemetryFailReason): void {}
export function flushTelemetry(): void {}
export function resetTelemetry(): void {}
export function setTelemetryEnabled(_enabled: boolean): void {}
