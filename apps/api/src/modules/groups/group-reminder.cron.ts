import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { paginateById } from '../../common/utils/paginate';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { GroupsService } from './groups.service';
import {
  nextReminderState,
  pickPerUser,
  reminderStateChanged,
  sameUtcDay,
  type ReminderCandidate,
  type ReminderState,
} from './group-reminder';

const BATCH_SIZE = 500;

/**
 * Weekly reminders about an open group balance (ABA-653). Runs daily; each app-user member's episode
 * state lives on its member row (`nextReminderState`, `group-reminder.ts`), so the cadence is weekly,
 * at most 4 per episode, and a closed balance resets the count.
 *
 * Debtors get "you owe", creditors "you are owed" (most debtors are guests with no push, so the app
 * user who is owed is the one who chases them). Guests (no `userId`) are never reminded. At most ONE
 * reminder per user per day: the group with the largest |balance|; the others stay due and go out on
 * a later day. Idempotent per day: a user any of whose rows was reminded today is skipped, and the
 * send is claimed by a compare-and-swap on the member row's reminder columns, so a re-run or a second
 * instance never sends twice. The opt-out is `User.notifyGroupReminders`, filtered here and enforced
 * again in `NotificationsService` for the `group_reminder` type.
 */
@Injectable()
export class GroupReminderCron {
  private readonly logger = new Logger(GroupReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** 17:00 UTC daily. No parameters: the cron library passes its own argument to the tick. */
  @Cron('0 17 * * *')
  async handleGroupReminders(): Promise<number> {
    return this.run(new Date());
  }

  async run(now: Date): Promise<number> {
    const best = new Map<string, ReminderCandidate>();
    const remindedToday = new Set<string>();

    const pages = paginateById(
      (cursor) =>
        this.prisma.expenseGroup.findMany({
          where: {
            status: 'active',
            members: { some: { userId: { not: null }, removedAt: null } },
          },
          select: { id: true, name: true, currencyCode: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    for await (const groups of pages) {
      for (const g of groups) {
        try {
          await this.scanGroup(g, now, best, remindedToday);
        } catch (e) {
          this.logger.warn(`group reminder scan failed for group ${g.id}`, e as Error);
        }
      }
    }

    for (const userId of remindedToday) best.delete(userId);
    const sent = await this.sendReminders([...best.values()], now);
    this.logger.log(`group reminders: ${sent} pushes queued`);
    return sent;
  }

  private async scanGroup(
    g: { id: string; name: string; currencyCode: string },
    now: Date,
    best: Map<string, ReminderCandidate>,
    remindedToday: Set<string>,
  ): Promise<void> {
    const { members, ledger } = await this.groups.loadState(g.id);
    const net = new Map(ledger.balances.map((b) => [b.memberId, b.netAmount]));

    for (const m of members as any[]) {
      if (!m.userId) continue; // guests have no push; never remind them
      const prev: ReminderState = {
        balanceOpenSince: m.balanceOpenSince ?? null,
        balanceOpenSign: m.balanceOpenSign ?? null,
        lastReminderAt: m.lastReminderAt ?? null,
        reminderCount: m.reminderCount ?? 0,
      };
      if (sameUtcDay(prev.lastReminderAt, now)) remindedToday.add(m.userId);

      const balance = net.get(m.id) ?? 0;
      const { next, due } = nextReminderState(prev, balance, now);
      if (reminderStateChanged(prev, next)) {
        await this.prisma.expenseGroupMember.updateMany({ where: { id: m.id, groupId: g.id }, data: next });
      }
      if (!due) continue;

      const pair =
        balance < 0
          ? ledger.suggestedTransfers
              .filter((t) => t.fromMemberId === m.id)
              .sort((a, b) => b.amount - a.amount)[0]
          : undefined;
      pickPerUser(best, {
        userId: m.userId,
        memberId: m.id,
        groupId: g.id,
        groupName: g.name,
        currencyCode: g.currencyCode,
        net: balance,
        prev: next,
        ...(pair ? { fromMemberId: pair.fromMemberId, toMemberId: pair.toMemberId } : {}),
      });
    }
  }

  private async sendReminders(candidates: ReminderCandidate[], now: Date): Promise<number> {
    let sent = 0;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const chunk = candidates.slice(i, i + BATCH_SIZE);
      const eligible = await this.prisma.user.findMany({
        where: {
          id: { in: chunk.map((c) => c.userId) },
          isActive: true,
          notifyGroupReminders: true,
          pushToken: { not: null },
        },
        select: { id: true },
      });
      const ok = new Set(eligible.map((u: { id: string }) => u.id));

      for (const c of chunk) {
        if (!ok.has(c.userId)) continue;
        // The claim: a CAS on the columns this run read, so a concurrent run sends nothing.
        const claimed = await this.prisma.expenseGroupMember.updateMany({
          where: {
            id: c.memberId,
            groupId: c.groupId,
            removedAt: null,
            reminderCount: c.prev.reminderCount,
            lastReminderAt: c.prev.lastReminderAt,
            balanceOpenSign: c.prev.balanceOpenSign,
          },
          data: { lastReminderAt: now, reminderCount: { increment: 1 } },
        });
        if (claimed.count !== 1) continue;

        const direction = c.net < 0 ? 'owe' : 'owed';
        const params = {
          groupName: c.groupName,
          amount: Math.abs(c.net).toFixed(2),
          currencyCode: c.currencyCode,
          direction,
        } as const;
        this.notificationsService
          .sendToUser(
            c.userId,
            (lang) => ni18n.groupReminderTitle(lang, params),
            (lang) => ni18n.groupReminderBody(lang, params),
            {
              groupId: c.groupId,
              reminder: direction,
              ...(c.fromMemberId && c.toMemberId ? { fromMemberId: c.fromMemberId, toMemberId: c.toMemberId } : {}),
            },
            'group_reminder',
          )
          .catch(logFireAndForget(this.logger, 'GroupReminderCron.sendToUser'));
        sent++;
      }
    }
    return sent;
  }
}
