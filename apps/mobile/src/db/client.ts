// TypeScript resolution stub for platform-specific imports.
// At runtime, Metro/Expo resolves to client.native.ts or client.web.ts based on platform.

export { db, schema, initializeDatabase } from './client.web';

export type QueryResult<T = Record<string, unknown>> = T[];

export function executeSql<T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | null)[]
): Promise<QueryResult<T>> {
  return Promise.resolve([]);
}
