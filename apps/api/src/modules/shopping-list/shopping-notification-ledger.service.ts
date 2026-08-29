import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationDedupLedger } from '../../common/utils/notification-dedup-ledger';

/**
 * Records which shopping pushes were already sent, so the daily cron does not
 * re-send the same restock reminder every day. Thin subclass of the generic
 * `NotificationDedupLedger` bound to `shoppingNotificationLog` — see that
 * file for the shared dedup logic.
 */
@Injectable()
export class ShoppingNotificationLedger extends NotificationDedupLedger {
  constructor(prisma: PrismaService) {
    super(prisma.shoppingNotificationLog);
  }
}
