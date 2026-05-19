import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsAppLinkService } from './whatsapp-link.service';
import { PrismaService } from '../../database/prisma.service';

type LinkRow = {
  id: string;
  waPhoneNumber: string;
  userId: string;
  defaultAccountId: string;
  conversationId: string | null;
  isActive: boolean;
  waProfileName?: string | null;
};

type CodeRow = {
  id: string;
  userId: string;
  accountId: string;
  code: string;
  expiresAt: Date;
  usedAt: Date | null;
};

function makePrismaMock() {
  return {
    whatsAppLinkCode: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue(undefined),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    whatsAppLink: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('WhatsAppLinkService', () => {
  let service: WhatsAppLinkService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    config = { get: jest.fn().mockReturnValue('+1234567890') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppLinkService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<WhatsAppLinkService>(WhatsAppLinkService);
  });

  describe('generateCode', () => {
    it('invalidates previous unused codes for the user', async () => {
      await service.generateCode('user-1', 'acct-1');
      expect(prisma.whatsAppLinkCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('returns a 6-char uppercase hex code, ~10min expiry, and the WA phone number from config', async () => {
      const result = await service.generateCode('user-1', 'acct-1');
      expect(result.code).toMatch(/^[A-F0-9]{6}$/);
      const tenMinFromNow = Date.now() + 10 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThan(tenMinFromNow - 1000);
      expect(result.expiresAt.getTime()).toBeLessThan(tenMinFromNow + 1000);
      expect(result.waPhoneNumber).toBe('+1234567890');
      expect(config.get).toHaveBeenCalledWith('WHATSAPP_BUSINESS_PHONE_NUMBER');
    });
  });

  describe('redeemCode', () => {
    const validCode: CodeRow = {
      id: 'code-1',
      userId: 'user-1',
      accountId: 'acct-1',
      code: 'ABC123',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      usedAt: null,
    };

    it('upserts link, marks code used, deletes stale links for same user', async () => {
      prisma.whatsAppLinkCode.findFirst.mockResolvedValue(validCode);

      const res = await service.redeemCode('abc123', '+34611111111', 'Alice');

      expect(res.success).toBe(true);
      expect(prisma.whatsAppLinkCode.findFirst).toHaveBeenCalledWith({
        where: { code: 'ABC123', usedAt: null, expiresAt: { gt: expect.any(Date) } },
      });
      expect(prisma.whatsAppLinkCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.whatsAppLink.upsert).toHaveBeenCalledWith({
        where: { waPhoneNumber: '+34611111111' },
        create: expect.objectContaining({
          waPhoneNumber: '+34611111111',
          waProfileName: 'Alice',
          userId: 'user-1',
          defaultAccountId: 'acct-1',
          isActive: true,
        }),
        update: expect.objectContaining({
          waProfileName: 'Alice',
          userId: 'user-1',
          defaultAccountId: 'acct-1',
          isActive: true,
          conversationId: null,
        }),
      });
      expect(prisma.whatsAppLink.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', waPhoneNumber: { not: '+34611111111' } },
      });
    });

    it('returns {success: false} when no matching code', async () => {
      prisma.whatsAppLinkCode.findFirst.mockResolvedValue(null);
      const res = await service.redeemCode('NOPE12', '+1');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Invalid|expired/i);
      expect(prisma.whatsAppLink.upsert).not.toHaveBeenCalled();
    });

    it('accepts lowercase code (upper-cases before lookup)', async () => {
      prisma.whatsAppLinkCode.findFirst.mockResolvedValue(validCode);
      await service.redeemCode('abc123', '+1');
      const call = prisma.whatsAppLinkCode.findFirst.mock.calls[0][0];
      expect(call.where.code).toBe('ABC123');
    });
  });

  describe('getLink', () => {
    it('filters by isActive: true and includes user + account', async () => {
      prisma.whatsAppLink.findUnique.mockResolvedValue({} as any);
      await service.getLink('+1');
      expect(prisma.whatsAppLink.findUnique).toHaveBeenCalledWith({
        where: { waPhoneNumber: '+1', isActive: true },
        include: {
          user: { select: { id: true, name: true, currencyCode: true, language: true } },
          account: { select: { id: true, name: true, currencyCode: true } },
        },
      });
    });
  });

  describe('unlinkByPhoneNumber', () => {
    it('returns false when no link exists', async () => {
      prisma.whatsAppLink.findUnique.mockResolvedValue(null);
      const ok = await service.unlinkByPhoneNumber('+1');
      expect(ok).toBe(false);
      expect(prisma.whatsAppLink.update).not.toHaveBeenCalled();
    });

    it('soft-deletes (isActive=false) when link exists', async () => {
      prisma.whatsAppLink.findUnique.mockResolvedValue({ id: 'link-1' } as LinkRow);
      const ok = await service.unlinkByPhoneNumber('+1');
      expect(ok).toBe(true);
      expect(prisma.whatsAppLink.update).toHaveBeenCalledWith({
        where: { waPhoneNumber: '+1' },
        data: { isActive: false },
      });
    });
  });

  describe('updateConversationId / resetConversation', () => {
    it('updates conversationId by phone number', async () => {
      await service.updateConversationId('+1', 'conv-99');
      expect(prisma.whatsAppLink.update).toHaveBeenCalledWith({
        where: { waPhoneNumber: '+1' },
        data: { conversationId: 'conv-99' },
      });
    });

    it('resetConversation nulls the conversationId', async () => {
      await service.resetConversation('+1');
      expect(prisma.whatsAppLink.update).toHaveBeenCalledWith({
        where: { waPhoneNumber: '+1' },
        data: { conversationId: null },
      });
    });
  });
});
