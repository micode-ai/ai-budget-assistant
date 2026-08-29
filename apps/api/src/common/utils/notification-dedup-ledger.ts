import { Prisma } from '@prisma/client';

const DAY_MS = 86_400_000;

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** The subset of a Prisma "notification log" model delegate this ledger needs. */
export interface NotificationLogDelegate {
  create(args: { data: { accountId: string; type: string; dedupKey: string } }): Promise<unknown>;
  findFirst(args: {
    where: { accountId: string; type: string };
    orderBy: { sentAt: 'desc' };
    select: { sentAt: true };
  }): Promise<{ sentAt: Date } | null>;
  deleteMany(args: { where: { sentAt: { lt: Date } } }): Promise<{ count: number }>;
}

/**
 * Generic per-account/per-type/per-dedupKey send-once dedup ledger over a Prisma
 * "notification log" model, so a daily cron doesn't re-send the same push every
 * day. Insert + catch P2002 = "already sent" → skip (no `$transaction`) — the
 * anomaly-alerts dedup convention.
 *
 * `ShoppingNotificationLedger` and `InsightNotificationLedger` are thin
 * subclasses of this over their own Prisma delegate (`shoppingNotificationLog`
 * / `insightNotificationLog` — two structurally-identical but separate tables).
 * A future notification type needing the same per-account/per-type throttling
 * should add its own table + a one-constructor-line subclass here, not a third
 * copy of this logic.
 */
export class NotificationDedupLedger {
  constructor(private readonly delegate: NotificationLogDelegate) {}

  /** @returns true if newly inserted (send allowed); false if already recorded (P2002). */
  async tryRecord(accountId: string, type: string, dedupKey: string): Promise<boolean> {
    try {
      await this.delegate.create({ data: { accountId, type, dedupKey } });
      return true;
    } catch (e) {
      if (isP2002(e)) return false;
      throw e;
    }
  }

  /** @returns true if a push of `type` was sent within `minGapDays` (caller should skip). */
  async withinFloor(accountId: string, type: string, minGapDays: number, now: Date = new Date()): Promise<boolean> {
    if (minGapDays <= 0) return false;
    const last = await this.delegate.findFirst({
      where: { accountId, type },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    if (!last) return false;
    return now.getTime() - last.sentAt.getTime() < minGapDays * DAY_MS;
  }

  /** Deletes log rows older than `days`; returns the number deleted. */
  async deleteOlderThan(days: number, now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const { count } = await this.delegate.deleteMany({ where: { sentAt: { lt: cutoff } } });
    return count;
  }
}
