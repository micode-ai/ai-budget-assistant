/**
 * Base module resolution for `@/services/notificationCapture`.
 *
 * Metro picks the platform file at bundle time: `index.android.ts` (real native
 * module), `index.ios.ts` / `index.web.ts` (no-op stubs). TypeScript (`tsc`) does
 * NOT understand platform extensions, so it needs this base `index.ts` to resolve
 * the module — mirroring the `secureStorage.ts` base + `.native.ts`/`.web.ts`
 * override convention. The base re-exports the no-op stub: identical type surface
 * to every platform variant, and a safe fallback on any non-Android/iOS/web target.
 */
export * from './index.ios';
