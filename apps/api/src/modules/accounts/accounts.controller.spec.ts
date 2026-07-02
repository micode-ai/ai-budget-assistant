import { Test } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountLimitGuard } from '../subscriptions/guards/account-limit.guard';

const accountsService = {
  archiveTrip: jest.fn(),
};

const subscriptionsService = {
  checkMemberLimit: jest.fn(),
};

// Pass-through guard that bypasses JWT and account-limit validation
const passThroughGuard = { canActivate: () => true };

describe('AccountsController', () => {
  let controller: AccountsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        { provide: AccountsService, useValue: accountsService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(AccountLimitGuard)
      .useValue(passThroughGuard)
      .compile();

    controller = module.get(AccountsController);
    jest.clearAllMocks();
  });

  describe('archiveTrip', () => {
    it('archives the trip when all settle-up transactions are confirmed', async () => {
      accountsService.archiveTrip = jest.fn().mockResolvedValue({ id: 'acc-1', tripStatus: 'archived' });
      const result = await controller.archiveTrip({ user: { id: 'user-1' } } as any, 'acc-1', {});
      expect(result.tripStatus).toBe('archived');
      expect(accountsService.archiveTrip).toHaveBeenCalledWith('acc-1', 'user-1', undefined);
    });

    it('passes force through to the service', async () => {
      accountsService.archiveTrip = jest.fn().mockResolvedValue({ id: 'acc-1', tripStatus: 'archived' });
      await controller.archiveTrip({ user: { id: 'user-1' } } as any, 'acc-1', { force: true });
      expect(accountsService.archiveTrip).toHaveBeenCalledWith('acc-1', 'user-1', true);
    });
  });
});
