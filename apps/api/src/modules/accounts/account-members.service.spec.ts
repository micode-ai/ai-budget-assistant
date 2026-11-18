import { Test } from '@nestjs/testing';
import { AccountsService } from './accounts.service';
import { AccountMembersService } from './account-members.service';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  account: { findUnique: jest.fn() },
  accountMember: { create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  accountInvitation: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: jest.fn((fn: (tx: any) => any) => fn(mockPrisma)),
};
const mockMailService = { sendInvitationEmail: jest.fn().mockResolvedValue(undefined) };
const mockNotificationsService = { sendToUser: jest.fn().mockResolvedValue(true) };
// validateAccess is covered by AccountsService's own spec; here it just resolves.
const mockAccountsService = { validateAccess: jest.fn().mockResolvedValue({ id: 'member-x', role: 'owner' }) };

describe('AccountMembersService', () => {
  let service: AccountMembersService;
  const userId = 'user-1';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccountMembersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountsService, useValue: mockAccountsService },
        { provide: MailService, useValue: mockMailService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();
    service = module.get(AccountMembersService);
    jest.clearAllMocks();
    mockAccountsService.validateAccess.mockResolvedValue({ id: 'member-x', role: 'owner' });
  });

  describe('updatePaymentInfo', () => {
    it("sets paymentMethod and paymentHandle on the caller's own membership", async () => {
      mockPrisma.accountMember.updateMany.mockResolvedValue({ count: 1 });

      await service.updatePaymentInfo('acc-1', 'user-1', {
        paymentMethod: 'revolut',
        paymentHandle: 'jdoe',
      });

      expect(mockPrisma.accountMember.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', userId: 'user-1' },
        data: { paymentMethod: 'revolut', paymentHandle: 'jdoe' },
      });
    });
  });
});
