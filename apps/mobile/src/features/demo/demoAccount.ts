/** Local-only sample-data account ids start with this prefix. The server never sees them. */
export const DEMO_ACCOUNT_PREFIX = 'demo-';

export function isDemoAccountId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(DEMO_ACCOUNT_PREFIX);
}

export class DemoAccountOfflineError extends Error {
  constructor() {
    super('Sample data is local-only');
    this.name = 'DemoAccountOfflineError';
  }
}
