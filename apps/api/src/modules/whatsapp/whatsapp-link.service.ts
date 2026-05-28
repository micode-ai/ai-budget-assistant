import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WhatsAppLinkService {
  private readonly logger = new Logger(WhatsAppLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateCode(
    userId: string,
    accountId: string,
  ): Promise<{ code: string; expiresAt: Date; waPhoneNumber: string }> {
    // Invalidate any existing unused codes for this user
    await this.prisma.whatsAppLinkCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.whatsAppLinkCode.create({
      data: { userId, accountId, code, expiresAt },
    });

    const waPhoneNumber = this.config.get<string>('WHATSAPP_BUSINESS_PHONE_NUMBER') || '';

    return { code, expiresAt, waPhoneNumber };
  }

  async redeemCode(
    code: string,
    waPhoneNumber: string,
    waProfileName?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const linkCode = await this.prisma.whatsAppLinkCode.findFirst({
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
    await this.prisma.whatsAppLinkCode.update({
      where: { id: linkCode.id },
      data: { usedAt: new Date() },
    });

    // Upsert whatsapp link (one per phone number, one per app user)
    await this.prisma.whatsAppLink.upsert({
      where: { waPhoneNumber },
      create: {
        waPhoneNumber,
        waProfileName: waProfileName || null,
        userId: linkCode.userId,
        defaultAccountId: linkCode.accountId,
        isActive: true,
      },
      update: {
        waProfileName: waProfileName || null,
        userId: linkCode.userId,
        defaultAccountId: linkCode.accountId,
        isActive: true,
        conversationId: null,
      },
    });

    // Also remove any old link for this userId (different phone number)
    await this.prisma.whatsAppLink.deleteMany({
      where: {
        userId: linkCode.userId,
        waPhoneNumber: { not: waPhoneNumber },
      },
    });

    this.logger.log(`WhatsApp ${waPhoneNumber} linked to app user ${linkCode.userId}`);
    return { success: true };
  }

  async getLink(waPhoneNumber: string) {
    const link = await this.prisma.whatsAppLink.findUnique({
      where: { waPhoneNumber, isActive: true },
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
    return this.prisma.whatsAppLink.findUnique({
      where: { userId, isActive: true },
    });
  }

  async unlinkByPhoneNumber(waPhoneNumber: string): Promise<boolean> {
    const link = await this.prisma.whatsAppLink.findUnique({ where: { waPhoneNumber } });
    if (!link) return false;

    await this.prisma.whatsAppLink.update({
      where: { waPhoneNumber },
      data: { isActive: false },
    });
    return true;
  }

  async unlinkByUserId(userId: string): Promise<boolean> {
    const link = await this.prisma.whatsAppLink.findUnique({ where: { userId } });
    if (!link) return false;

    await this.prisma.whatsAppLink.update({
      where: { userId },
      data: { isActive: false },
    });
    return true;
  }

  async updateDefaultAccount(waPhoneNumber: string, accountId: string): Promise<void> {
    await this.prisma.whatsAppLink.update({
      where: { waPhoneNumber },
      data: { defaultAccountId: accountId, conversationId: null },
    });
  }

  async updateConversationId(waPhoneNumber: string, conversationId: string): Promise<void> {
    await this.prisma.whatsAppLink.update({
      where: { waPhoneNumber },
      data: { conversationId },
    });
  }

  async resetConversation(waPhoneNumber: string): Promise<void> {
    await this.prisma.whatsAppLink.update({
      where: { waPhoneNumber },
      data: { conversationId: null },
    });
  }

  async updateLastInbound(waPhoneNumber: string): Promise<void> {
    // Fire-and-forget activity tracking. Don't await in hot path.
    this.prisma.whatsAppLink
      .update({
        where: { waPhoneNumber },
        data: { lastInboundAt: new Date() },
      })
      .catch(() => {
        // Link may have been deleted between calls — ignore.
      });
  }
}
