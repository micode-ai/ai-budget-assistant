import { Test } from '@nestjs/testing';
import { FamilyFeedController } from './family-feed.controller';
import { FamilyFeedService } from './family-feed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import type { AuthenticatedRequest } from '../../common/types/index';

describe('FamilyFeedController', () => {
  let controller: FamilyFeedController;
  let svc: { getFeed: jest.Mock; react: jest.Mock; removeReaction: jest.Mock };

  const req = { accountId: 'acc1', user: { id: 'u1' } } as unknown as AuthenticatedRequest;

  // Pass-through guard that bypasses JWT and account-context validation
  const passThroughGuard = { canActivate: () => true };

  beforeEach(async () => {
    svc = {
      getFeed: jest.fn().mockResolvedValue([]),
      react: jest.fn().mockResolvedValue(undefined),
      removeReaction: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      controllers: [FamilyFeedController],
      providers: [{ provide: FamilyFeedService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(AccountContextGuard)
      .useValue(passThroughGuard)
      .compile();
    controller = module.get(FamilyFeedController);
  });

  it('GET /family-feed calls getFeed with accountId and userId', async () => {
    const result = await controller.getFeed(req);
    expect(svc.getFeed).toHaveBeenCalledWith('acc1', 'u1', 100);
    expect(result).toEqual([]);
  });

  it('POST /family-feed/:eventId/react calls react', async () => {
    await controller.react(req, 'ev1', { emoji: '👍' });
    expect(svc.react).toHaveBeenCalledWith('acc1', 'u1', 'ev1', '👍');
  });

  it('DELETE /family-feed/:eventId/react calls removeReaction', async () => {
    await controller.removeReaction(req, 'ev1');
    expect(svc.removeReaction).toHaveBeenCalledWith('acc1', 'u1', 'ev1');
  });
});
