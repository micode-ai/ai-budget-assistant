// TypeScript resolution stub for platform-specific imports.
// At runtime, Metro/Expo resolves to fileExport.native.ts or fileExport.web.ts
// based on platform. Same three-file shape as `secureStorage`.

export { saveFile, shareFile } from './fileExport.web';
export type { FileExportResult } from './fileExport.utils';
