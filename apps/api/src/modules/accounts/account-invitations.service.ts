import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { accountInvitationTitle, accountInvitationBody } from '../notifications/notification-i18n';
import { AccountsService } from './accounts.service';
import { CreateInvitationDto } from './dto';
import { PrismaClient, Account, AccountMember, AccountInvitation } from '@prisma/client';
import { randomBytes } from 'crypto';

/** Invitation flows: create/list/cancel (owner) and accept/decline/respond (invitee). */
@Injectable()
export class AccountInvitationsService {
  private readonly logger = new Logger(AccountInvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createInvitation(accountId: string, userId: string, dto: CreateInvitationDto) {
    await this.accountsService.validateAccess(accountId, userId, 'owner');

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account || account.type === 'personal') {
      throw new BadRequestException('Invitations can only be created for shared, business, or investment accounts');
    }

    // If inviting by email, check the user is not already a member
    if (dto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        const existingMember = await this.prisma.accountMember.findUnique({
          where: { accountId_userId: { accountId, userId: existingUser.id } },
        });
        if (existingMember) {
          throw new ConflictException('This user is already a member of this account');
        }
      }
    }

    // If inviting a specific user found via search, check they're not already a member
    if (dto.invitedUserId) {
      const existingMember = await this.prisma.accountMember.findUnique({
        where: { accountId_userId: { accountId, userId: dto.invitedUserId } },
      });
      if (existingMember) {
        throw new ConflictException('This user is already a member of this account');
      }
    }

    const inviteCode = randomBytes(4).toString('hex'); // 8 char hex code
    const expiresInDays = dto.expiresInDays || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const invitation = await this.prisma.accountInvitation.create({
      data: {
        accountId,
        invitedBy: userId,
        invitedEmail: dto.email,
        invitedUserId: dto.invitedUserId,
        inviteCode,
        role: dto.role || 'editor',
        expiresAt,
      },
    });

    // Send invitation email (fire-and-forget) — only for the email-address flow
    if (dto.email) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      this.mailService
        .sendInvitationEmail({
          to: dto.email,
          inviterName: inviter?.name || inviter?.email || 'Someone',
          accountName: account.name,
          inviteCode,
          role: dto.role || 'editor',
          expiresAt,
        })
        .catch((err) => this.logger.error('Failed to send invitation email', err));
    }

    // Send a push notification (fire-and-forget) — only for the search-invite flow
    if (dto.invitedUserId) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      const inviterName = inviter?.name || inviter?.email || 'Someone';

      this.notificationsService
        .sendToUser(
          dto.invitedUserId,
          (lang) => accountInvitationTitle(lang, { inviterName }),
          (lang) => accountInvitationBody(lang, { accountName: account.name }),
          { accountId, invitationId: invitation.id },
          'account_invitation',
        )
        .catch((err) => this.logger.error('Failed to send invitation push', err));
    }

    return invitation;
  }

  async getInvitations(accountId: string, userId: string) {
    await this.accountsService.validateAccess(accountId, userId, 'owner');

    return this.prisma.accountInvitation.findMany({
      where: { accountId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyInvitations(userId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!me) return [];

    const invitations = await this.prisma.accountInvitation.findMany({
      where: {
        status: 'pending',
        OR: [{ invitedUserId: userId }, { invitedEmail: me.email }],
      },
      include: { account: { select: { name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (invitations.length === 0) return [];

    const inviterIds = [...new Set(invitations.map((i) => i.invitedBy))];
    const inviters = await this.prisma.user.findMany({
      where: { id: { in: inviterIds } },
      select: { id: true, name: true },
    });
    const inviterNameById = new Map(inviters.map((u) => [u.id, u.name]));

    return invitations.map((i) => ({
      id: i.id,
      accountId: i.accountId,
      accountName: i.account.name,
      accountType: i.account.type,
      inviterName: inviterNameById.get(i.invitedBy) ?? 'Someone',
      role: i.role,
      createdAt: i.createdAt,
    }));
  }

  async cancelInvitation(accountId: string, invitationId: string, userId: string) {
    await this.accountsService.validateAccess(accountId, userId, 'owner');

    const invitation = await this.prisma.accountInvitation.findFirst({
      where: { id: invitationId, accountId, status: 'pending' },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    return this.prisma.accountInvitation.update({
      where: { id: invitationId },
      data: { status: 'expired' },
    });
  }

  async acceptInvitation(userId: string, inviteCode: string) {
    const invitation = await this.prisma.accountInvitation.findUnique({
      where: { inviteCode },
      include: { account: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invite code');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('This invitation is no longer valid');
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This invitation has expired');
    }

    // Check if already a member
    const existingMember = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: invitation.accountId, userId } },
    });

    if (existingMember) {
      throw new ConflictException('You are already a member of this account');
    }

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const member = await tx.accountMember.create({
        data: {
          accountId: invitation.accountId,
          userId,
          role: invitation.role,
        },
      });

      await tx.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedBy: userId },
      });

      return {
        member,
        account: invitation.account,
      };
    });
  }

  async respondToInvitation(
    invitationId: string,
    userId: string,
    action: 'accept' | 'decline',
  ): Promise<{ member: AccountMember; account: Account | null } | AccountInvitation> {
    const invitation = await this.prisma.accountInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const addressedToMe =
      invitation.invitedUserId === userId || (!!invitation.invitedEmail && invitation.invitedEmail === me?.email);
    if (!addressedToMe) {
      throw new ForbiddenException('This invitation is not addressed to you');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('This invitation is no longer valid');
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This invitation has expired');
    }

    if (action === 'decline') {
      return this.prisma.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'declined' },
      });
    }

    // action === 'accept' — same membership-creation logic as acceptInvitation()
    const existingMember = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: invitation.accountId, userId } },
    });
    if (existingMember) {
      throw new ConflictException('You are already a member of this account');
    }

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const member = await tx.accountMember.create({
        data: {
          accountId: invitation.accountId,
          userId,
          role: invitation.role,
        },
      });

      await tx.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedBy: userId },
      });

      const account = await tx.account.findUnique({ where: { id: invitation.accountId } });

      return { member, account };
    });
  }

  async declineInvitation(userId: string, inviteCode: string) {
    const invitation = await this.prisma.accountInvitation.findUnique({
      where: { inviteCode },
    });

    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException('Invitation not found');
    }

    return this.prisma.accountInvitation.update({
      where: { id: invitation.id },
      data: { status: 'declined' },
    });
  }
}
