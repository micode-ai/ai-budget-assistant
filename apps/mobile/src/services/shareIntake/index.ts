/**
 * Base resolution for `@/services/shareIntake`. Metro picks `index.android.ts`
 * (real) or `index.ios.ts` / `index.web.ts` (no-ops); tsc does not understand
 * platform extensions, so it resolves this file and gets the no-op surface,
 * identical in type to every variant — same convention as
 * `@/services/notificationCapture`.
 */
export * from './index.ios';
