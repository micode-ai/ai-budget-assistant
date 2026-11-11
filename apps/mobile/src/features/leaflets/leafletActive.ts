import type { LeafletResult } from '@budget/shared-types';

/**
 * The account's leaflets worth reopening from the leaflet screen's idle state (`GET /leaflets`
 * returns the unexpired ones, newest first): every leaflet with at least one page read, whatever
 * its status — a read that stopped part-way still has its rows. A leaflet with nothing read is
 * hidden: an abandoned run, or a PDF whose upload never reached the API (the server shows such a
 * `reading` leaflet as `failed` after 30 minutes, but it has no rows to show either way).
 */
export function reopenableLeaflets(list: LeafletResult[] | null): LeafletResult[] {
  return (list ?? []).filter((l) => l.pagesRead > 0);
}
