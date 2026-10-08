import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * ThrottlerGuard keyed on the signed-in user (ABA-642 D9: "60 req/min per user")
 * instead of the IP — behind the shared nginx every client can share an address,
 * and a scraper with several IPs must not get several budgets. Must run AFTER
 * JwtAuthGuard (class-level guards run first), which sets `req.user`. Falls back
 * to the IP when there is no user, so it never throws.
 */
@Injectable()
export class CommunityPriceThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ? `cp-read:${req.user.id}` : (req.ip ?? 'unknown');
  }

  /**
   * ONE bucket across every community read route. The default key includes the
   * controller and handler name, which gave each of the three routes its own 60/min
   * budget (180/min per user in total). Dropping them makes the budget shared.
   */
  protected generateKey(_context: ExecutionContext, suffix: string, name: string): string {
    return createHash('md5').update(`community-read-${name}-${suffix}`).digest('hex');
  }
}
