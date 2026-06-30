import { Injectable, NotFoundException } from '@nestjs/common';
import { FeedEventType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { FeedGroup } from '@budget/shared-types';

type RawFeedEvent = {
  id: string;
  userId: string;
  type: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  user: { name: string };
  reactions: { emoji: string; userId: string }[];
};

@Injectable()
export class FamilyFeedService {
  constructor(private readonly prisma: PrismaService) {}

  // ── pure helper — public for testing ─────────────────────────────────

  groupEvents(
    events: RawFeedEvent[],
    callerUserId: string,
    prStatusMap: Map<string, string> = new Map(),
  ): FeedGroup[] {
    const groups: FeedGroup[] = [];
    const dayKeys = new Map<string, FeedGroup>();
    // events are sorted DESC — first event per PR is the most recent one
    const seenPrIds = new Set<string>();

    for (const event of events) {
      const date = event.createdAt.toISOString().slice(0, 10);
      const { reactions, myReaction } = this.buildReactions(event.reactions, callerUserId);

      if (event.type === 'EXPENSE_ADDED' || event.type === 'INCOME_ADDED') {
        const groupType = event.type === 'EXPENSE_ADDED' ? 'expenses' : 'incomes';
        const key = `${event.userId}:${date}:${groupType}`;

        if (dayKeys.has(key)) {
          const g = dayKeys.get(key)!;
          g.count! += 1;
          g.totalAmount! += (event.metadata.amount as number);
          g.eventIds!.push(event.entityId);
        } else {
          const g: FeedGroup = {
            id: event.id,
            type: groupType,
            userId: event.userId,
            userName: event.user.name,
            date,
            count: 1,
            totalAmount: event.metadata.amount as number,
            currency: event.metadata.currency as string,
            eventIds: [event.entityId],
            reactions,
            myReaction,
          };
          dayKeys.set(key, g);
          groups.push(g);
        }
      } else {
        // PURCHASE_REQUEST_* — one card per PR (most recent event wins, since events are DESC)
        if (seenPrIds.has(event.entityId)) continue;
        seenPrIds.add(event.entityId);

        const meta = event.metadata as { amount: number; currency: string; title?: string };

        // Use live status from DB (covers old events created before rejection/approval events existed)
        const liveStatus = prStatusMap.get(event.entityId);
        const prStatus = liveStatus ?? (
          event.type === 'PURCHASE_REQUEST_APPROVED'
            ? 'APPROVED'
            : event.type === 'PURCHASE_REQUEST_REJECTED'
            ? 'REJECTED'
            : event.type === 'PURCHASE_REQUEST_PURCHASED'
            ? 'PURCHASED'
            : 'PENDING'
        );
        // Derive card type from live status so color/icon always reflects current state
        const prType = (`purchase_request_${prStatus.toLowerCase()}`) as FeedGroup['type'];

        groups.push({
          id: event.id,
          type: prType,
          userId: event.userId,
          userName: event.user.name,
          date,
          purchaseRequest: {
            id: event.entityId,
            title: meta.title ?? '',
            amount: meta.amount,
            currency: meta.currency,
            status: prStatus,
          },
          reactions,
          myReaction,
        });
      }
    }

    return groups;
  }

  // ── DB methods ────────────────────────────────────────────────────────

  async recordEvent(
    accountId: string,
    userId: string,
    type: string,
    entityId: string,
    metadata: { amount: number; currency: string; title?: string },
  ): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { type: true },
    });
    if (!account || account.type === 'personal') return;

    await this.prisma.familyFeedEvent.create({
      data: { accountId, userId, type: type as FeedEventType, entityId, metadata },
    });
  }

  async getFeed(accountId: string, userId: string, limit = 100): Promise<FeedGroup[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(limit)), 100) : 100;
    const events = await this.prisma.familyFeedEvent.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      include: {
        user: { select: { name: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });

    // Fetch live statuses for all PR feed events so old "PENDING" cards
    // correctly reflect approval/rejection that happened after the feed event was created.
    const prEntityIds = [
      ...new Set(
        events
          .filter((e) => e.type.startsWith('PURCHASE_REQUEST'))
          .map((e) => e.entityId),
      ),
    ];
    const prStatusMap = new Map<string, string>();
    if (prEntityIds.length > 0) {
      const prs = await this.prisma.purchaseRequest.findMany({
        where: { id: { in: prEntityIds }, accountId },
        select: { id: true, status: true },
      });
      for (const pr of prs) prStatusMap.set(pr.id, pr.status as string);
    }

    return this.groupEvents(events as RawFeedEvent[], userId, prStatusMap);
  }

  async react(accountId: string, userId: string, eventId: string, emoji: string): Promise<void> {
    const event = await this.prisma.familyFeedEvent.findFirst({
      where: { id: eventId, accountId },
    });
    if (!event) throw new NotFoundException('Feed event not found');

    await this.prisma.feedReaction.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, emoji },
      update: { emoji },
    });
  }

  async removeReaction(accountId: string, userId: string, eventId: string): Promise<void> {
    const event = await this.prisma.familyFeedEvent.findFirst({
      where: { id: eventId, accountId },
    });
    if (!event) throw new NotFoundException('Feed event not found');

    await this.prisma.feedReaction.deleteMany({ where: { eventId, userId } });
  }

  // ── private ──────────────────────────────────────────────────────────

  private buildReactions(
    raw: { emoji: string; userId: string }[],
    callerUserId: string,
  ): { reactions: { emoji: string; count: number; userIds: string[] }[]; myReaction: string | null } {
    const map = new Map<string, string[]>();
    for (const r of raw) {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.userId);
    }
    const reactions = Array.from(map.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userIds,
    }));
    const myReaction = raw.find((r) => r.userId === callerUserId)?.emoji ?? null;
    return { reactions, myReaction };
  }
}
