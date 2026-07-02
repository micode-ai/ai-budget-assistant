import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';

describe('NotificationsService.sendToUser — trip_settle_up preference gate', () => {
  let service: NotificationsService;
  let prisma: any;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    });
    (global as any).fetch = fetchMock;

    const module = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips sending when the member has notifyTripSettleUp: false', async () => {
    prisma.user.findUnique.mockResolvedValue({
      pushToken: 'ExponentPushToken[abc]',
      language: 'en',
      notifyTripSettleUp: false,
    });

    const result = await service.sendToUser(
      'user-1',
      'Bali trip has ended',
      'Time to settle up',
      { accountId: 'acc-1' },
      'trip_settle_up',
    );

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends when the member has notifyTripSettleUp: true', async () => {
    prisma.user.findUnique.mockResolvedValue({
      pushToken: 'ExponentPushToken[abc]',
      language: 'en',
      notifyTripSettleUp: true,
    });

    const result = await service.sendToUser(
      'user-1',
      'Bali trip has ended',
      'Time to settle up',
      { accountId: 'acc-1' },
      'trip_settle_up',
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
