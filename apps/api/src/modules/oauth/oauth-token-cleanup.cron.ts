import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { paginateById } from '../../common/utils/paginate';

const BATCH_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * A dynamically registered client with no active grant for this many days is soft-deleted: one
 * that never got a grant (counted from its creation), or whose grants are all revoked (counted from
 * the latest revocation).
 */
export const UNUSED_DCR_CLIENT_DAYS = 30;

@Injectable()
export class OAuthTokenCleanupCron {
  private readonly logger = new Logger(OAuthTokenCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily 03:30 server time. Logs counts only, never token material. */
  @Cron('30 3 * * *')
  async handleCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - DAY_MS);
    const expired = await this.purge({ expiresAt: { lt: cutoff } });
    const revoked = await this.purge({ grant: { revokedAt: { not: null } } });
    const orphaned = await this.revokeAccountlessGrants();
    const unusedClients = await this.softDeleteUnusedDcrClients();
    this.logger.log(
      `OAuth token cleanup: ${expired} expired, ${revoked} of revoked grants deleted, ${orphaned} account-less grants revoked, ` +
        `${unusedClients} unused registered MCP clients removed`,
    );
  }

  /**
   * Deleted rows vanish from the next query, so the page fetch deliberately ignores the cursor
   * (a cursor on a deleted row would throw); every page is simply the first remaining batch.
   */
  private async purge(where: object): Promise<number> {
    let total = 0;
    const pages = paginateById(
      () =>
        this.prisma.oAuthToken.findMany({
          where,
          select: { id: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
        }),
      BATCH_SIZE,
    );
    for await (const page of pages) {
      const r = await this.prisma.oAuthToken.deleteMany({ where: { id: { in: page.map((t) => t.id) } } });
      total += r.count;
    }
    return total;
  }

  /**
   * A grant with no join row pointing at an ACTIVE account (hard-deleted by FK cascade, or
   * soft-deleted without going through dropAccountFromGrants) authorizes nothing, so revoke it.
   */
  private async revokeAccountlessGrants(): Promise<number> {
    let total = 0;
    const pages = paginateById(
      () =>
        this.prisma.oAuthGrant.findMany({
          where: { revokedAt: null, accounts: { none: { account: { isActive: true } } } },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
        }),
      BATCH_SIZE,
    );
    for await (const page of pages) {
      const grantId = { in: page.map((g) => g.id) };
      await this.prisma.oAuthToken.deleteMany({ where: { grantId } });
      const r = await this.prisma.oAuthGrant.updateMany({
        where: { id: grantId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: 'user' },
      });
      total += r.count;
    }
    return total;
  }

  /**
   * Dynamic registration is open to anyone, so clients that never led to a consent pile up — and so
   * do clients whose every grant was revoked (each smoke run, every user who disconnected). A
   * `mcp_dcr` client older than 30 days is soft-deleted (`deletedAt`, which makes its client_id
   * unknown everywhere) when it has no grant that is active or was revoked within the last 30 days:
   * that is, no grant at all, or only grants whose latest `revokedAt` is over 30 days old (R8). A
   * manual client and a client with any active grant are never matched. The update repeats the
   * conditions, so a grant created (or revoked) between the read and the write keeps the client
   * alive. As in purge(), updated rows leave the query, so each page is the first remaining batch.
   */
  private async softDeleteUnusedDcrClients(): Promise<number> {
    const cutoff = new Date(Date.now() - UNUSED_DCR_CLIENT_DAYS * DAY_MS);
    const stale = {
      source: 'mcp_dcr' as const,
      deletedAt: null,
      grants: { none: { OR: [{ revokedAt: null }, { revokedAt: { gte: cutoff } }] } },
    };
    let total = 0;
    const pages = paginateById(
      () =>
        this.prisma.oAuthClient.findMany({
          where: { ...stale, createdAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
        }),
      BATCH_SIZE,
    );
    for await (const page of pages) {
      const r = await this.prisma.oAuthClient.updateMany({
        where: { id: { in: page.map((c) => c.id) }, ...stale },
        data: { deletedAt: new Date() },
      });
      total += r.count;
    }
    return total;
  }
}
