import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  account: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  accountMember: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
  accountInvitation: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  settleUpTransaction: {
    count: jest.fn(),
  },
  $transaction: jest.fn((fn: (tx: any) => any) => fn(mockPrisma)),
};

const mockMailService = {
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
};

const mockNotificationsService = {
  sendToUser: jest.fn().mockResolvedValue(true),
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
        { provide: NotificationsService, useValue: mockNotificationsService },
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

  describe('createInvitation via invitedUserId', () => {
    it('creates an invitation and sends a push instead of an email', async () => {
      // Only the caller (owner) is an existing member — the invited user (user-2) is not,
      // otherwise the "already a member" check for invitedUserId would false-positive.
      mockPrisma.accountMember.findUnique = jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.accountId_userId.userId === userId ? { role: 'owner' } : null),
      );
      mockPrisma.account.findUnique = jest.fn().mockResolvedValue({ id: 'account-1', name: 'Bali Trip', type: 'trip' });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null); // no existing member with that email check path is skipped for invitedUserId
      mockPrisma.user.findFirst = jest.fn().mockResolvedValue({ id: userId, name: 'Owner Name' });
      mockPrisma.accountInvitation.create = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        invitedUserId: 'user-2',
        inviteCode: 'abcd1234',
        role: 'editor',
        status: 'pending',
      });

      const result = await service.createInvitation('account-1', userId, {
        invitedUserId: 'user-2',
        role: 'editor',
      });

      expect(mockPrisma.accountInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'account-1',
            invitedBy: userId,
            invitedUserId: 'user-2',
            role: 'editor',
          }),
        }),
      );
      expect(mockNotificationsService.sendToUser).toHaveBeenCalledWith(
        'user-2',
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({ accountId: 'account-1' }),
        'account_invitation',
      );
      expect(mockMailService.sendInvitationEmail).not.toHaveBeenCalled();
      expect(result.invitedUserId).toBe('user-2');
    });
  });

  describe('getMyInvitations', () => {
    it('returns pending invitations matched by invitedUserId or invitedEmail, with account and inviter names', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountInvitation.findMany = jest.fn().mockResolvedValue([
        {
          id: 'invitation-1',
          accountId: 'account-1',
          invitedBy: 'owner-1',
          role: 'editor',
          createdAt: new Date('2026-07-01'),
          account: { name: 'Bali Trip', type: 'trip' },
        },
      ]);
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([{ id: 'owner-1', name: 'Owner Name' }]);

      const result = await service.getMyInvitations(userId);

      expect(mockPrisma.accountInvitation.findMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          OR: [{ invitedUserId: userId }, { invitedEmail: 'me@example.com' }],
        },
        include: { account: { select: { name: true, type: true } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([
        {
          id: 'invitation-1',
          accountId: 'account-1',
          accountName: 'Bali Trip',
          accountType: 'trip',
          inviterName: 'Owner Name',
          role: 'editor',
          createdAt: new Date('2026-07-01'),
        },
      ]);
    });

    it('returns an empty array without querying invitations when the caller user row is missing (stale/deleted-user JWT)', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.accountInvitation.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getMyInvitations(userId);

      expect(result).toEqual([]);
      expect(mockPrisma.accountInvitation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('respondToInvitation', () => {
    it('rejects when the invitation is not found', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.respondToInvitation('invitation-1', userId, 'accept')).rejects.toThrow(
        'Invitation not found',
      );
    });

    it('rejects when the invitation is not addressed to the responder', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: 'someone-else',
        invitedEmail: null,
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });

      await expect(service.respondToInvitation('invitation-1', userId, 'accept')).rejects.toThrow(
        'This invitation is not addressed to you',
      );
    });

    it('accepts by creating an AccountMember and marking the invitation accepted', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: userId,
        invitedEmail: null,
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountMember.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.accountMember.create = jest.fn().mockResolvedValue({ id: 'member-1', accountId: 'account-1', userId, role: 'editor' });
      mockPrisma.accountInvitation.update = jest.fn().mockResolvedValue({ id: 'invitation-1', status: 'accepted' });
      mockPrisma.account.findUnique = jest.fn().mockResolvedValue({ id: 'account-1', name: 'Bali Trip' });

      const result = await service.respondToInvitation('invitation-1', userId, 'accept');

      expect(mockPrisma.accountMember.create).toHaveBeenCalledWith({
        data: { accountId: 'account-1', userId, role: 'editor' },
      });
      expect(mockPrisma.accountInvitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { status: 'accepted', acceptedBy: userId },
      });
      expect(result).toHaveProperty('member');
    });

    it('declines by marking the invitation declined, without creating a member', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: userId,
        invitedEmail: null,
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountInvitation.update = jest.fn().mockResolvedValue({ id: 'invitation-1', status: 'declined' });

      const result = await service.respondToInvitation('invitation-1', userId, 'decline');

      expect(mockPrisma.accountMember.create).not.toHaveBeenCalled();
      expect(mockPrisma.accountInvitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { status: 'declined' },
      });
      expect((result as { status: string }).status).toBe('declined');
    });

    it('rejects when the invitation has already been responded to', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'accepted',
        invitedUserId: userId,
        invitedEmail: null,
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });

      await expect(service.respondToInvitation('invitation-1', userId, 'accept')).rejects.toThrow(
        'This invitation is no longer valid',
      );
      expect(mockPrisma.accountMember.create).not.toHaveBeenCalled();
      expect(mockPrisma.accountInvitation.update).not.toHaveBeenCalled();
    });

    it('rejects and marks the invitation expired when expiresAt is in the past, even though status is still pending', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: userId,
        invitedEmail: null,
        role: 'editor',
        expiresAt: new Date('2020-01-01'),
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountInvitation.update = jest.fn().mockResolvedValue({ id: 'invitation-1', status: 'expired' });

      await expect(service.respondToInvitation('invitation-1', userId, 'accept')).rejects.toThrow(
        'This invitation has expired',
      );
      await expect(service.respondToInvitation('invitation-1', userId, 'decline')).rejects.toThrow(
        'This invitation has expired',
      );
      expect(mockPrisma.accountInvitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { status: 'expired' },
      });
      expect(mockPrisma.accountMember.create).not.toHaveBeenCalled();
    });

    it('accepts via invitedEmail match when invitedUserId does not match the responder', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: null,
        invitedEmail: 'me@example.com',
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountMember.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.accountMember.create = jest.fn().mockResolvedValue({ id: 'member-1', accountId: 'account-1', userId, role: 'editor' });
      mockPrisma.accountInvitation.update = jest.fn().mockResolvedValue({ id: 'invitation-1', status: 'accepted' });
      mockPrisma.account.findUnique = jest.fn().mockResolvedValue({ id: 'account-1', name: 'Bali Trip' });

      const result = await service.respondToInvitation('invitation-1', userId, 'accept');

      expect(mockPrisma.accountMember.create).toHaveBeenCalledWith({
        data: { accountId: 'account-1', userId, role: 'editor' },
      });
      expect(result).toHaveProperty('member');
    });
  });
});

describe('UpdateAccountDto.monthAnchorDay', () => {
  const check = async (value: unknown) => {
    const dto = plainToInstance(UpdateAccountDto, { monthAnchorDay: value });
    return validate(dto);
  };

  it('accepts 1, 10 and 31', async () => {
    expect(await check(1)).toHaveLength(0);
    expect(await check(10)).toHaveLength(0);
    expect(await check(31)).toHaveLength(0);
  });

  it('accepts null to reset to the calendar month', async () => {
    expect(await check(null)).toHaveLength(0);
  });

  it('rejects 0, 32 and non-integers', async () => {
    expect((await check(0)).length).toBeGreaterThan(0);
    expect((await check(32)).length).toBeGreaterThan(0);
    expect((await check(10.5)).length).toBeGreaterThan(0);
  });
});
