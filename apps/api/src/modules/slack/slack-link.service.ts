import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SlackLinkService {
  private readonly logger = new Logger(SlackLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateCode(userId: string, accountId: string): Promise<{ code: string; expiresAt: Date }> {
    // Invalidate any existing unused codes for this user
    await this.prisma.slackLinkCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
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
    const linkCode = await this.prisma.slackLinkCode.findFirst({
      where: {
        code: code.toUpperCase(),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!linkCode) {
      return { success: false, error: 'Invalid or expired code. Please generate a new one in the app.' };
    }

    // Mark code as used
    await this.prisma.slackLinkCode.update({
      where: { id: linkCode.id },
      data: { usedAt: new Date() },
    });

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
