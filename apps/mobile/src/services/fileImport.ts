// TypeScript resolution stub for platform-specific imports.
// At runtime, Metro/Expo resolves to fileImport.native.ts or fileImport.web.ts
// based on platform. Same three-file shape as `fileExport`.

export { readTextFile, parseBackupFile } from './fileImport.web';
export type { FileReadResult, BackupParseResult } from './fileImport.utils';
