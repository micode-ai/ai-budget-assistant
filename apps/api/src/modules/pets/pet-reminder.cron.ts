import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as pi18n from '../notifications/pet-reminder-i18n';
import { paginateById } from '../../common/utils/paginate';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { duePetReminders } from './pet-reminder.util';

const BATCH_SIZE = 500;

/**
 * Daily push 14 and 2 days before a pet's next vaccination or flea-and-tick
 * treatment (ABA-831), to the user who added the pet. Under the renewals
 * switch (`subscription_renewal`), like the vehicle renewal reminders.
 */
@Injectable()
export class PetReminderCron {
  private readonly logger = new Logger(PetReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // No parameter on the scheduled method: the cron library calls its tick with its own arguments.
  @Cron('15 8 * * *')
  async run(): Promise<void> {
    await this.runFor(new Date());
  }

  /** One pass for `today`; returns how many pushes were queued. */
  async runFor(today: Date): Promise<number> {
    const pages = paginateById(
      (cursor) =>
        this.prisma.pet.findMany({
          where: {
            isDeleted: false,
            OR: [{ nextVaccinationDate: { not: null } }, { nextParasiteTreatmentDate: { not: null } }],
          },
          select: { id: true, userId: true, name: true, nextVaccinationDate: true, nextParasiteTreatmentDate: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    let sent = 0;
    for await (const pets of pages) {
      for (const p of pets) {
        for (const { kind, days } of duePetReminders(p, today)) {
          sent++;
          this.notifications
            .sendToUser(
              p.userId,
              (lang) => pi18n.petReminderTitle(lang, { name: p.name, kind, days }),
              (lang) => pi18n.petReminderBody(lang, { kind }),
              { petId: p.id, petReminderKind: kind },
              'subscription_renewal',
            )
            .catch(logFireAndForget(this.logger, 'PetReminderCron.sendToUser'));
        }
      }
    }
    this.logger.log(`pet care reminders: ${sent} sent`);
    return sent;
  }
}
