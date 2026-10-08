import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { paginateById } from '../../common/utils/paginate';
import { InboundReceiptProcessorService } from './inbound-receipt-processor.service';
import { STUCK_AFTER_MS, isInboundMailEnabled } from './inbound-mail.config';

export { STUCK_AFTER_MS };
export const MAX_ATTEMPTS = 3;

@Injectable()
export class InboundMailCron {
  private readonly logger = new Logger(InboundMailCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly processor: InboundReceiptProcessorService,
  ) {}

  /** Every 10 min: re-run rows an API restart left in received/processing; give up at 3 attempts. */
  @Cron('*/10 * * * *')
  async requeueStuck(): Promise<void> {
    if (!isInboundMailEnabled(this.config)) return;
    const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

    await this.prisma.inboundReceipt.updateMany({
      where: { status: { in: ['received', 'processing'] }, updatedAt: { lt: cutoff }, attempts: { gte: MAX_ATTEMPTS } },
      data: { status: 'failed', errorCode: 'MAX_ATTEMPTS' },
    });

    const pages = paginateById((cursor) =>
      this.prisma.inboundReceipt.findMany({
        where: { status: { in: ['received', 'processing'] }, updatedAt: { lt: cutoff }, attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      }),
      100,
    );
    for await (const page of pages) {
      for (const { id } of page) {
        await this.processor.process(id).catch((err: unknown) =>
          this.logger.warn(`requeue ${id} failed: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    }
  }

  /**
   * Daily 03:30: hard-delete rows past `expiresAt`. Deliberately runs even with
   * the flag off: it only ever removes stored mail, so turning the feature off
   * must not strand documents past their retention.
   */
  @Cron('30 3 * * *')
  async purgeExpired(): Promise<void> {
    const now = new Date();
    const pages = paginateById((cursor) =>
      this.prisma.inboundReceipt.findMany({
        where: { expiresAt: { lt: now } },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      }),
    );
    let deleted = 0;
    for await (const page of pages) {
      const res = await this.prisma.inboundReceipt.deleteMany({ where: { id: { in: page.map((r: { id: string }) => r.id) } } });
      deleted += res.count;
    }
    if (deleted > 0) this.logger.log(`purged ${deleted} expired inbound receipts`);
  }
}
