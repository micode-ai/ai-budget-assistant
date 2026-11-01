import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { paginateById } from '../../common/utils/paginate';

const BATCH_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    this.logger.log(`OAuth token cleanup: ${expired} expired, ${revoked} of revoked grants deleted`);
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
}
