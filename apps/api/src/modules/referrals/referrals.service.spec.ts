import { ReferralsService } from './referrals.service';

function makeService(overrides: { stripeSecretKey?: string } = {}) {
  const prisma: any = {
    user: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    referral: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { bonusAiRequests: 0 } }),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };

  const configValues: Record<string, string | undefined> = {
    STRIPE_SECRET_KEY: overrides.stripeSecretKey,
  };
  const configService: any = {
    get: jest.fn((key: string) => configValues[key]),
  };

  const notificationsService: any = { sendToUser: jest.fn().mockResolvedValue(true) };
  const mailService: any = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const telegramService: any = { sendMessage: jest.fn().mockResolvedValue(true) };

  const service = new ReferralsService(
    prisma,
    configService,
    notificationsService,
    mailService,
    telegramService,
  );

  return { service, prisma, configService, notificationsService, mailService, telegramService };
}

describe('ReferralsService', () => {
  // -------------------------------------------------------------------------
  // generateCode
  // -------------------------------------------------------------------------
  describe('generateCode', () => {
    it('returns the existing referral code without writing anything', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: 'EXIST1' });

      const result = await service.generateCode('user-1');

      expect(result).toBe('EXIST1');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('generates and persists a fresh 6-char code from the safe alphabet when none exists', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: null });
      prisma.user.update.mockResolvedValue({});

      const result = await service.generateCode('user-1');

      expect(result).toHaveLength(6);
      expect(result).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { referralCode: result },
      });
    });

    it('retries on a P2002 collision and succeeds on a later attempt', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: null });
      const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
      prisma.user.update
        .mockRejectedValueOnce(p2002)
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({});

      const result = await service.generateCode('user-1');

      expect(result).toHaveLength(6);
      expect(prisma.user.update).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting 5 attempts, all colliding with P2002', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: null });
      const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
      prisma.user.update.mockRejectedValue(p2002);

      await expect(service.generateCode('user-1')).rejects.toThrow(
        'Failed to generate unique referral code after 5 attempts',
      );
      expect(prisma.user.update).toHaveBeenCalledTimes(5);
    });

    it('rethrows immediately on a non-P2002 error without retrying', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: null });
      const dbError = new Error('connection lost');
      prisma.user.update.mockRejectedValue(dbError);

      await expect(service.generateCode('user-1')).rejects.toThrow('connection lost');
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // applyReferralCode
  // -------------------------------------------------------------------------
  describe('applyReferralCode', () => {
    it('does nothing when the code does not match any user', async () => {
      const { service, prisma, notificationsService, telegramService } = makeService();
      prisma.user.findUnique.mockResolvedValue(null);

      await service.applyReferralCode('referred-1', 'BADCODE');

      expect(prisma.referral.create).not.toHaveBeenCalled();
      expect(notificationsService.sendToUser).not.toHaveBeenCalled();
      expect(telegramService.sendMessage).not.toHaveBeenCalled();
    });

    it('does nothing on a self-referral attempt', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Self' });

      await service.applyReferralCode('user-1', 'OWNCODE');

      expect(prisma.referral.create).not.toHaveBeenCalled();
    });

    it('creates the referral, extends the trial by 7 days, and notifies the referrer', async () => {
      const { service, prisma, notificationsService, telegramService } = makeService();
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'referrer-1', name: 'Referrer' }) // lookup by code
        .mockResolvedValueOnce({ name: 'Referred' }); // lookup of referred user's name
      prisma.referral.create.mockResolvedValue({});
      const trialEnd = new Date('2026-01-01T00:00:00.000Z');
      prisma.subscription.findUnique.mockResolvedValue({ trialEnd });
      prisma.subscription.update.mockResolvedValue({});

      await service.applyReferralCode('referred-1', 'GOODCODE');

      expect(prisma.referral.create).toHaveBeenCalledWith({
        data: {
          referrerUserId: 'referrer-1',
          referredUserId: 'referred-1',
          code: 'GOODCODE',
          status: 'pending',
        },
      });
      const updateArgs = prisma.subscription.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ userId: 'referred-1' });
      expect(updateArgs.data.trialEnd.toISOString()).toBe('2026-01-08T00:00:00.000Z');
      expect(notificationsService.sendToUser).toHaveBeenCalledTimes(1);
      expect(notificationsService.sendToUser.mock.calls[0][0]).toBe('referrer-1');
      expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does not touch the trial when the referred user has no active trial', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'referrer-1', name: 'Referrer' })
        .mockResolvedValueOnce({ name: 'Referred' });
      prisma.referral.create.mockResolvedValue({});
      prisma.subscription.findUnique.mockResolvedValue({ trialEnd: null });

      await service.applyReferralCode('referred-1', 'GOODCODE');

      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('swallows a P2002 (user already referred) without throwing', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue({ id: 'referrer-1', name: 'Referrer' });
      const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
      prisma.referral.create.mockRejectedValue(p2002);

      await expect(service.applyReferralCode('referred-1', 'GOODCODE')).resolves.toBeUndefined();
    });

    it('swallows any other unexpected error without throwing', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockRejectedValue(new Error('db down'));

      await expect(service.applyReferralCode('referred-1', 'GOODCODE')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // qualifyPendingReferrals (+ the private grantReferralBonus it drives)
  // -------------------------------------------------------------------------
  describe('qualifyPendingReferrals', () => {
    const referrerBase = { id: 'referrer-1', name: 'Referrer', defaultAccountId: 'acc-1' };

    it('qualifies an active referral, grants the bonus exactly once, and checks milestones', async () => {
      const { service, prisma, notificationsService, telegramService } = makeService();
      const now = new Date();
      const referral = {
        id: 'ref-1',
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        referred: { id: 'referred-1', name: 'Referred', isActive: true, lastSyncAt: now },
        referrer: referrerBase,
      };
      prisma.referral.findMany.mockResolvedValue([referral]);
      // grantReferralBonus reads the referral fresh inside the tx.
      prisma.referral.findUniqueOrThrow = jest.fn().mockResolvedValue({
        id: 'ref-1',
        bonusGranted: false,
      });
      prisma.referral.count.mockResolvedValue(1); // not a milestone (checkMilestones runs, no-ops)

      await service.qualifyPendingReferrals();

      expect(prisma.referral.update).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        data: { status: 'qualified', qualifiedAt: expect.any(Date) },
      });
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: 'referrer-1' },
        data: { bonusAiRequests: { increment: 30 } },
      });
      expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.referral.update).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        data: { bonusGranted: true },
      });
      expect(notificationsService.sendToUser).toHaveBeenCalledTimes(1);
      expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does not double-grant the bonus when it was already granted', async () => {
      const { service, prisma } = makeService();
      const now = new Date();
      const referral = {
        id: 'ref-1',
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        referred: { id: 'referred-1', name: 'Referred', isActive: true, lastSyncAt: now },
        referrer: referrerBase,
      };
      prisma.referral.findMany.mockResolvedValue([referral]);
      prisma.referral.findUniqueOrThrow = jest.fn().mockResolvedValue({
        id: 'ref-1',
        bonusGranted: true,
      });

      await service.qualifyPendingReferrals();

      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
      // Only the status transition update fires, not a second bonusGranted update.
      expect(prisma.referral.update).toHaveBeenCalledTimes(1);
      expect(prisma.referral.update).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        data: { status: 'qualified', qualifiedAt: expect.any(Date) },
      });
    });

    it('expires a stale, inactive referral older than 30 days without granting a bonus', async () => {
      const { service, prisma } = makeService();
      const now = new Date();
      const referral = {
        id: 'ref-2',
        createdAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
        referred: { id: 'referred-2', name: 'Referred2', isActive: false, lastSyncAt: null },
        referrer: referrerBase,
      };
      prisma.referral.findMany.mockResolvedValue([referral]);

      await service.qualifyPendingReferrals();

      expect(prisma.referral.update).toHaveBeenCalledWith({
        where: { id: 'ref-2' },
        data: { status: 'expired' },
      });
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    });

    it('leaves a still-young, not-yet-active referral untouched', async () => {
      const { service, prisma } = makeService();
      const now = new Date();
      const referral = {
        id: 'ref-3',
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        referred: { id: 'referred-3', name: 'Referred3', isActive: false, lastSyncAt: null },
        referrer: referrerBase,
      };
      prisma.referral.findMany.mockResolvedValue([referral]);

      await service.qualifyPendingReferrals();

      expect(prisma.referral.update).not.toHaveBeenCalled();
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    });

    it('treats a referred user inactive at the account level as not-yet-qualified even with a recent lastSyncAt', async () => {
      const { service, prisma } = makeService();
      const now = new Date();
      const referral = {
        id: 'ref-4',
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        referred: { id: 'referred-4', name: 'Referred4', isActive: false, lastSyncAt: now },
        referrer: referrerBase,
      };
      prisma.referral.findMany.mockResolvedValue([referral]);

      await service.qualifyPendingReferrals();

      expect(prisma.referral.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // checkMilestones / grantStripeCoupon
  // -------------------------------------------------------------------------
  describe('checkMilestones', () => {
    it('grants a Stripe coupon at exactly 5 qualified referrals', async () => {
      const { service, prisma, mailService, notificationsService } = makeService({
        stripeSecretKey: 'sk_test_123',
      });
      prisma.referral.count.mockResolvedValue(5);
      prisma.user.findUnique.mockResolvedValue({ email: 'a@b.com', name: 'Referrer' });
      (service as any).configService.get = jest.fn((key: string) =>
        key === 'STRIPE_REFERRAL_COUPON_ID' ? 'coupon_1' : undefined,
      );
      (service as any).stripe = {
        promotionCodes: { create: jest.fn().mockResolvedValue({ code: 'PROMO1' }) },
      };

      await service.checkMilestones('referrer-1', 'acc-1');

      expect((service as any).stripe.promotionCodes.create).toHaveBeenCalledWith({
        promotion: { type: 'coupon', coupon: 'coupon_1' },
        max_redemptions: 1,
      });
      expect(mailService.sendMail).toHaveBeenCalledTimes(1);
      expect(mailService.sendMail.mock.calls[0][0]).toBe('a@b.com');
      expect(notificationsService.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('does nothing at a non-milestone qualified count', async () => {
      const { service, prisma, mailService } = makeService({ stripeSecretKey: 'sk_test_123' });
      prisma.referral.count.mockResolvedValue(4);

      await service.checkMilestones('referrer-1', 'acc-1');

      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('skips coupon creation when STRIPE_REFERRAL_COUPON_ID is unset', async () => {
      const { service, prisma, mailService } = makeService({ stripeSecretKey: 'sk_test_123' });
      prisma.referral.count.mockResolvedValue(5);
      (service as any).configService.get = jest.fn(() => undefined);
      (service as any).stripe = {
        promotionCodes: { create: jest.fn() },
      };

      await service.checkMilestones('referrer-1', 'acc-1');

      expect((service as any).stripe.promotionCodes.create).not.toHaveBeenCalled();
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('catches a Stripe error and does not throw out of checkMilestones', async () => {
      const { service, prisma, mailService } = makeService({ stripeSecretKey: 'sk_test_123' });
      prisma.referral.count.mockResolvedValue(5);
      (service as any).configService.get = jest.fn((key: string) =>
        key === 'STRIPE_REFERRAL_COUPON_ID' ? 'coupon_1' : undefined,
      );
      (service as any).stripe = {
        promotionCodes: { create: jest.fn().mockRejectedValue(new Error('stripe down')) },
      };

      await expect(service.checkMilestones('referrer-1', 'acc-1')).resolves.toBeUndefined();
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getStats
  // -------------------------------------------------------------------------
  describe('getStats', () => {
    it('reports totals and the 5-referral milestone when below it', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: 'MYCODE' });
      prisma.referral.count
        .mockResolvedValueOnce(3) // total
        .mockResolvedValueOnce(2) // qualified
        .mockResolvedValueOnce(1); // pending
      prisma.subscription.findUnique.mockResolvedValue({ bonusAiRequests: 60 });

      const result = await service.getStats('user-1');

      expect(result).toEqual({
        referralCode: 'MYCODE',
        totalReferrals: 3,
        qualifiedReferrals: 2,
        pendingReferrals: 1,
        bonusAiRequests: 60,
        nextMilestone: { count: 5, reward: 'free_pro_month' },
      });
    });

    it('reports the 10-referral milestone once past 5', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: 'MYCODE' });
      prisma.referral.count
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(0);
      prisma.subscription.findUnique.mockResolvedValue({ bonusAiRequests: 150 });

      const result = await service.getStats('user-1');

      expect(result.nextMilestone).toEqual({ count: 10, reward: 'ambassador_badge' });
    });

    it('reports no further milestone at or past 10 qualified referrals', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ referralCode: 'MYCODE' });
      prisma.referral.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);
      prisma.subscription.findUnique.mockResolvedValue(null);

      const result = await service.getStats('user-1');

      expect(result.nextMilestone).toBeNull();
      expect(result.bonusAiRequests).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getList
  // -------------------------------------------------------------------------
  describe('getList', () => {
    it('maps referrals into the flat list shape', async () => {
      const { service, prisma } = makeService();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const qualifiedAt = new Date('2026-01-05T00:00:00.000Z');
      prisma.referral.findMany.mockResolvedValue([
        { id: 'ref-1', referred: { name: 'Alice' }, status: 'qualified', createdAt, qualifiedAt },
        { id: 'ref-2', referred: { name: 'Bob' }, status: 'pending', createdAt, qualifiedAt: null },
      ]);

      const result = await service.getList('user-1');

      expect(result).toEqual([
        {
          id: 'ref-1',
          referredName: 'Alice',
          status: 'qualified',
          createdAt: createdAt.toISOString(),
          qualifiedAt: qualifiedAt.toISOString(),
        },
        {
          id: 'ref-2',
          referredName: 'Bob',
          status: 'pending',
          createdAt: createdAt.toISOString(),
          qualifiedAt: null,
        },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // getAdminStats
  // -------------------------------------------------------------------------
  describe('getAdminStats', () => {
    it('computes the qualified rate and aggregates bonus totals', async () => {
      const { service, prisma } = makeService();
      prisma.referral.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // qualified
        .mockResolvedValueOnce(2) // expired
        .mockResolvedValueOnce(5); // pending
      prisma.subscription.aggregate.mockResolvedValue({ _sum: { bonusAiRequests: 90 } });
      prisma.referral.groupBy.mockResolvedValue([{ referrerUserId: 'a' }, { referrerUserId: 'b' }]);

      const result = await service.getAdminStats();

      expect(result).toEqual({
        totalReferrals: 10,
        qualifiedReferrals: 3,
        expiredReferrals: 2,
        pendingReferrals: 5,
        qualifiedRate: 30,
        totalBonusAiRequests: 90,
        activeReferrers: 2,
      });
    });

    it('does not divide by zero when there are no referrals at all', async () => {
      const { service, prisma } = makeService();
      prisma.referral.count.mockResolvedValue(0);
      prisma.subscription.aggregate.mockResolvedValue({ _sum: { bonusAiRequests: null } });
      prisma.referral.groupBy.mockResolvedValue([]);

      const result = await service.getAdminStats();

      expect(result.qualifiedRate).toBe(0);
      expect(result.totalBonusAiRequests).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getAdminList
  // -------------------------------------------------------------------------
  describe('getAdminList', () => {
    it('filters by status and paginates', async () => {
      const { service, prisma } = makeService();
      prisma.referral.findMany.mockResolvedValue([]);
      prisma.referral.count.mockResolvedValue(45);

      const result = await service.getAdminList({ status: 'qualified', page: 2, limit: 20 });

      const findArgs = prisma.referral.findMany.mock.calls[0][0];
      expect(findArgs.where).toEqual({ status: 'qualified' });
      expect(findArgs.skip).toBe(20);
      expect(findArgs.take).toBe(20);
      expect(result.total).toBe(45);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
    });

    it('drops the status filter entirely when status is "all"', async () => {
      const { service, prisma } = makeService();
      prisma.referral.findMany.mockResolvedValue([]);
      prisma.referral.count.mockResolvedValue(0);

      await service.getAdminList({ status: 'all' });

      const findArgs = prisma.referral.findMany.mock.calls[0][0];
      expect(findArgs.where).toEqual({});
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(20);
    });

    it('maps referrer/referred name+email and bonusGranted through', async () => {
      const { service, prisma } = makeService();
      const createdAt = new Date('2026-02-01T00:00:00.000Z');
      prisma.referral.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          referrer: { name: 'Referrer', email: 'r@x.com' },
          referred: { name: 'Referred', email: 'f@x.com' },
          code: 'ABC123',
          status: 'qualified',
          bonusGranted: true,
          createdAt,
          qualifiedAt: null,
        },
      ]);
      prisma.referral.count.mockResolvedValue(1);

      const result = await service.getAdminList({});

      expect(result.data[0]).toEqual({
        id: 'ref-1',
        referrer: { name: 'Referrer', email: 'r@x.com' },
        referred: { name: 'Referred', email: 'f@x.com' },
        code: 'ABC123',
        status: 'qualified',
        bonusGranted: true,
        createdAt: createdAt.toISOString(),
        qualifiedAt: null,
      });
    });
  });
});
