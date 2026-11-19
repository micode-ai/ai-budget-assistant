import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { applyPetCategoryRules } from './pet-cost-rules.util';

/**
 * Daily catch-up for pets' category rules (ABA-833): bank imports and the
 * recurring/subscription crons write expenses outside the paths that apply the
 * rules. Only accounts with a pet rule are visited.
 */
@Injectable()
export class PetCostRulesCron {
  private readonly logger = new Logger(PetCostRulesCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('45 4 * * *')
  async run(): Promise<void> {
    const rows = await this.prisma.pet.findMany({
      where: { isDeleted: false, NOT: { categoryRules: { equals: [] } } },
      select: { accountId: true },
      distinct: ['accountId'],
    });
    let attributed = 0;
    for (const { accountId } of rows) {
      try {
        attributed += (await applyPetCategoryRules(this.prisma, accountId)).attributed;
      } catch (e) {
        this.logger.warn(`pet category rules failed for an account: ${(e as Error).message}`);
      }
    }
    this.logger.log(`pet category rules: ${rows.length} accounts, ${attributed} expenses attributed`);
  }
}
