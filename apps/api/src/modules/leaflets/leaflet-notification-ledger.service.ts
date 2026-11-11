import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationDedupLedger } from '../../common/utils/notification-dedup-ledger';

/**
 * Records which community promos were already pushed (Gazetka match), bound to
 * `leafletNotificationLog`: `accountId` is the user's `defaultAccountId` (the basket's account) and
 * `dedupKey` is the promo key. Thin subclass of the generic `NotificationDedupLedger`.
 *
 * Two additions the shopping/insight ledgers do not need: the push carries the log row's `id` as
 * its `pushKey` (for open tracking), so recording returns that id; and the cron filters out
 * already-pushed promos BEFORE the model call, so a promo pushed yesterday costs no tokens today.
 */
@Injectable()
export class LeafletNotificationLedger extends NotificationDedupLedger {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.leafletNotificationLog);
  }

  /** Inserts the row and returns its id (the push's `pushKey`); null when already recorded (P2002). */
  async recordWithId(accountId: string, type: string, dedupKey: string): Promise<string | null> {
    try {
      const row = await this.prisma.leafletNotificationLog.create({ data: { accountId, type, dedupKey } });
      return row.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      throw e;
    }
  }

  /** The subset of `dedupKeys` already recorded for this account. */
  async recordedKeys(accountId: string, dedupKeys: string[]): Promise<Set<string>> {
    if (dedupKeys.length === 0) return new Set();
    const rows = await this.prisma.leafletNotificationLog.findMany({
      where: { accountId, dedupKey: { in: dedupKeys } },
      select: { dedupKey: true },
    });
    return new Set(rows.map((r) => r.dedupKey));
  }
}
