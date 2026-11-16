import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { applyVehicleCategoryRules } from './vehicle-cost-rules.util';

/**
 * Daily catch-up for vehicles' category rules (ABA-803): bank imports and the
 * recurring/subscription crons write expenses outside the paths that apply the
 * rules. Only accounts with a vehicle rule are visited.
 */
@Injectable()
export class VehicleCostRulesCron {
  private readonly logger = new Logger(VehicleCostRulesCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('40 4 * * *')
  async run(): Promise<void> {
    const rows = await this.prisma.vehicle.findMany({
      where: { isDeleted: false, NOT: { categoryRules: { equals: [] } } },
      select: { accountId: true },
      distinct: ['accountId'],
    });
    let attributed = 0;
    for (const { accountId } of rows) {
      try {
        attributed += (await applyVehicleCategoryRules(this.prisma, accountId)).attributed;
      } catch (e) {
        this.logger.warn(`vehicle category rules failed for an account: ${(e as Error).message}`);
      }
    }
    this.logger.log(`vehicle category rules: ${rows.length} accounts, ${attributed} expenses attributed`);
  }
}
