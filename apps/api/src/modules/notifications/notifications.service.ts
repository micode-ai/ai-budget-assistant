import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { NotificationType } from '@budget/shared-types';
import { isInQuietHours, quietHoursReleaseAt } from './quiet-hours.util';

/** Untyped (security/system) pushes are never held either; see holdIfQuiet. */
const QUIET_HOURS_EXEMPT: ReadonlySet<string> = new Set(['voice_digest_disabled']);

/** Notification type -> the User preference column that governs it (used when releasing held pushes). */
const NOTIFY_FLAGS: Record<string, string> = {
  budget_alert: 'notifyBudgetAlerts',
  spending_anomaly: 'notifyAnomalyAlerts',
  shared_expense: 'notifySharedActivity',
  chat_mention: 'notifySharedActivity',
  debt_reminder: 'notifyDebtReminders',
  recurring_expense: 'notifyRecurringExpenses',
  subscription_renewal: 'notifySubscriptionRenewals',
  tracking_gap_reminder: 'notifyTrackingGap',
  activation_nudge: 'notifyTrackingGap',
  purchase_request_created: 'notifyPurchaseRequests',
  purchase_request_voted: 'notifyPurchaseRequests',
  purchase_request_approved: 'notifyPurchaseRequests',
  purchase_request_rejected: 'notifyPurchaseRequests',
  trip_settle_up: 'notifyTripSettleUp',
  shopping_reminder: 'notifyShoppingReminders',
  shopping_deal: 'notifyShoppingDeals',
  inflation_shield: 'notifyInflationShield',
  monthly_wrapped: 'notifyMonthlyWrapped',
  group_activity: 'notifyGroupActivity',
  group_reminder: 'notifyGroupReminders',
  leaflet_promo: 'notifyLeafletPromos',
};

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  private readonly BATCH_SIZE = 100;

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(
    userId: string,
    title: string | ((lang: string) => string),
    body: string | ((lang: string) => string),
    data?: Record<string, unknown>,
    notificationType?: NotificationType,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushToken: true,
        language: true,
        notifyBudgetAlerts: true,
        notifySharedActivity: true,
        notifyDebtReminders: true,
        notifyRecurringExpenses: true,
        notifySubscriptionRenewals: true,
        notifyAnomalyAlerts: true,
        notifyTrackingGap: true,
        notifyPurchaseRequests: true,
        notifyTripSettleUp: true,
        notifyShoppingReminders: true,
        notifyShoppingDeals: true,
        notifyInflationShield: true,
        notifyMonthlyWrapped: true,
        notifyGroupActivity: true,
        notifyGroupReminders: true,
        notifyLeafletPromos: true,
        timezone: true,
        quietHoursEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });

    if (!user?.pushToken) return false;

    if (notificationType === 'budget_alert' && !user.notifyBudgetAlerts) return false;
    if (notificationType === 'spending_anomaly' && !user.notifyAnomalyAlerts) return false;
    if (notificationType === 'shared_expense' && !user.notifySharedActivity) return false;
    if (notificationType === 'debt_reminder' && !user.notifyDebtReminders) return false;
    if (notificationType === 'recurring_expense' && !user.notifyRecurringExpenses) return false;
    if (notificationType === 'chat_mention' && !user.notifySharedActivity) return false;
    if (notificationType === 'subscription_renewal' && !user.notifySubscriptionRenewals) return false;
    if (notificationType === 'tracking_gap_reminder' && !user.notifyTrackingGap) return false;
    // ABA-737: the first-transaction nudge is a tracking reminder too, under the same switch.
    if (notificationType === 'activation_nudge' && !user.notifyTrackingGap) return false;
    if (notificationType === 'purchase_request_created' && !user.notifyPurchaseRequests) return false;
    if (notificationType === 'purchase_request_voted' && !user.notifyPurchaseRequests) return false;
    if (notificationType === 'purchase_request_approved' && !user.notifyPurchaseRequests) return false;
    if (notificationType === 'purchase_request_rejected' && !user.notifyPurchaseRequests) return false;
    if (notificationType === 'trip_settle_up' && !user.notifyTripSettleUp) return false;
    if (notificationType === 'shopping_reminder' && !user.notifyShoppingReminders) return false;
    if (notificationType === 'shopping_deal' && !user.notifyShoppingDeals) return false;
    if (notificationType === 'inflation_shield' && !user.notifyInflationShield) return false;
    if (notificationType === 'monthly_wrapped' && !user.notifyMonthlyWrapped) return false;
    if (notificationType === 'group_activity' && !user.notifyGroupActivity) return false;
    if (notificationType === 'group_reminder' && !user.notifyGroupReminders) return false;
    if (notificationType === 'leaflet_promo' && !user.notifyLeafletPromos) return false;

    if (!this.isValidExpoPushToken(user.pushToken)) {
      this.logger.warn(`Invalid push token for user ${userId}, clearing`);
      await this.clearPushToken(userId);
      return false;
    }

    const lang = user.language || 'en';
    const resolvedTitle = typeof title === 'function' ? title(lang) : title;
    const resolvedBody = typeof body === 'function' ? body(lang) : body;

    if (await this.holdIfQuiet(user, userId, resolvedTitle, resolvedBody, data, notificationType)) return true;

    const tickets = await this.sendPushNotifications([{
      to: user.pushToken,
      title: resolvedTitle,
      body: resolvedBody,
      data: { ...data, type: notificationType },
      sound: 'default',
    }]);

    await this.handleTicketErrors(tickets, [{ userId, token: user.pushToken }]);

    return tickets.length > 0 && tickets[0].status === 'ok';
  }

  async sendToUsers(
    userIds: string[],
    title: string | ((lang: string) => string),
    body: string | ((lang: string) => string),
    data?: Record<string, unknown>,
    notificationType?: NotificationType,
  ): Promise<void> {
    if (userIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        pushToken: true,
        language: true,
        notifyBudgetAlerts: true,
        notifySharedActivity: true,
        notifyDebtReminders: true,
        notifyRecurringExpenses: true,
        notifyAnomalyAlerts: true,
        notifyPurchaseRequests: true,
        notifyInflationShield: true,
        notifyMonthlyWrapped: true,
        notifyGroupActivity: true,
        notifyGroupReminders: true,
        notifyLeafletPromos: true,
        timezone: true,
        quietHoursEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });

    type UserWithToken = typeof users[number];
    let eligible = users.filter((u: UserWithToken) => {
      if (!u.pushToken || !this.isValidExpoPushToken(u.pushToken)) return false;
      if (notificationType === 'budget_alert' && !u.notifyBudgetAlerts) return false;
      if (notificationType === 'spending_anomaly' && !u.notifyAnomalyAlerts) return false;
      if (notificationType === 'shared_expense' && !u.notifySharedActivity) return false;
      if (notificationType === 'debt_reminder' && !u.notifyDebtReminders) return false;
      if (notificationType === 'recurring_expense' && !u.notifyRecurringExpenses) return false;
      if (notificationType === 'chat_mention' && !u.notifySharedActivity) return false;
      if (notificationType === 'purchase_request_created' && !u.notifyPurchaseRequests) return false;
      if (notificationType === 'purchase_request_voted' && !u.notifyPurchaseRequests) return false;
      if (notificationType === 'purchase_request_approved' && !u.notifyPurchaseRequests) return false;
      if (notificationType === 'purchase_request_rejected' && !u.notifyPurchaseRequests) return false;
      if (notificationType === 'inflation_shield' && !u.notifyInflationShield) return false;
      if (notificationType === 'monthly_wrapped' && !u.notifyMonthlyWrapped) return false;
      if (notificationType === 'group_activity' && !u.notifyGroupActivity) return false;
      if (notificationType === 'group_reminder' && !u.notifyGroupReminders) return false;
      if (notificationType === 'leaflet_promo' && !u.notifyLeafletPromos) return false;
      return true;
    });

    if (eligible.length === 0) return;

    const now = new Date();
    const toSend: UserWithToken[] = [];
    for (const u of eligible) {
      const lang = u.language || 'en';
      const held = await this.holdIfQuiet(
        u,
        u.id,
        typeof title === 'function' ? title(lang) : title,
        typeof body === 'function' ? body(lang) : body,
        data,
        notificationType,
        now,
      );
      if (!held) toSend.push(u);
    }
    eligible = toSend;
    if (eligible.length === 0) return;

    const messages: ExpoPushMessage[] = eligible.map((u: UserWithToken) => {
      const lang = u.language || 'en';
      return {
        to: u.pushToken!,
        title: typeof title === 'function' ? title(lang) : title,
        body: typeof body === 'function' ? body(lang) : body,
        data: { ...data, type: notificationType },
        sound: 'default',
      };
    });

    for (let i = 0; i < messages.length; i += this.BATCH_SIZE) {
      const batch = messages.slice(i, i + this.BATCH_SIZE);
      const tokenMap = eligible.slice(i, i + this.BATCH_SIZE)
        .map((u: UserWithToken) => ({ userId: u.id, token: u.pushToken! }));

      const tickets = await this.sendPushNotifications(batch);
      await this.handleTicketErrors(tickets, tokenMap);
    }
  }

  /** Queue the push for the end of the user's quiet window. True when it was held. */
  private async holdIfQuiet(
    user: { timezone?: string | null; quietHoursEnabled?: boolean; quietHoursStart?: number; quietHoursEnd?: number },
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown> | undefined,
    notificationType: NotificationType | undefined,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!user.quietHoursEnabled || !notificationType || QUIET_HOURS_EXEMPT.has(notificationType)) return false;
    const start = user.quietHoursStart ?? 1320;
    const end = user.quietHoursEnd ?? 480;
    if (!isInQuietHours(now, user.timezone, start, end)) return false;
    try {
      await this.prisma.heldPush.create({
        data: {
          userId,
          title,
          body,
          data: { ...(data ?? {}), type: notificationType } as object,
          type: notificationType,
          releaseAt: quietHoursReleaseAt(now, user.timezone, end),
        },
      });
      return true;
    } catch (err) {
      // Failing to queue must not lose the push: deliver it now instead.
      this.logger.warn(`Could not hold push for user ${userId}: ${(err as Error).message}`);
      return false;
    }
  }

  /** True when the user has switched off the preference that governs this notification type. */
  private isTypeDisabled(
    u: Record<string, unknown> | null | undefined,
    type: string | null | undefined,
  ): boolean {
    const flag = type ? NOTIFY_FLAGS[type] : undefined;
    return !!flag && !!u && !u[flag];
  }

  /** Delivers held pushes that are due. Returns how many were sent. */
  async releaseHeldPushes(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.heldPush.findMany({
      where: { releaseAt: { lte: now } },
      orderBy: { releaseAt: 'asc' },
      take: 500,
      include: {
        user: {
          select: {
            pushToken: true,
            notifyBudgetAlerts: true,
            notifySharedActivity: true,
            notifyDebtReminders: true,
            notifyRecurringExpenses: true,
            notifyAnomalyAlerts: true,
            notifyPurchaseRequests: true,
            notifyInflationShield: true,
            notifyMonthlyWrapped: true,
            notifyGroupActivity: true,
            notifyGroupReminders: true,
            notifyLeafletPromos: true,
            notifySubscriptionRenewals: true,
            notifyTrackingGap: true,
            notifyTripSettleUp: true,
            notifyShoppingReminders: true,
            notifyShoppingDeals: true,
          },
        },
      },
    });
    let sent = 0;
    for (const row of due) {
      try {
        // Claim the row first (CAS on delete): a concurrent tick or a throw after a successful
        // send can then never deliver it twice.
        const claimed = await this.prisma.heldPush.deleteMany({ where: { id: row.id } });
        if (claimed.count === 0) continue;

        const token = row.user?.pushToken;
        // The preference may have been switched off while the push was waiting.
        if (!token || !this.isValidExpoPushToken(token) || this.isTypeDisabled(row.user, row.type)) continue;

        const tickets = await this.sendPushNotifications([
          { to: token, title: row.title, body: row.body, data: (row.data as Record<string, unknown>) ?? undefined, sound: 'default' },
        ]);
        if (tickets.length === 0) {
          // Transport failure: re-queue for the next tick.
          await this.prisma.heldPush.create({
            data: {
              userId: row.userId,
              title: row.title,
              body: row.body,
              data: (row.data ?? {}) as object,
              type: row.type,
              releaseAt: row.releaseAt,
            },
          });
          continue;
        }
        if (tickets[0].status === 'ok') sent++;
        try {
          await this.handleTicketErrors(tickets, [{ userId: row.userId, token }]);
        } catch (err) {
          this.logger.warn(`handleTicketErrors failed for held push ${row.id}: ${(err as Error).message}`);
        }
      } catch (err) {
        this.logger.warn(`Could not release held push ${row.id}: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  private async sendPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    try {
      const response = await fetch(this.EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Expo Push API error (${response.status}): ${text}`);
        return [];
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      this.logger.error(`Failed to send push notifications: ${error}`);
      return [];
    }
  }

  private async handleTicketErrors(
    tickets: ExpoPushTicket[],
    tokenMap: Array<{ userId: string; token: string }>,
  ): Promise<void> {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === 'error') {
        const errorType = ticket.details?.error;
        this.logger.warn(`Push ticket error: ${errorType} - ${ticket.message}`);

        if (errorType === 'DeviceNotRegistered' || errorType === 'InvalidCredentials') {
          await this.clearPushToken(tokenMap[i].userId);
        }
      }
    }
  }

  private isValidExpoPushToken(token: string): boolean {
    return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
  }

  private async clearPushToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: null },
    });
    this.logger.log(`Cleared push token for user ${userId}`);
  }
}
