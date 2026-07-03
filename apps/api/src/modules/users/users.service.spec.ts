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

describe('UsersService.search', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('returns [] without querying the DB for a query shorter than 2 characters', async () => {
    const result = await service.search('user-1', 'a');
    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('excludes the caller and inactive users, matches name or email, caps at 20', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-2', name: 'Anna', email: 'anna@example.com' },
    ]);

    const result = await service.search('user-1', 'ann');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 'user-1' },
        isActive: true,
        OR: [
          { name: { contains: 'ann', mode: 'insensitive' } },
          { email: { contains: 'ann', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    });
    expect(result).toEqual([{ id: 'user-2', name: 'Anna', email: 'anna@example.com' }]);
  });
});
