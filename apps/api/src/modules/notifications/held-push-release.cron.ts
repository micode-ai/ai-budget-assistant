import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

/** Delivers pushes held by a user's quiet hours once the window has ended. */
@Injectable()
export class HeldPushReleaseCron {
  private readonly logger = new Logger(HeldPushReleaseCron.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Cron('*/10 * * * *')
  async run(): Promise<void> {
    try {
      const sent = await this.notifications.releaseHeldPushes();
      if (sent > 0) this.logger.log(`Released ${sent} held push(es)`);
    } catch (err) {
      this.logger.warn(`Held push release failed: ${(err as Error).message}`);
    }
  }
}
