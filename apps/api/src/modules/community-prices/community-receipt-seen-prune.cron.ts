import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

/** `community_receipt_seen` rows older than this many weeks are dead weight: the
 *  scan token that could replay them is valid for 24 h and the recency gate is 14 d. */
export const RECEIPT_SEEN_RETENTION_WEEKS = 12;

/**
 * Weekly prune of the one-physical-receipt dedup table (ABA-642 D4). The table has
 * no account/user/contributor link, so there is nothing to scope per account.
 */
@Injectable()
export class CommunityReceiptSeenPruneCron {
  private readonly logger = new Logger(CommunityReceiptSeenPruneCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Sundays 03:30 UTC. */
  @Cron('30 3 * * 0')
  async prune(now: Date = new Date()): Promise<number> {
    try {
      const cutoff = new Date(now.getTime() - RECEIPT_SEEN_RETENTION_WEEKS * 7 * 24 * 60 * 60 * 1000);
      const { count } = await this.prisma.communityReceiptSeen.deleteMany({ where: { weekStart: { lt: cutoff } } });
      if (count > 0) this.logger.log(`pruned ${count} community_receipt_seen rows`);
      // Store-pin candidates age out too (a published pin lives on in community_store_geo).
      await this.prisma.communityStorePinCandidate.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return count;
    } catch (e) {
      this.logger.warn(`prune failed: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }
}
