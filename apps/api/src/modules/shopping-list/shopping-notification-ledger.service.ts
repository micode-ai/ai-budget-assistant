import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const DAY_MS = 86_400_000;

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Records which shopping pushes were already sent, so the daily cron does not
 * re-send the same restock reminder every day. Mirrors the anomaly-alerts
 * dedup convention: insert + catch P2002 = "already sent" → skip (no $transaction).
 */
@Injectable()
export class ShoppingNotificationLedger {
  constructor(private readonly prisma: PrismaService) {}

  /** @returns true if newly inserted (send allowed); false if already recorded (P2002). */
  async tryRecord(accountId: string, type: string, dedupKey: string): Promise<boolean> {
    try {
      await this.prisma.shoppingNotificationLog.create({ data: { accountId, type, dedupKey } });
      return true;
    } catch (e) {
      if (isP2002(e)) return false;
      throw e;
    }
  }

  /** @returns true if a push of `type` was sent within `minGapDays` (caller should skip). */
  async withinFloor(accountId: string, type: string, minGapDays: number, now: Date = new Date()): Promise<boolean> {
    if (minGapDays <= 0) return false;
    const last = await this.prisma.shoppingNotificationLog.findFirst({
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
    const { count } = await this.prisma.shoppingNotificationLog.deleteMany({ where: { sentAt: { lt: cutoff } } });
    return count;
  }
}
