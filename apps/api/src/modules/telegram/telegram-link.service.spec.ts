import { TelegramLinkService } from './telegram-link.service';

/** ABA-808: attempts are counted before the lookup, and a code is claimed at most once. */
describe('TelegramLinkService.redeemCode', () => {
  const live = { id: 'c1', userId: 'u1', accountId: 'a1', code: 'ABCDEFGH' };
  const make = (allowed = true, claimed = 1) => {
    const prisma: any = {
      telegramLinkCode: {
        findFirst: jest.fn().mockResolvedValue(live),
        updateMany: jest.fn().mockResolvedValue({ count: claimed }),
      },
      telegramLink: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    const cache: any = { incrementWindow: jest.fn().mockResolvedValue(allowed ? 1 : 999) };
    return { prisma, service: new TelegramLinkService(prisma, { get: jest.fn() } as any, cache) };
  };

  it('refuses without looking the code up once the attempts are used', async () => {
    const { prisma, service } = make(false);
    const res = await service.redeemCode('abcdefgh', 'tg-1');
    expect(res.success).toBe(false);
    expect(prisma.telegramLinkCode.findFirst).not.toHaveBeenCalled();
  });

  it('looks the code up normalised and links on a successful claim', async () => {
    const { prisma, service } = make();
    const res = await service.redeemCode(' abcd-efgh ', 'tg-1');
    expect(res.success).toBe(true);
    expect(prisma.telegramLinkCode.findFirst.mock.calls[0][0].where.code).toBe('ABCDEFGH');
    expect(prisma.telegramLinkCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', usedAt: null } }),
    );
    expect(prisma.telegramLink.upsert).toHaveBeenCalled();
  });

  it('does not link when a concurrent redemption claimed the code first', async () => {
    const { prisma, service } = make(true, 0);
    const res = await service.redeemCode('ABCDEFGH', 'tg-1');
    expect(res.success).toBe(false);
    expect(prisma.telegramLink.upsert).not.toHaveBeenCalled();
  });
});
