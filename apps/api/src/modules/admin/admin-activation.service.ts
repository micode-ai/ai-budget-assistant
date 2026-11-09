import { Injectable } from '@nestjs/common';
import type { AdminActivationReportResponse } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { parseAdminEmails } from './admin-emails.util';
import { computeActivationReport, inReportWindow, type FirstTransaction } from './admin-activation.util';

/**
 * Activation & retention report (ABA-731): how many signups ever log a transaction,
 * how fast, by which input channel, and how many are still logging weeks later.
 * Counts every platform — it reads transactions, not client telemetry.
 */
@Injectable()
export class AdminActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getReport(params: { weeks: number; includeInternal: boolean }): Promise<AdminActivationReportResponse> {
    const key = `admin:activation:${params.weeks}:${params.includeInternal ? 1 : 0}`;
    const cached = await this.cache.get<AdminActivationReportResponse>(key);
    if (cached) return cached;

    const now = new Date();
    const internalEmails = params.includeInternal ? [] : parseAdminEmails();

    const [users, dayRows, firstRows] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, email: true, createdAt: true, lastSyncAt: true } }),
      // One row per user per UTC day with a transaction — bounded by users × days,
      // not by transaction volume. `created_at` is a UTC timestamp, so date() is the UTC day.
      this.prisma.$queryRaw<Array<{ user_id: string; day: string }>>`
        SELECT user_id, to_char(date(created_at), 'YYYY-MM-DD') AS day FROM expenses WHERE is_deleted = false
        UNION
        SELECT user_id, to_char(date(created_at), 'YYYY-MM-DD') AS day FROM incomes WHERE is_deleted = false`,
      this.prisma.$queryRaw<Array<{ user_id: string; created_at: Date; source: string | null }>>`
        SELECT DISTINCT ON (user_id) user_id, created_at, source FROM (
          SELECT user_id, created_at, source FROM expenses WHERE is_deleted = false
          UNION ALL
          SELECT user_id, created_at, source FROM incomes WHERE is_deleted = false
        ) t
        ORDER BY user_id, created_at ASC`,
    ]);

    // Internal = ADMIN_EMAILS, the same definition the telemetry funnel uses. An unset
    // list excludes nobody.
    const internal = new Set(internalEmails);
    let excludedAccounts = 0;
    const signups = [];
    for (const u of users) {
      if (internal.size > 0 && internal.has(u.email.toLowerCase())) {
        excludedAccounts++;
        continue;
      }
      if (!inReportWindow(u.createdAt, params.weeks, now)) continue;
      signups.push({ userId: u.id, createdAt: u.createdAt, lastSyncAt: u.lastSyncAt });
    }

    const activeDays = new Map<string, Set<string>>();
    for (const r of dayRows) {
      let set = activeDays.get(r.user_id);
      if (!set) activeDays.set(r.user_id, (set = new Set()));
      set.add(r.day);
    }
    const firstTx = new Map<string, FirstTransaction>(
      firstRows.map((r) => [r.user_id, { at: new Date(r.created_at), source: r.source || 'manual' }]),
    );

    const report = computeActivationReport(signups, activeDays, firstTx, now);
    const response: AdminActivationReportResponse = {
      generatedAt: now.toISOString(),
      weeks: params.weeks,
      internalExcluded: !params.includeInternal,
      excludedAccounts,
      ...report,
    };

    await this.cache.set(key, response, 600);
    return response;
  }
}
