import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { paginateById } from '../../common/utils/paginate';
import { GroupBudgetMirrorService } from './group-budget-mirror.service';

const BATCH_SIZE = 500;

export interface MirrorSweepResult {
  scanned: number;
  active: number;
  paused: number;
  failed: number;
}

/**
 * The budget mirror's daily safety net (ABA-660). Every post-commit reconcile is fire-and-forget, so a
 * crash, a deploy or a lost promise can leave a share row or a link behind; this pass re-derives every
 * mirroring member from the ledger. `reconcileMember` is idempotent, so a re-run (or a second instance)
 * changes nothing. Streams the member rows with `paginateById`; one member failing never stops the run.
 * 03:30 UTC, away from the 17:00 reminder cron and the 02:00 backup.
 */
@Injectable()
export class GroupBudgetMirrorCron {
  private readonly logger = new Logger(GroupBudgetMirrorCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: GroupBudgetMirrorService,
  ) {}

  /** No parameters: the cron library passes its own argument to the tick. */
  @Cron('30 3 * * *')
  async handleSweep(): Promise<MirrorSweepResult> {
    return this.run();
  }

  async run(): Promise<MirrorSweepResult> {
    const result: MirrorSweepResult = { scanned: 0, active: 0, paused: 0, failed: 0 };
    const pages = paginateById(
      (cursor) =>
        this.prisma.expenseGroupMember.findMany({
          where: { budgetMirrorFrom: { not: null }, removedAt: null, userId: { not: null } },
          select: { id: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );
    for await (const members of pages) {
      for (const m of members) {
        result.scanned++;
        try {
          const status = await this.mirror.reconcileMember(m.id);
          if (status === 'active') result.active++;
          else if (status === 'paused') result.paused++;
        } catch (e) {
          result.failed++;
          this.logger.warn(`budget mirror sweep failed for member ${m.id}`, e as Error);
        }
      }
    }
    this.logger.log(
      `budget mirror sweep: ${result.scanned} members, ${result.active} active, ${result.paused} paused, ${result.failed} failed`,
    );
    return result;
  }
}
