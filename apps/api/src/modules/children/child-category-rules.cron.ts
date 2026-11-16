import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { applyChildCategoryRules } from './child-category-rules.util';

/**
 * Daily catch-up for children's category rules (ABA-802). The expense write
 * paths apply the rule as they go; bank imports, recurring and subscription
 * crons write expenses without passing through them, so this picks those up.
 * Only accounts that have a rule are visited.
 */
@Injectable()
export class ChildCategoryRulesCron {
  private readonly logger = new Logger(ChildCategoryRulesCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 4 * * *')
  async run(): Promise<void> {
    const rows = await this.prisma.child.findMany({
      where: { isDeleted: false, archivedAt: null, NOT: { categoryIds: { isEmpty: true } } },
      select: { accountId: true },
      distinct: ['accountId'],
    });
    let attributed = 0;
    for (const { accountId } of rows) {
      try {
        attributed += (await applyChildCategoryRules(this.prisma, accountId)).attributed;
      } catch (e) {
        this.logger.warn(`child category rules failed for an account: ${(e as Error).message}`);
      }
    }
    this.logger.log(`child category rules: ${rows.length} accounts, ${attributed} expenses attributed`);
  }
}
