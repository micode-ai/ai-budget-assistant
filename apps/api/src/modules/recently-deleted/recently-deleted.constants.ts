/** How long a soft-deleted transaction stays restorable. */
export const RECENTLY_DELETED_RETENTION_DAYS = 30;
export const RECENTLY_DELETED_RETENTION_MS = RECENTLY_DELETED_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RECENTLY_DELETED_RETENTION_MS);
}
