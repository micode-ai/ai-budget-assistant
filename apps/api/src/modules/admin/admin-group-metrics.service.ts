import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AdminGroupMetricsResponse } from '@budget/shared-types';

const DAY_MS = 86_400_000;

/**
 * Shared expense groups (ABA-640) as an acquisition surface: how many groups exist, how many
 * non-users they put in front of the product, and how many of those became accounts.
 *
 * Aggregates only. No group name, member name, token or user id leaves this service.
 *
 * Provenance comes from `ExpenseGroupMember.joinedVia` / `linkedAt`, which were added later and are
 * NULL on older rows (no backfill) - those rows still count in `membersTotal` but in no provenance
 * figure. Totals other than `activeGroups` are all-time; the daily series covers the window.
 */
@Injectable()
export class AdminGroupMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGroupMetrics(days: number): Promise<AdminGroupMetricsResponse> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const since = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    const guestVia = { in: ['guest', 'guest_linked'] as ('guest' | 'guest_linked')[] };

    const [
      groupsCreated,
      activeGroups,
      archivedGroups,
      membersTotal,
      guestMembers,
      guestsLinked,
      appUsersJoinedViaLink,
      createdRows,
      guestRows,
      linkedRows,
    ] = await Promise.all([
      this.prisma.expenseGroup.count(),
      this.prisma.expenseGroup.count({
        where: {
          status: 'active',
          OR: [{ expenses: { some: { createdAt: { gte: since } } } }, { settlements: { some: { createdAt: { gte: since } } } }],
        },
      }),
      this.prisma.expenseGroup.count({ where: { status: 'archived' } }),
      this.prisma.expenseGroupMember.count({ where: { removedAt: null } }),
      this.prisma.expenseGroupMember.count({ where: { joinedVia: guestVia } }),
      this.prisma.expenseGroupMember.count({ where: { linkedAt: { not: null } } }),
      this.prisma.expenseGroupMember.count({ where: { joinedVia: 'app_link' } }),
      this.prisma.expenseGroup.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      this.prisma.expenseGroupMember.findMany({
        where: { joinedVia: guestVia, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.expenseGroupMember.findMany({ where: { linkedAt: { gte: since } }, select: { linkedAt: true } }),
    ]);

    const bucket = (dates: Array<Date | null | undefined>) => {
      const m = new Map<string, number>();
      for (const d of dates) {
        if (!d) continue;
        const k = d.toISOString().slice(0, 10);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    };
    const created = bucket(createdRows.map((r: any) => r.createdAt));
    const joined = bucket(guestRows.map((r: any) => r.createdAt));
    const linked = bucket(linkedRows.map((r: any) => r.linkedAt));

    const daily: AdminGroupMetricsResponse['daily'] = [];
    for (let t = since.getTime(); t <= todayStart.getTime(); t += DAY_MS) {
      const date = new Date(t).toISOString().slice(0, 10);
      daily.push({
        date,
        groupsCreated: created.get(date) ?? 0,
        guestsJoined: joined.get(date) ?? 0,
        guestsLinked: linked.get(date) ?? 0,
      });
    }

    return {
      windowDays: days,
      totals: { groupsCreated, activeGroups, archivedGroups, membersTotal, guestMembers, guestsLinked, appUsersJoinedViaLink },
      daily,
    };
  }
}
