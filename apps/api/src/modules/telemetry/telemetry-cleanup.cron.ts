import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

/** 90 days is enough for a funnel and short enough that this table cannot
 *  become the largest thing in the database. Mirrors the shopping- and
 *  insight-notification log retention. */
const RETENTION_DAYS = 90;

@Injectable()
export class TelemetryCleanupCron {
  private readonly logger = new Logger(TelemetryCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async handleCron(): Promise<void> {
    const deleted = await this.prune();
    if (deleted > 0) {
      this.logger.log(`Pruned ${deleted} telemetry events older than ${RETENTION_DAYS} days`);
    }
  }

  async prune(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    try {
      const { count } = await this.prisma.telemetryEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return count;
    } catch (error) {
      this.logger.warn(`Telemetry prune failed: ${error}`);
      return 0;
    }
  }
}
