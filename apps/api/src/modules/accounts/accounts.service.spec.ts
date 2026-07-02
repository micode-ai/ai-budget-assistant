import { Test } from '@nestjs/testing';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateAccountDto } from './dto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  account: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  accountMember: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  settleUpTransaction: {
    count: jest.fn(),
  },
  $transaction: jest.fn((fn: (tx: any) => any) => fn(mockPrisma)),
};

const mockMailService = {
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
};

describe('AccountsService', () => {
  let service: AccountsService;
  const userId = 'user-1';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get(AccountsService);

    jest.clearAllMocks();
    mockPrisma.account.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.account.create.mockImplementation(({ data }: any) => ({
      id: 'account-1',
      ...data,
    }));
    mockPrisma.accountMember.create.mockResolvedValue({ id: 'member-1' });
  });

  describe('create — trip accounts', () => {
    it('throws BadRequestException when type is trip and tripEndDate is missing', async () => {
      await expect(
        service.create(userId, { name: 'Bali trip', type: 'trip' } as CreateAccountDto),
      ).rejects.toThrow('tripEndDate is required for trip accounts');
    });

    it('defaults tripStartDate to today and sets tripStatus to active', async () => {
      const account = await service.create(userId, {
        name: 'Bali trip',
        type: 'trip',
        tripEndDate: '2026-08-10',
      } as CreateAccountDto);

      expect(account.tripStatus).toBe('active');
      expect(account.tripStartDate).toBeDefined();
    });
  });

  describe('archiveTrip', () => {
    it('throws ForbiddenException when the caller is not the account owner', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(service.archiveTrip('acc-1', userId)).rejects.toThrow(
        'Only the trip owner can archive it',
      );
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when there are unconfirmed settle-up transactions and force is not set', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', ownerId: userId });
      mockPrisma.settleUpTransaction.count.mockResolvedValue(2);

      await expect(service.archiveTrip('acc-1', userId)).rejects.toThrow(
        'There are unconfirmed settle-up transactions — pass force to archive anyway',
      );
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });

    it('archives the trip when all settle-up transactions are confirmed', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', ownerId: userId });
      mockPrisma.settleUpTransaction.count.mockResolvedValue(0);
      mockPrisma.account.update.mockResolvedValue({ id: 'acc-1', tripStatus: 'archived' });

      const result = await service.archiveTrip('acc-1', userId);

      expect(result.tripStatus).toBe('archived');
      expect(mockPrisma.settleUpTransaction.count).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', status: 'pending' },
      });
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { tripStatus: 'archived' },
      });
    });

    it('skips the unconfirmed-transaction check when force is true', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', ownerId: userId });
      mockPrisma.account.update.mockResolvedValue({ id: 'acc-1', tripStatus: 'archived' });

      const result = await service.archiveTrip('acc-1', userId, true);

      expect(result.tripStatus).toBe('archived');
      expect(mockPrisma.settleUpTransaction.count).not.toHaveBeenCalled();
    });
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
