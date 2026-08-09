import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';

/** Canonical Redis key for the per-user "already stamped recently" throttle. */
export const lastActiveKey = (userId: string) => `lastactive:${userId}`;

/** Stamp at most once per user per this window. */
export const LAST_ACTIVE_THROTTLE_SEC = 900; // 15 min

/**
 * Keeps `User.lastSyncAt` — the column the admin panel shows as "Last Active",
 * `AdminAnalyticsService` counts DAU/WAU from, and `ReferralsService` uses to
 * qualify a referral — in step with real usage.
 *
 * Before this existed, `lastSyncAt` was only written by `POST /auth/login`,
 * `POST /auth/google`, `POST /auth/refresh` and `GET /users/me`, so a user who
 * registered (register/verify-email return tokens directly, never touching
 * `/auth/login`) and kept using the same session showed as "Never" forever: the
 * 7-day access token means no refresh, and the mobile cold-start restore reads
 * the profile from local storage instead of calling `GET /users/me`. Stamping
 * from `JwtStrategy` instead means ANY authenticated request counts.
 *
 * That runs on every request, so the write is throttled through Redis and
 * fire-and-forget — it must never add a DB write per request, never add latency,
 * and never fail a request.
 */
@Injectable()
export class LastActiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async touch(userId: string): Promise<void> {
    const isFirstInWindow = await this.cache.setIfAbsent(
      lastActiveKey(userId),
      LAST_ACTIVE_THROTTLE_SEC,
    );
    if (!isFirstInWindow) return;

    await this.prisma.user
      .update({ where: { id: userId }, data: { lastSyncAt: new Date() } })
      .catch(() => null);
  }
}
