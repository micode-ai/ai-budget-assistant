import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

/**
 * Makes sure every currency an account actually holds money in has a
 * `wallet_balances` row, so the wallet can show a card for it (ABA-431).
 *
 * Prisma-only leaf with its own tiny module, so the write paths that introduce
 * a currency can depend on it without dragging `WalletModule` (and a dependency
 * cycle) in — same shape as `InflationShieldTrackingService`.
 *
 * Two rules that are easy to get wrong:
 *
 * 1. The existence lookup does NOT filter `isDeleted`. A soft-deleted row is
 *    the user having hidden that currency from their wallet, and hiding has to
 *    survive the next transaction in it — so a hidden currency is left alone
 *    rather than recreated or revived.
 * 2. Call this OUTSIDE any `$transaction`. Postgres aborts the whole
 *    transaction on the first constraint violation, so a write that races
 *    another one would poison its caller's transaction (ABA-313, ABA-401).
 *    `createMany({ skipDuplicates: true })` handles the race on its own here.
 */
@Injectable()
export class WalletCurrencyService {
  private readonly logger = new Logger(WalletCurrencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never throws — every caller is fire-and-forget and must not fail over this.
   *
   * `userId` may be undefined: the wallet read path heals missing rows but does
   * not always know who is asking (`SafeToSpendService` calls `getSummary`
   * without a user), and `wallet_balances.user_id` is NOT NULL — so the account
   * owner stands in, the same way the subscription auto-charge cron attributes
   * its expenses.
   */
  async ensureCurrencies(
    accountId: string,
    userId: string | undefined,
    codes: string[],
  ): Promise<void> {
    const wanted = [...new Set(codes.filter((c) => c && c.trim()))];
    if (wanted.length === 0) return;

    try {
      const existing = await this.prisma.walletBalance.findMany({
        where: { accountId, currencyCode: { in: wanted } },
        select: { currencyCode: true },
      });
      const known = new Set(existing.map((e: { currencyCode: string }) => e.currencyCode));
      const missing = wanted.filter((c) => !known.has(c));
      if (missing.length === 0) return;

      const attributedTo = userId ?? (await this.resolveOwnerId(accountId));
      if (!attributedTo) return;

      await this.prisma.walletBalance.createMany({
        data: missing.map((currencyCode) => ({
          accountId,
          userId: attributedTo,
          clientId: randomUUID(),
          currencyCode,
          initialAmount: 0,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to ensure wallet currencies for account ${accountId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Owner first, then any member — a row has to belong to somebody.
   * Filtered on the role, never sorted by it: alphabetically 'editor' sorts
   * ahead of 'owner', so an `orderBy` would pick the wrong member.
   */
  private async resolveOwnerId(accountId: string): Promise<string | null> {
    const owner = await this.prisma.accountMember.findFirst({
      where: { accountId, role: 'owner' },
      select: { userId: true },
    });
    if (owner) return owner.userId;

    const anyMember = await this.prisma.accountMember.findFirst({
      where: { accountId },
      select: { userId: true },
    });
    return anyMember?.userId ?? null;
  }
}
