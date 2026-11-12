import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OAuthGrant, OAuthRevokedBy } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PublicScope } from './oauth-scopes';
import { GRANTING_ROLES, grantAccountStatus, type GrantAccountState } from './oauth-grant-accounts.util';

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

const GRANTING_ROLE_LIST = [...GRANTING_ROLES] as ('owner' | 'editor')[];

export interface ConnectedAppAccountRow {
  id: string;
  /** null when the grantor is no longer a member: the current name is not revealed. */
  name: string | null;
  type: string;
  active: boolean;
  reason: 'role' | 'encrypted' | 'archived' | null;
}

export interface ConnectedAppRow {
  grantId: string;
  isGrantor: boolean;
  app: {
    name: string;
    logoUrl: string | null;
    /** Null for an assistant-registered app (R11): its homepage is self-declared, never a link. */
    homepageUrl: string | null;
    isVerified: boolean;
    status: string;
    /** Registered by an AI assistant through dynamic client registration (`source = 'mcp_dcr'`). */
    registeredByAssistant: boolean;
  };
  accounts: ConnectedAppAccountRow[];
  /** = accounts[0]; kept for phase 1 clients. */
  account: { id: string; name: string };
  scopes: string[];
  connectedBy: { id: string; name: string };
  connectedAt: Date;
  lastUsedAt: Date | null;
}

/**
 * A grant is one user's consent for one app (`clientDbId` = OAuthClient.id) on a SET of accounts
 * (`oauth_grant_accounts`). At most one ACTIVE grant per (client, user), enforced by the raw
 * partial unique index `oauth_grants_active_client_user_key` (Prisma cannot model it, so there is
 * no `upsert` target).
 */
