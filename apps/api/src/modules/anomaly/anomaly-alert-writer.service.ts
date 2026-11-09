import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateAlertInput } from './anomaly.types';
import { suppressionSubject } from './anomaly-helpers.util';

const PUSH_DAILY_CAP = 3;

/**
 * The one place an anomaly_alerts row is inserted and (optionally) pushed.
 * Extracted so the 6 detectors on AnomalyDetectorsService share this exact
 * dedupKey-via-P2002 + daily-push-cap mechanism instead of each re-implementing
 * its own catch block around `anomalyAlert.create`.
 */
@Injectable()
export class AnomalyAlertWriterService {
  private readonly logger = new Logger(AnomalyAlertWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Insert a feed row (dedupKey collision = already alerted, silent skip) and
   * push it unless the account already received PUSH_DAILY_CAP pushes today.
   */
  async createAlert(input: CreateAlertInput): Promise<void> {
    if (await this.isSuppressed(input)) return;
    let alert: { id: string };
    try {
      alert = await this.prisma.anomalyAlert.create({
        data: {
          accountId: input.accountId,
          userId: input.userId,
          type: input.type,
          dedupKey: input.dedupKey,
          params: input.params as object,
          expenseId: input.expenseId ?? null,
          categoryId: input.categoryId ?? null,
        },
        select: { id: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return; // already alerted for this dedupKey
      throw err;
    }

    if (input.skipPush || !input.pushTitle || !input.pushBody) return;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    // Read-then-act race: two concurrent alerts may both pass the cap check and
    // overshoot by 1-2 pushes. Known and acceptable — the cap is a courtesy limit.
    const sentToday = await this.prisma.anomalyAlert.count({
      where: { accountId: input.accountId, pushSent: true, createdAt: { gte: todayStart } },
    });
    if (sentToday >= PUSH_DAILY_CAP) return;

    const sentOk = await this.notifications.sendToUser(
      input.userId,
      input.pushTitle,
      input.pushBody,
      { alertId: alert.id, anomalyType: input.type, expenseId: input.expenseId },
      'spending_anomaly',
    );
    if (sentOk) {
      await this.prisma.anomalyAlert.update({ where: { id: alert.id }, data: { pushSent: true } });
    }
  }

  /** "Normal for me": the user muted this alert type for this merchant/category. */
  private async isSuppressed(input: CreateAlertInput): Promise<boolean> {
    const subjectKey = suppressionSubject(input.type, input.params, input.categoryId);
    if (!subjectKey) return false;
    try {
      const hit = await this.prisma.anomalySuppression.findUnique({
        where: { accountId_type_subjectKey: { accountId: input.accountId, type: input.type, subjectKey } },
        select: { id: true },
      });
      return !!hit;
    } catch (err) {
      // A failed lookup must not silence real alerts.
      this.logger.warn(`suppression lookup failed: ${err}`);
      return false;
    }
  }
}
