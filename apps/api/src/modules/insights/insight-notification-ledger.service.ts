import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationDedupLedger } from '../../common/utils/notification-dedup-ledger';

/**
 * Records which insight pushes (e.g. Inflation Shield stock-up alerts) were
 * already sent, so the daily cron does not re-send the same recommendation
 * every day. Thin subclass of the generic `NotificationDedupLedger` bound to
 * `insightNotificationLog` — see that file for the shared dedup logic.
 */
@Injectable()
export class InsightNotificationLedger extends NotificationDedupLedger {
  constructor(prisma: PrismaService) {
    super(prisma.insightNotificationLog);
  }
}
