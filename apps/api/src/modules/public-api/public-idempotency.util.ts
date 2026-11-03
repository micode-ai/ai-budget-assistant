import { PublicApiError } from './public-api-error';

const keyConflict = (message: string) =>
  new PublicApiError(409, 'idempotency_key_conflict', message);

const NOUN_PHRASE = { expense: 'an expense', income: 'an income', budget: 'a budget' } as const;

interface KeyRow {
  id: string;
  clientId: string | null;
  createdByOAuthClientId: string | null;
  isDeleted: boolean;
  isPlanned?: boolean;
}

/** The slice of a Prisma model delegate (`prisma.expense`, `prisma.income`, `prisma.budget`) the lookup needs. */
interface KeyedModel {
  // Prisma's generated delegates are generic over the select; the rows are narrowed to `KeyRow` below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany(args: any): PromiseLike<unknown[]>;
}

/**
 * The `Idempotency-Key` lookup shared by every public create. The key is the row's `clientId`,
 * unique per account. A row under that key that this app did not create (an app write, another
 * integration) is never returned or touched — `409`, so a third party cannot read or overwrite it
 * by guessing its client id. A key equal to another row's server id is refused too: the service
 * resolves ids as `id OR clientId`, so such a row would make later edits of the other row
 * ambiguous. A deleted row (or, for expenses, a planned one) is `409` as well: replaying would
 * resurrect it through the service's upsert.
 *
 * @returns the id of this app's own live row under the key, or `null` when the key is unused.
 */
export async function findOwnByIdempotencyKey(
  model: KeyedModel,
  ctx: { accountId: string; clientDbId: string },
  key: string,
  opts: { noun: 'expense' | 'income' | 'budget'; hasPlanned: boolean }
): Promise<string | null> {
  const rows = (await model.findMany({
    where: { accountId: ctx.accountId, OR: [{ clientId: key }, { id: key }] },
    select: {
      id: true,
      clientId: true,
      createdByOAuthClientId: true,
      isDeleted: true,
      ...(opts.hasPlanned && { isPlanned: true as const }),
    },
    take: 2,
  })) as KeyRow[];
  if (rows.some((r) => r.id === key && r.clientId !== key)) {
    throw keyConflict('This Idempotency-Key is already used by another record. Use a new UUID.');
  }
  const own = rows.find((r) => r.clientId === key);
  if (!own) return null;
  if (own.createdByOAuthClientId !== ctx.clientDbId) {
    throw keyConflict('This Idempotency-Key is already used by another record. Use a new UUID.');
  }
  if (own.isDeleted || own.isPlanned) {
    throw keyConflict(
      `This Idempotency-Key belongs to ${NOUN_PHRASE[opts.noun]} that has since been deleted. Use a new UUID.`
    );
  }
  return own.id;
}
