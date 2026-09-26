import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { CoicopDivision } from '@budget/shared-types';
import { PrismaService } from '../../../database/prisma.service';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import { EurostatClient } from './eurostat.client';
import { isDivision } from './coicop';

/**
 * The only writer of official_inflation_rates. User requests read it and never
 * call Eurostat, so an outage there only means the data is a month older — the
 * response carries `dataMonth` to make that visible.
 */
@Injectable()
export class OfficialInflationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OfficialInflationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eurostat: EurostatClient,
  ) {}

  /** A fresh deploy must not wait up to two weeks for the first cron run. */
  onApplicationBootstrap(): void {
    void this.prisma.officialInflationRate
      .count()
      .then((n) => (n === 0 ? this.refresh() : 0))
      .catch(logFireAndForget(this.logger, 'OfficialInflationService.bootstrapFill'));
  }

  /** Eurostat publishes mid-month; the 1st and 15th catch every release within ~2 weeks. */
  @Cron('0 6 1,15 * *')
  async scheduledRefresh(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<number> {
    let rows;
    try {
      rows = await this.eurostat.fetchLatest();
    } catch (e) {
      this.logger.warn(`Eurostat refresh failed, keeping stored data: ${String(e)}`);
      return 0;
    }
    if (rows.length === 0) {
      this.logger.warn('Eurostat refresh returned no rows, keeping stored data');
      return 0;
    }
    const now = new Date();
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.officialInflationRate.upsert({
          where: { country_division_month: { country: r.country, division: r.division, month: r.month } },
          create: { country: r.country, division: r.division, month: r.month, annualRatePct: r.annualRatePct },
          update: { annualRatePct: r.annualRatePct, fetchedAt: now },
        }),
      ),
    );
    this.logger.log(`Eurostat refresh stored ${rows.length} rows`);
    return rows.length;
  }

  async latestFor(country: string): Promise<{ month: string; rates: Partial<Record<CoicopDivision, number>> } | null> {
    const latest = await this.prisma.officialInflationRate.findFirst({
      where: { country },
      orderBy: { month: 'desc' },
      select: { month: true },
    });
    if (!latest) return null;
    const rows = await this.prisma.officialInflationRate.findMany({
      where: { country, month: latest.month },
      select: { division: true, annualRatePct: true },
    });
    const rates: Partial<Record<CoicopDivision, number>> = {};
    for (const r of rows) if (isDivision(r.division)) rates[r.division] = Number(r.annualRatePct);
    return { month: latest.month, rates };
  }
}
