import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import {
  BAD_RCPT_MAX,
  BAD_RCPT_WINDOW_MS,
  INBOUND_TOKEN_PATTERN,
  PENALTY_WINDOW_MS,
  TOKEN_DAILY_MAX,
  TOKEN_HOURLY_MAX,
  VERIFICATION_RETENTION_MS,
  getInboundMailDomain,
  isInboundMailEnabled,
} from './inbound-mail.config';
import { generateInboundToken, tokenLogId } from './inbound-mail.util';
import type { InboundMailAddressResponse, InboundRcptResult } from '@budget/shared-types';

interface ActiveAddress {
  id: string;
  userId: string;
  token: string;
  targetAccountId: string;
  accountTier: number;
}

const E2EE_UNSUPPORTED = {
  statusCode: 400,
  error: 'Bad Request',
  message: 'E-mail receipts are not available for end-to-end encrypted (tier 2) accounts',
  code: 'E2EE_UNSUPPORTED',
};

export const tokenCapKeys = (token: string) => ({
  hourly: `inmail:tok:${token}:h`,
  daily: `inmail:tok:${token}:d`,
});

@Injectable()
export class InboundMailAddressService {
  private readonly logger = new Logger(InboundMailAddressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  // ----- user-facing ---------------------------------------------------------

  async get(userId: string): Promise<InboundMailAddressResponse | null> {
    const row = await this.prisma.inboundMailAddress.findUnique({ where: { userId } });
    if (!row || row.disabledAt) return null;
    return this.toResponse(row, userId);
  }

  /** Idempotent: returns the user's active address; (re)creates it when absent or disabled. */
  async create(accountId: string, userId: string): Promise<InboundMailAddressResponse> {
    await this.assertTargetAllowed(accountId, userId);

    const existing = await this.prisma.inboundMailAddress.findUnique({ where: { userId } });
    if (existing && !existing.disabledAt) return this.toResponse(existing, userId);

    const row = existing
      ? await this.prisma.inboundMailAddress.update({
          where: { userId },
          data: { token: await this.freshToken(), targetAccountId: accountId, disabledAt: null, rotatedAt: new Date() },
        })
      : await this.createWithFreshToken(userId, accountId);
    return this.toResponse(row, userId);
  }

  async setTarget(userId: string, targetAccountId: string): Promise<InboundMailAddressResponse> {
    const existing = await this.requireActive(userId);
    await this.assertTargetAllowed(targetAccountId, userId);
    const row = await this.prisma.inboundMailAddress.update({
      where: { userId: existing.userId },
      data: { targetAccountId },
    });
    return this.toResponse(row, userId);
  }

  /** The new token is live at once; the old one stops resolving in the same write (no grace period). */
  async rotate(userId: string): Promise<InboundMailAddressResponse> {
    await this.requireActive(userId);
    const row = await this.prisma.inboundMailAddress.update({
      where: { userId },
      data: { token: await this.freshToken(), rotatedAt: new Date() },
    });
    return this.toResponse(row, userId);
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.inboundMailAddress.updateMany({
      where: { userId, disabledAt: null },
      data: { disabledAt: new Date() },
    });
  }

  // ----- SMTP container (RCPT TO) --------------------------------------------

  /**
   * Decides one RCPT. Every Redis call here fails CLOSED: an outage becomes a
   * 503 (the container answers 451 and the sender retries), never an accept.
   */
  async checkRcpt(token: string, remoteIp: string): Promise<InboundRcptResult> {
    if (!isInboundMailEnabled(this.config)) return 'unknown';

    try {
      const penalty = await this.cache.peekWindow(`inmail:penalty:${remoteIp}`);
      if (penalty > 0) return 'unknown';

      const active = INBOUND_TOKEN_PATTERN.test(token) ? await this.resolveActive(token) : null;
      if (!active) {
        await this.recordBadRcpt(remoteIp);
        return 'unknown';
      }

      const keys = tokenCapKeys(active.token);
      const [hourly, daily] = await Promise.all([this.cache.peekWindow(keys.hourly), this.cache.peekWindow(keys.daily)]);
      if (hourly >= TOKEN_HOURLY_MAX || daily >= TOKEN_DAILY_MAX) return 'limited';
      return 'accept';
    } catch (err) {
      this.logger.error(`rcpt check failed (token ${tokenLogId(token)}): ${(err as Error).message}`);
      throw new ServiceUnavailableException();
    }
  }

  /** Resolves a token to an address that may receive mail right now, or null. Throws on DB errors. */
  async resolveActive(token: string): Promise<ActiveAddress | null> {
    const row = await this.prisma.inboundMailAddress.findUnique({
      where: { token },
      include: { targetAccount: { select: { encryptionTier: true } } },
    });
    if (!row || row.disabledAt) return null;
    const tier = row.targetAccount?.encryptionTier ?? 0;
    if (tier >= 2) return null;

    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: row.targetAccountId, userId: row.userId } },
      select: { role: true },
    });
    if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) return null;

    return { id: row.id, userId: row.userId, token: row.token, targetAccountId: row.targetAccountId, accountTier: tier };
  }

  /** Bad-RCPT penalty box: 10 per 10 min, then every token from that IP reads "unknown" for 1 h. */
  private async recordBadRcpt(remoteIp: string): Promise<void> {
    const hits = await this.cache.incrementWindow(`inmail:badrcpt:${remoteIp}`, BAD_RCPT_WINDOW_MS);
    if (hits > BAD_RCPT_MAX) {
      await this.cache.incrementWindow(`inmail:penalty:${remoteIp}`, PENALTY_WINDOW_MS);
    }
  }

  // ----- helpers -------------------------------------------------------------

  private async requireActive(userId: string) {
    const row = await this.prisma.inboundMailAddress.findUnique({ where: { userId } });
    if (!row || row.disabledAt) throw new NotFoundException('No e-mail receipts address');
    return row;
  }

  /** Target must be an account where the user is owner/editor, below encryption tier 2. */
  private async assertTargetAllowed(accountId: string, userId: string): Promise<void> {
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId } },
      select: { role: true, account: { select: { encryptionTier: true } } },
    });
    if (!membership) throw new NotFoundException('Account not found');
    if (membership.role !== 'owner' && membership.role !== 'editor') {
      throw new ForbiddenException('Viewers cannot receive e-mail receipts into this account');
    }
    if ((membership.account?.encryptionTier ?? 0) >= 2) throw new BadRequestException(E2EE_UNSUPPORTED);
  }

  private async freshToken(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const token = generateInboundToken();
      const clash = await this.prisma.inboundMailAddress.findUnique({ where: { token }, select: { id: true } });
      if (!clash) return token;
    }
    throw new ServiceUnavailableException('Could not allocate an address');
  }

  private async createWithFreshToken(userId: string, targetAccountId: string) {
    for (let i = 0; i < 3; i++) {
      try {
        return await this.prisma.inboundMailAddress.create({
          data: { userId, targetAccountId, token: generateInboundToken() },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'P2002') {
          // Either the (astronomically unlikely) token clash, or a concurrent create for this user.
          const raced = await this.prisma.inboundMailAddress.findUnique({ where: { userId } });
          if (raced) return raced;
          continue;
        }
        throw err;
      }
    }
    throw new ServiceUnavailableException('Could not allocate an address');
  }

  private async toResponse(
    row: { token: string; targetAccountId: string },
    userId: string,
  ): Promise<InboundMailAddressResponse> {
    const verification = await this.prisma.inboundReceipt.findFirst({
      where: {
        userId,
        kind: 'forwarding_verification',
        verificationCode: { not: null },
        createdAt: { gt: new Date(Date.now() - VERIFICATION_RETENTION_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { verificationCode: true, createdAt: true },
    });
    const response: InboundMailAddressResponse = {
      address: `${row.token}@${getInboundMailDomain(this.config)}`,
      targetAccountId: row.targetAccountId,
      enabled: true,
    };
    if (verification?.verificationCode) {
      response.pendingVerification = {
        code: verification.verificationCode,
        receivedAt: verification.createdAt.toISOString(),
      };
    }
    return response;
  }
}
