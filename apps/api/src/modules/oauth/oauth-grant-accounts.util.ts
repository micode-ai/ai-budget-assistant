import type { AccountRole, AccountType, Prisma, TripStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/** Roles that may connect an account to an app (re-checked on every request). */
export const GRANTING_ROLES: ReadonlySet<string> = new Set(['owner', 'editor']);

export interface GrantAccountState {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: string;
  encryptionTier: number;
  tripStatus: TripStatus | null;
  /** The grantor's CURRENT role in the account; null when no longer a member. */
  role: AccountRole | null;
}

export type GrantAccountReason = 'role' | 'encrypted' | 'archived';

/** Precedence: role, then encryption, then archived trip (still active, read-only for writes). */
export function grantAccountStatus(s: GrantAccountState): { active: boolean; reason: GrantAccountReason | null } {
  if (s.role === null || !GRANTING_ROLES.has(s.role)) return { active: false, reason: 'role' };
  if (s.encryptionTier >= 2) return { active: false, reason: 'encrypted' };
  if (s.tripStatus === 'archived') return { active: true, reason: 'archived' };
  return { active: true, reason: null };
}

export function grantAccountAccess(s: GrantAccountState, scopes: readonly string[]): 'read' | 'read_write' {
  const { active, reason } = grantAccountStatus(s);
  return active && reason === null && s.encryptionTier === 0 && scopes.includes('expenses:write')
    ? 'read_write'
    : 'read';
}

/** Active accounts of a grant, in connection order, with the grantor's current role in each. */
export async function loadGrantAccountStates(
  db: PrismaService | Prisma.TransactionClient,
  grantId: string,
  grantorId: string,
): Promise<GrantAccountState[]> {
  const rows = await db.oAuthGrantAccount.findMany({
    where: { grantId, account: { isActive: true } },
    orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
    select: {
      account: {
        select: { id: true, name: true, type: true, currencyCode: true, encryptionTier: true, tripStatus: true },
      },
    },
  });
  const memberships = await db.accountMember.findMany({
    where: { userId: grantorId, accountId: { in: rows.map((r) => r.account.id) } },
    select: { accountId: true, role: true },
  });
  const roleOf = new Map(memberships.map((m) => [m.accountId, m.role]));
  return rows.map((r) => ({ ...r.account, role: roleOf.get(r.account.id) ?? null }));
}

/**
 * Removes a (deleted) account from every grant. Grants left with no account are revoked and their
 * tokens deleted, in the caller's transaction.
 */
export async function dropAccountFromGrants(tx: Prisma.TransactionClient, accountId: string): Promise<void> {
  const joins = await tx.oAuthGrantAccount.findMany({ where: { accountId }, select: { grantId: true } });
  if (joins.length === 0) return;
  await tx.oAuthGrantAccount.deleteMany({ where: { accountId } });
  const emptied = await tx.oAuthGrant.findMany({
    where: { id: { in: joins.map((j) => j.grantId) }, revokedAt: null, accounts: { none: {} } },
    select: { id: true },
  });
  if (emptied.length === 0) return;
  const ids = emptied.map((g) => g.id);
  await tx.oAuthToken.deleteMany({ where: { grantId: { in: ids } } });
  await tx.oAuthGrant.updateMany({
    where: { id: { in: ids }, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy: 'user' },
  });
}
