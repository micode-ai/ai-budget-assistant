export const DEFAULT_PAGINATE_BATCH_SIZE = 500;

/**
 * Streams a Prisma `findMany`-shaped query in id-ordered batches instead of
 * loading the whole result set into memory at once. `fetchPage` must apply
 * `orderBy: { id: 'asc' }`, `take: batchSize`, and (when `cursor` is set)
 * `cursor: { id: cursor }, skip: 1`.
 *
 * Used by the daily notification crons, which used to `findMany` an entire
 * eligible-user/eligible-row table in one call (see tech-debt
 * daily-crons-full-table-scan).
 */
export async function* paginateById<T extends { id: string }>(
  fetchPage: (cursor: string | undefined) => Promise<T[]>,
  batchSize: number = DEFAULT_PAGINATE_BATCH_SIZE,
): AsyncGenerator<T[]> {
  let cursor: string | undefined;

  for (;;) {
    const page = await fetchPage(cursor);
    if (page.length === 0) return;

    yield page;

    if (page.length < batchSize) return;
    cursor = page[page.length - 1].id;
  }
}
