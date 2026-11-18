import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from './accounts.service';
import { UpdateMemberRoleDto } from './dto';
import type { AccountMemberPaymentInfoDto } from '@budget/shared-types';

/** Membership management: list, role changes, removal, leaving, payment info. */
@Injectable()
export class AccountMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async getMembers(accountId: string, userId: string) {
    await this.accountsService.validateAccess(accountId, userId);

    return this.prisma.accountMember.findMany({
      where: { accountId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMemberRole(
    accountId: string,
    memberId: string,
    userId: string,
    dto: UpdateMemberRoleDto,
  ) {
    await this.accountsService.validateAccess(accountId, userId, 'owner');

    const member = await this.prisma.accountMember.findFirst({
      where: { id: memberId, accountId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === 'owner') {
      throw new BadRequestException('Cannot change the owner role');
    }

    return this.prisma.accountMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async removeMember(accountId: string, memberId: string, userId: string) {
    await this.accountsService.validateAccess(accountId, userId, 'owner');

    const member = await this.prisma.accountMember.findFirst({
      where: { id: memberId, accountId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === 'owner') {
      throw new BadRequestException('Cannot remove the account owner');
    }

    await this.prisma.accountMember.delete({
      where: { id: memberId },
    });

    // If E2EE is enabled, delete the member's encryption key and flag for key rotation
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionEnabled: true },
    });
    if (account?.encryptionEnabled) {
      await this.prisma.accountEncryptionKey.deleteMany({
        where: { accountId, userId: member.userId },
      });
      await this.prisma.account.update({
        where: { id: accountId },
        data: { keyRotationNeeded: true },
      });
    }

    return { success: true };
  }

  async leaveAccount(accountId: string, userId: string) {
    const membership = await this.accountsService.validateAccess(accountId, userId);

    if (membership.role === 'owner') {
      throw new BadRequestException('Account owner cannot leave. Transfer ownership or delete the account.');
    }

    await this.prisma.accountMember.delete({
      where: { id: membership.id },
    });

    return { success: true };
  }

  async updatePaymentInfo(accountId: string, userId: string, dto: AccountMemberPaymentInfoDto) {
    await this.prisma.accountMember.updateMany({
      where: { accountId, userId },
      data: { paymentMethod: dto.paymentMethod, paymentHandle: dto.paymentHandle },
    });
    return { paymentMethod: dto.paymentMethod, paymentHandle: dto.paymentHandle };
  }
}
