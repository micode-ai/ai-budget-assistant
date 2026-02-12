import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AccountTransferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: any) {
    // Validate user is member of both accounts
    const fromMembership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: dto.fromAccountId, userId } },
    });
    const toMembership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: dto.toAccountId, userId } },
    });

    if (!fromMembership || !toMembership) {
      throw new ForbiddenException('You must be a member of both accounts');
    }
    if (fromMembership.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot create transfers');
    }

    return this.prisma.accountTransfer.create({
      data: {
        userId,
        clientId: dto.localId,
        fromAccountId: dto.fromAccountId,
        fromCurrency: dto.fromCurrency,
        fromAmount: dto.fromAmount,
        toAccountId: dto.toAccountId,
        toCurrency: dto.toCurrency,
        toAmount: dto.toAmount,
        exchangeRate: dto.exchangeRate,
        date: new Date(dto.date),
        notes: dto.notes,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.accountTransfer.findMany({
      where: { userId, isDeleted: false },
      orderBy: { date: 'desc' },
    });
  }

  async remove(userId: string, id: string) {
    const transfer = await this.prisma.accountTransfer.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    await this.prisma.accountTransfer.update({
      where: { id },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });

    return { success: true };
  }
}
