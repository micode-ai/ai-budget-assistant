import { Test } from '@nestjs/testing';
import { AccountsService } from './accounts.service';
import { AccountInvitationsService } from './account-invitations.service';
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

describe('AccountInvitationsService', () => {
  let service: AccountInvitationsService;
  const userId = 'user-1';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccountInvitationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountsService, useValue: mockAccountsService },
        { provide: MailService, useValue: mockMailService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();
    service = module.get(AccountInvitationsService);
    jest.clearAllMocks();
    mockAccountsService.validateAccess.mockResolvedValue({ id: 'member-x', role: 'owner' });
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
