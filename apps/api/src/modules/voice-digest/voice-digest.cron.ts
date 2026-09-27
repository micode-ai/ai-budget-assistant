import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { DEFAULT_PAGINATE_BATCH_SIZE, paginateById } from '../../common/utils/paginate';
import { isDue, isoWeekKey, RESEND_GUARD_MS } from './digest-schedule.util';
import { VoiceDigestService } from './voice-digest.service';

const LOCK_TTL_SEC = 8 * 24 * 60 * 60; // 8 days — comfortably outlives the weekly cadence

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Hourly sweep over every user with the voice digest enabled: for each one
 * still eligible for a new week (`voiceDigestLastSentAt` null or older than
 * the resend guard), checks `isDue` against their own day/hour/timezone,
 * claims a per-ISO-week Redis lock so two overlapping cron runs (or an
 * unclean restart) can't double-send, then hands off to
 * `VoiceDigestService.runForUser`. One user's failure — a throw that
 * `runForUser`'s own try/catch didn't already turn into 'failed' — never
 * stops the rest of the sweep. Logs carry ids only, never amounts or text.
 */
@Injectable()
export class VoiceDigestCron {
  private readonly logger = new Logger(VoiceDigestCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly service: VoiceDigestService,
  ) {}

  @Cron('5 * * * *')
  async run(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RESEND_GUARD_MS);
    let attempted = 0;

    const pages = paginateById((cursor) =>
      this.prisma.user.findMany({
        where: {
          voiceDigestEnabled: true,
          OR: [{ voiceDigestLastSentAt: null }, { voiceDigestLastSentAt: { lt: cutoff } }],
        },
        select: {
          id: true,
          timezone: true,
          voiceDigestDay: true,
          voiceDigestHour: true,
          voiceDigestLastSentAt: true,
        },
        take: DEFAULT_PAGINATE_BATCH_SIZE,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    );

    for await (const page of pages) {
      for (const user of page) {
        try {
          const due = isDue({
            now,
            timeZone: user.timezone,
            day: user.voiceDigestDay,
            hour: user.voiceDigestHour,
            lastSentAt: user.voiceDigestLastSentAt,
          });
          if (!due) continue;

          const acquired = await this.cache.setIfAbsent(`vd:${user.id}:${isoWeekKey(now, user.timezone)}`, LOCK_TTL_SEC);
          if (!acquired) continue;

          attempted += 1;
          await this.service.runForUser(user.id, { now });
        } catch (err) {
          this.logger.warn(`VoiceDigestCron.run failed for user ${user.id}: ${errorMessage(err)}`);
        }
      }
    }

    return attempted;
  }
}
