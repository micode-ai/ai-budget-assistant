import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

import { CacheService } from '../../common/cache/cache.service';
import {
  generateLinkCode,
  normalizeLinkCode,
  linkAttemptAllowed,
  LINK_INVALID_CODE,
  LINK_TOO_MANY_ATTEMPTS,
} from '../../common/utils/bot-link-code';

@Injectable()
export class SlackLinkService {
  private readonly logger = new Logger(SlackLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async generateCode(userId: string, accountId: string): Promise<{ code: string; expiresAt: Date }> {
    // Invalidate any existing unused codes for this user
    await this.prisma.slackLinkCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.slackLinkCode.create({ data: { userId, accountId, code, expiresAt } });

    return { code, expiresAt };
  }

  async redeemCode(
    code: string,
    slackUserId: string,
    slackTeamId: string,
    profileName?: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Codes are matched across every user, so each attempt is counted before the lookup (ABA-808).
    if (!(await linkAttemptAllowed(this.cache, 'slack', slackUserId))) {
      return { success: false, error: LINK_TOO_MANY_ATTEMPTS };
    }
    const linkCode = await this.prisma.slackLinkCode.findFirst({
      where: {
        code: normalizeLinkCode(code),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!linkCode) {
      return { success: false, error: LINK_INVALID_CODE };
    }

    // Mark code as used
    // Claim it only if still unused: two redemptions racing on one code must not both link.
    const claimed = await this.prisma.slackLinkCode.updateMany({
      where: { id: linkCode.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      return { success: false, error: LINK_INVALID_CODE };
    }

    // Upsert slack link (one per slackUserId, one per app user)
    await this.prisma.slackLink.upsert({
      where: { slackUserId },
      create: {
        slackUserId,
        slackTeamId,
        slackProfileName: profileName || null,
        userId: linkCode.userId,
        defaultAccountId: linkCode.accountId,
        isActive: true,
      },
      update: {
        slackTeamId,
        slackProfileName: profileName || null,
        userId: linkCode.userId,
        defaultAccountId: linkCode.accountId,
        isActive: true,
        conversationId: null,
      },
    });

    // Also remove any old link for this userId (different slackUserId)
    await this.prisma.slackLink.deleteMany({
      where: { userId: linkCode.userId, slackUserId: { not: slackUserId } },
    });

    this.logger.log(`Slack ${slackUserId} linked to app user ${linkCode.userId}`);
    return { success: true };
  }

  async getLink(slackUserId: string) {
    const link = await this.prisma.slackLink.findUnique({
      where: { slackUserId, isActive: true },
      include: {
        user: { select: { id: true, name: true, currencyCode: true, language: true } },
        account: { select: { id: true, name: true, currencyCode: true } },
      },
    });
    if (!link) return null;

    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: link.defaultAccountId, userId: link.userId } },
      select: { role: true },
    });
    return { ...link, accountRole: (membership?.role ?? 'owner') as 'owner' | 'editor' | 'viewer' };
  }

  async getLinkByUserId(userId: string) {
    return this.prisma.slackLink.findUnique({
      where: { userId, isActive: true },
    });
  }

  async unlinkBySlackId(slackUserId: string): Promise<boolean> {
    const link = await this.prisma.slackLink.findUnique({ where: { slackUserId } });
    if (!link) return false;

    await this.prisma.slackLink.update({
      where: { slackUserId },
      data: { isActive: false },
    });
    return true;
  }

  async unlinkByUserId(userId: string): Promise<boolean> {
    const link = await this.prisma.slackLink.findUnique({ where: { userId } });
    if (!link) return false;

    await this.prisma.slackLink.update({
      where: { userId },
      data: { isActive: false },
    });
    return true;
  }

  async updateDefaultAccount(slackUserId: string, accountId: string): Promise<void> {
    await this.prisma.slackLink.update({
      where: { slackUserId },
      data: { defaultAccountId: accountId, conversationId: null },
    });
  }

  async updateConversationId(slackUserId: string, conversationId: string): Promise<void> {
    await this.prisma.slackLink.update({
      where: { slackUserId },
      data: { conversationId },
    });
  }

  async resetConversation(slackUserId: string): Promise<void> {
    await this.prisma.slackLink.update({
      where: { slackUserId },
      data: { conversationId: null },
    });
  }

  async updateLastInbound(slackUserId: string): Promise<void> {
    // Fire-and-forget activity tracking. Don't await in hot path.
    this.prisma.slackLink
      .update({
        where: { slackUserId },
        data: { lastInboundAt: new Date() },
      })
      .catch(() => {
        // Link may have been deleted between calls — ignore.
      });
  }
}
