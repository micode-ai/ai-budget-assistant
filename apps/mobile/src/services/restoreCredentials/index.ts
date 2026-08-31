/**
 * Base module resolution for `@/services/restoreCredentials`.
 *
 * Metro picks the platform file at bundle time: `index.android.ts` (real native
 * module), `index.ios.ts` / `index.web.ts` (no-op stubs). TypeScript (`tsc`) does
 * NOT understand platform extensions, so it needs this base `index.ts` to resolve
 * the module. The base re-exports the no-op stub: identical type surface to every
 * platform variant, and a safe fallback on any other target — including
 * `isRestoreCredentialAvailable()`, which resolves `false` here exactly as it
 * does on the real iOS/web stubs.
 */
export * from './index.ios';