@Injectable()
export class OAuthGrantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Re-approval reuses the active grant, REPLACES its account set and its scopes (the consent
   * screen just showed exactly these). Find-then-create is not atomic: a concurrent approve that
   * loses the race hits the partial index (P2002), so it re-fetches the winner's row and replaces that.
   */
  async replaceActive(
    clientDbId: string,
    userId: string,
    accountIds: string[],
    scopes: PublicScope[],
  ): Promise<{ grant: OAuthGrant; isNew: boolean; addedAccountIds: string[] }> {
    // A grant must never be left active with no account.
    if (accountIds.length === 0) throw new BadRequestException('a grant needs at least one account');
    const where = { clientId: clientDbId, userId, revokedAt: null };
    const existing = await this.prisma.oAuthGrant.findFirst({ where, select: { id: true } });
    if (existing) return this.replaceOn(existing.id, accountIds, scopes);
    try {
      const grant = await this.prisma.oAuthGrant.create({
        data: {
          clientId: clientDbId,
          userId,
          scopes,
          accounts: { create: accountIds.map((accountId) => ({ accountId })) },
        },
      });
      return { grant, isNew: true, addedAccountIds: [...accountIds] };
    } catch (e) {
      if (!isP2002(e)) throw e;
      const winner = await this.prisma.oAuthGrant.findFirst({ where, select: { id: true } });
      if (!winner) throw e;
      return this.replaceOn(winner.id, accountIds, scopes);
    }
  }

  /** Revokes the grant (idempotent: an already-revoked grant keeps its original stamp) and deletes its tokens. */
  async revoke(grantId: string, by: OAuthRevokedBy): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.oAuthToken.deleteMany({ where: { grantId } }),
      this.prisma.oAuthGrant.updateMany({
        where: { id: grantId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: by },
      }),
    ]);
  }

  /** Drops those accounts from the grant; a grant left with no account is revoked. */
  async removeAccounts(grantId: string, accountIds: string[]): Promise<{ revoked: boolean }> {
    const left = await this.prisma.$transaction(async (tx) => {
      await tx.oAuthGrantAccount.deleteMany({ where: { grantId, accountId: { in: accountIds } } });
      return tx.oAuthGrantAccount.count({ where: { grantId } });
    });
    if (left > 0) return { revoked: false };
    await this.revoke(grantId, 'user');
    return { revoked: true };
  }

  /**
   * "Connected apps": active grants of non-deleted clients the caller made, or that cover at least
   * one account where the caller is CURRENTLY owner/editor. The grantor sees every granted account
   * (with its per-account state); a co-owner sees only the granted accounts they themselves
   * own/edit, never the grantor's others. Rows with nothing visible are dropped. A grant may have
   * no tokens, and `lastUsedAt` may be null. Blocked clients stay listed so the UI can say so.
   */
  async listConnectedApps(userId: string): Promise<ConnectedAppRow[]> {
    const rows = await this.prisma.oAuthGrant.findMany({
      where: {
        revokedAt: null,
        client: { deletedAt: null },
        OR: [
          { userId },
          {
            accounts: {
              some: {
                account: { isActive: true, members: { some: { userId, role: { in: GRANTING_ROLE_LIST } } } },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        client: {
          select: { name: true, logoUrl: true, homepageUrl: true, isVerified: true, status: true, source: true },
        },
        user: { select: { id: true, name: true } },
        accounts: {
          where: { account: { isActive: true } },
          orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
          select: {
            account: {
              select: {
                id: true,
                name: true,
                type: true,
                currencyCode: true,
                encryptionTier: true,
                tripStatus: true,
                members: { select: { userId: true, role: true } },
              },
            },
          },
        },
      },
    });

    const out: ConnectedAppRow[] = [];
    for (const g of rows) {
      const isGrantor = g.userId === userId;
      const accounts: ConnectedAppAccountRow[] = [];
      for (const { account } of g.accounts) {
        const callerRole = account.members.find((m) => m.userId === userId)?.role;
        if (!isGrantor && !(callerRole && GRANTING_ROLES.has(callerRole))) continue;
        const state: GrantAccountState = {
          id: account.id,
          name: account.name,
          type: account.type,
          currencyCode: account.currencyCode,
          encryptionTier: account.encryptionTier,
          tripStatus: account.tripStatus,
          role: account.members.find((m) => m.userId === g.userId)?.role ?? null,
        };
        const { active, reason } = grantAccountStatus(state);
        accounts.push({
          id: account.id,
          name: state.role === null ? null : account.name,
          type: account.type,
          active,
          reason,
        });
      }
      if (accounts.length === 0) continue;
      out.push({
        grantId: g.id,
        isGrantor,
        app: {
          name: g.client.name,
          logoUrl: g.client.logoUrl,
          // R11: a self-declared homepage of an assistant-registered app is never sent as a link,
          // so no client (including an app version that predates the flag) can render it as one.
          homepageUrl: g.client.source === 'mcp_dcr' ? null : g.client.homepageUrl,
          isVerified: g.client.isVerified,
          status: g.client.status,
          registeredByAssistant: g.client.source === 'mcp_dcr',
        },
        accounts,
        account: { id: accounts[0].id, name: accounts[0].name ?? '' },
        scopes: g.scopes,
        connectedBy: { id: g.user.id, name: g.user.name },
        connectedAt: g.createdAt,
        lastUsedAt: g.lastUsedAt ?? null,
      });
    }
    return out;
  }

  /**
   * The grantor revokes the whole connection; anyone else (an owner/editor of a granted account)
   * only removes the granted accounts they own/edit. 404 (no existence leak) when nothing applies.
   */
  async disconnectAsUser(userId: string, grantId: string): Promise<void> {
    const grant = await this.prisma.oAuthGrant.findFirst({
      where: { id: grantId, revokedAt: null },
      select: { id: true, userId: true, accounts: { select: { accountId: true } } },
    });
    if (!grant) throw new NotFoundException('Connected app not found');
    if (grant.userId === userId) {
      await this.revoke(grant.id, 'user');
      return;
    }
    const mine = await this.prisma.accountMember.findMany({
      where: {
        userId,
        role: { in: GRANTING_ROLE_LIST },
        accountId: { in: grant.accounts.map((a) => a.accountId) },
      },
      select: { accountId: true },
    });
    if (mine.length === 0) throw new NotFoundException('Connected app not found');
    await this.removeAccounts(grant.id, mine.map((m) => m.accountId));
  }

  /** Removes one account from a connection: the grantor, or an owner/editor of that very account. */
  async removeAccountAsUser(userId: string, grantId: string, accountId: string): Promise<void> {
    const grant = await this.prisma.oAuthGrant.findFirst({
      where: { id: grantId, revokedAt: null, accounts: { some: { accountId } } },
      select: { id: true, userId: true },
    });
    if (!grant) throw new NotFoundException('Connected app not found');
    if (grant.userId !== userId) {
      const m = await this.prisma.accountMember.findFirst({
        where: { userId, accountId, role: { in: GRANTING_ROLE_LIST } },
        select: { accountId: true },
      });
      if (!m) throw new NotFoundException('Connected app not found');
    }
    await this.removeAccounts(grant.id, [accountId]);
  }

  private replaceOn(
    grantId: string,
    accountIds: string[],
    scopes: PublicScope[],
  ): Promise<{ grant: OAuthGrant; isNew: boolean; addedAccountIds: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.oAuthGrantAccount.findMany({ where: { grantId }, select: { accountId: true } });
      const had = new Set(before.map((b) => b.accountId));
      await tx.oAuthGrantAccount.deleteMany({ where: { grantId, accountId: { notIn: accountIds } } });
      await tx.oAuthGrantAccount.createMany({
        data: accountIds.map((accountId) => ({ grantId, accountId })),
        skipDuplicates: true,
      });
      const grant = await tx.oAuthGrant.update({ where: { id: grantId }, data: { scopes } });
      return { grant, isNew: false, addedAccountIds: accountIds.filter((a) => !had.has(a)) };
    });
  }
}
