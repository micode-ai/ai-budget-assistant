import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { logFireAndForget } from '../../common/utils/fire-and-forget';

@Injectable()
export class TripSettleUpReminderCron {
  private readonly logger = new Logger(TripSettleUpReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs daily at 09:00 UTC.
   * Finds `type: 'trip'` accounts whose `tripEndDate` has passed while still
   * `active`, transitions them to `settling`, and notifies every member to
   * settle up. Title/body are localized (`notification-i18n.ts`, matching
   * the pattern in `debt-reminder.cron.ts`). Per-member opt-out via
   * `User.notifyTripSettleUp` is enforced centrally inside
   * `NotificationsService.sendToUser` (same convention as every other
   * reminder type in that gate) — this cron calls `sendToUser` for every
   * member unconditionally and lets the shared gate decide.
   */
  @Cron('0 9 * * *')
  async handleTripEndings() {
    this.logger.log('Running trip settle-up reminder cron...');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const endedTrips = await this.prisma.account.findMany({
      where: { type: 'trip', tripStatus: 'active', tripEndDate: { lt: today } },
      select: { id: true, name: true },
    });

    for (const trip of endedTrips) {
      // Transition status BEFORE notifying members: if the process crashes
      // partway through the notification loop below, the trip is already
      // `settling` rather than stuck on `active` forever.
      await this.prisma.account.update({
        where: { id: trip.id },
        data: { tripStatus: 'settling' },
      });

      const members = await this.prisma.accountMember.findMany({
        where: { accountId: trip.id },
        select: { userId: true },
      });

      for (const member of members) {
        this.notificationsService
          .sendToUser(
            member.userId,
            (lang) => ni18n.tripSettleUpTitle(lang, { tripName: trip.name }),
            (lang) => ni18n.tripSettleUpBody(lang, { tripName: trip.name }),
            { accountId: trip.id },
            'trip_settle_up',
          )
          .catch(logFireAndForget(this.logger, 'TripSettleUpReminderCron.sendToUser'));
      }
    }

    this.logger.log('Trip settle-up reminder cron complete');
  }
}
