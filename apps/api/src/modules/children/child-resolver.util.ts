import type { Prisma, PrismaClient } from '@prisma/client';

type ChildClient = Pick<PrismaClient, 'child'> | Pick<Prisma.TransactionClient, 'child'>;

/**
 * Resolve a child id the client sent — the server PK or the device's local
 * `clientId` (offline-first) — to the server PK, scoped to the account.
 * `null` when no live child of this account matches.
 */
export async function resolveChildPk(
  client: ChildClient,
  accountId: string,
  idOrClientId: string,
): Promise<string | null> {
  const row = await client.child.findFirst({
    where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Tri-state child reference for a write (`ExpenseItem.childId`,
 * `Income.childBenefitChildId`):
 *   - `undefined` (absent) → `undefined`: leave the column alone;
 *   - `null` → `null`: clear it;
 *   - a string → the resolved server PK, or `undefined` when it does not resolve
 *     (a child of another account, or one not synced yet) — an unresolvable id
 *     must never erase a link the row already has. Callers creating a row use
 *     `?? null` on the result.
 */
export async function resolveChildIdForWrite(
  client: ChildClient,
  accountId: string,
  value: string | null | undefined,
): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return (await resolveChildPk(client, accountId, value)) ?? undefined;
}
