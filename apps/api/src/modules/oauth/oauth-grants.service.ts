import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OAuthGrant, OAuthRevokedBy } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PublicScope } from './oauth-scopes';

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * A grant is one user's consent for one app (`clientDbId` = OAuthClient.id) on one account.
 * At most one ACTIVE grant per (client, user, account), enforced by the raw partial unique index
 * `oauth_grants_active_key` (Prisma cannot model it, so there is no `upsert` target).
 */
@Injectable()
export class OAuthGrantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Re-approval reuses the active grant and REPLACES its scopes (the consent screen just showed
   * exactly these). Find-then-create is not atomic: a concurrent approve that loses the race hits
   * the partial index (P2002), so it re-fetches the winner's row and updates that instead.
   */
  async upsertActive(
    clientDbId: string,
    userId: string,
    accountId: string,
    scopes: PublicScope[],
  ): Promise<{ grant: OAuthGrant; isNew: boolean }> {
    const where = { clientId: clientDbId, userId, accountId, revokedAt: null };
    const existing = await this.prisma.oAuthGrant.findFirst({ where });
    if (existing) {
      return { grant: await this.replaceScopes(existing.id, scopes), isNew: false };
    }
    try {
      const grant = await this.prisma.oAuthGrant.create({
        data: { clientId: clientDbId, userId, accountId, scopes },
      });
      return { grant, isNew: true };
    } catch (e) {
      if (!isP2002(e)) throw e;
      const winner = await this.prisma.oAuthGrant.findFirst({ where });
      if (!winner) throw e;
      return { grant: await this.replaceScopes(winner.id, scopes), isNew: false };
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

  /** Where-clause: the grant sits on an account where `userId` is CURRENTLY owner or editor. */
  private writableBy(userId: string): Prisma.OAuthGrantWhereInput {
    return { account: { members: { some: { userId, role: { in: ['owner', 'editor'] } } } } };
  }

  /**
   * "Connected apps": active grants of non-deleted clients on every account where the caller is
   * owner/editor (viewers get nothing for that account). A grant may have no tokens, and
   * `lastUsedAt` may be null. Blocked clients stay listed so the UI can say so.
   */
  async listConnectedApps(userId: string) {
    const rows = await this.prisma.oAuthGrant.findMany({
      where: { revokedAt: null, client: { deletedAt: null }, ...this.writableBy(userId) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        client: {
          select: { name: true, logoUrl: true, homepageUrl: true, isVerified: true, status: true },
        },
        account: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return rows.map((g) => ({
      grantId: g.id,
      app: {
        name: g.client.name,
        logoUrl: g.client.logoUrl,
        homepageUrl: g.client.homepageUrl,
        isVerified: g.client.isVerified,
        status: g.client.status,
      },
      account: { id: g.account.id, name: g.account.name },
      scopes: g.scopes,
      connectedBy: { id: g.user.id, name: g.user.name },
      connectedAt: g.createdAt,
      lastUsedAt: g.lastUsedAt ?? null,
    }));
  }

  /** Revokes as the user; 404 (no existence leak) unless the caller is owner/editor of the grant's account. */
  async revokeAsMember(userId: string, grantId: string): Promise<void> {
    const grant = await this.prisma.oAuthGrant.findFirst({
      where: { id: grantId, revokedAt: null, ...this.writableBy(userId) },
      select: { id: true },
    });
    if (!grant) throw new NotFoundException('Connected app not found');
    await this.revoke(grant.id, 'user');
  }

  private replaceScopes(id: string, scopes: PublicScope[]): Promise<OAuthGrant> {
    return this.prisma.oAuthGrant.update({ where: { id }, data: { scopes } });
  }
}
