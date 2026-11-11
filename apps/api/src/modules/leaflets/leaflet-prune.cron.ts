import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

/**
 * Personal leaflet results are short-lived facts: deleted the day after the leaflet's
 * validity ends (or 7 days after creation when no date was readable). Items cascade.
 * Admin (community) leaflets are not touched here. Community promo observations are deleted the
 * day after their `validTo` — an ended promo is never shown or pushed.
 */
@Injectable()
export class LeafletPruneCron {
  private readonly logger = new Logger(LeafletPruneCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 3 * * *')
  async prune(): Promise<void> {
    const { count } = await this.prisma.leaflet.deleteMany({
      where: { kind: 'personal', expiresAt: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`Pruned ${count} expired personal leaflet(s)`);
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const promos = await this.prisma.communityPromoObservation.deleteMany({ where: { validTo: { lt: today } } });
    if (promos.count > 0) this.logger.log(`Pruned ${promos.count} ended community promo observation(s)`);
  }
}
