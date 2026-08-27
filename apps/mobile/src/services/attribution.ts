// TypeScript resolution stub for platform-specific imports.
// At runtime, Metro/Expo resolves to attribution.native.ts or attribution.web.ts
// based on platform. Same three-file shape as `secureStorage` / `fileExport`.

export { captureAcquisition, getAcquisition } from './attribution.web';
export type { Acquisition } from './attribution.types';
