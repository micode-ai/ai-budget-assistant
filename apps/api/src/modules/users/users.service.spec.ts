import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';

describe('UsersService notification preferences', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  describe('notification preferences — trip settle-up', () => {
    it('includes tripSettleUp in getNotificationPreferences', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue({
        notifyBudgetAlerts: true,
        notifySharedActivity: true,
        notifyDebtReminders: true,
        notifyRecurringExpenses: true,
        notifySubscriptionRenewals: true,
        notifyAnomalyAlerts: true,
        notifyTrackingGap: true,
        notifyPurchaseRequests: true,
        notifyTripSettleUp: true,
      });
      const prefs = await service.getNotificationPreferences('user-1');
      expect(prefs.tripSettleUp).toBe(true);
    });

    it('updates notifyTripSettleUp via updateNotificationPreferences', async () => {
      prisma.user.update = jest.fn().mockResolvedValue({ notifyTripSettleUp: false });
      prisma.user.findUnique = jest.fn().mockResolvedValue({ notifyTripSettleUp: false });
      await service.updateNotificationPreferences('user-1', { tripSettleUp: false });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ notifyTripSettleUp: false }) }),
      );
    });
  });
});
