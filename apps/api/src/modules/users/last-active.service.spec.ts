import { Test } from '@nestjs/testing';
import { LastActiveService, lastActiveKey, LAST_ACTIVE_THROTTLE_SEC } from './last-active.service';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';

describe('LastActiveService', () => {
  let service: LastActiveService;
  let prisma: any;
  let cache: any;

  beforeEach(async () => {
    prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    cache = { setIfAbsent: jest.fn().mockResolvedValue(true) };

    const module = await Test.createTestingModule({
      providers: [
        LastActiveService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(LastActiveService);
  });

  it('stamps lastSyncAt when the throttle window is free', async () => {
    await service.touch('user-1');

    expect(cache.setIfAbsent).toHaveBeenCalledWith(
      lastActiveKey('user-1'),
      LAST_ACTIVE_THROTTLE_SEC,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastSyncAt: expect.any(Date) },
    });
  });

  it('skips the DB write while still inside the throttle window', async () => {
    cache.setIfAbsent.mockResolvedValue(false);

    await service.touch('user-1');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throttles per user — one user being inside the window does not block another', async () => {
    cache.setIfAbsent.mockImplementation(async (key: string) => key === lastActiveKey('user-2'));

    await service.touch('user-1');
    await service.touch('user-2');

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { lastSyncAt: expect.any(Date) },
    });
  });

  // It runs on every authenticated request — a failure here must never surface.
  it('never throws when the DB write fails', async () => {
    prisma.user.update.mockRejectedValue(new Error('db down'));

    await expect(service.touch('user-1')).resolves.toBeUndefined();
  });

  it('skips the write when Redis is unavailable rather than writing on every request', async () => {
    cache.setIfAbsent.mockResolvedValue(false); // what CacheService returns on a Redis error

    await service.touch('user-1');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
