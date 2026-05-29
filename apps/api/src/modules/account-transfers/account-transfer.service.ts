import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAccountTransferDto, UpdateAccountTransferDto } from './dto';

@Injectable()
export class AccountTransferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, userId: string, dto: CreateAccountTransferDto) {
    // The current account must be one of the two sides of the transfer
    if (dto.fromAccountId !== accountId && dto.toAccountId !== accountId) {
      throw new ForbiddenException('Current account must be a party to the transfer');
    }

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

    const countAsIncome = dto.countAsIncome ?? false;

    return this.prisma.$transaction(async (tx) => {
      let linkedIncomeId: string | undefined;

      if (countAsIncome) {
        const income = await tx.income.create({
          data: {
            accountId: dto.toAccountId,
            userId,
            clientId: `transfer-income-${dto.localId}`,
            amount: dto.toAmount,
            currencyCode: dto.toCurrency,
            description: 'Transfer from account',
            notes: dto.notes || undefined,
            date: new Date(dto.date),
          },
        });
        linkedIncomeId = income.id;
      }

      return tx.accountTransfer.create({
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
          countAsIncome,
          linkedIncomeId,
        },
      });
    });
  }

  async findAll(accountId: string, userId: string) {
    return this.prisma.accountTransfer.findMany({
      where: {
        userId,
        isDeleted: false,
        OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
      },
      orderBy: { date: 'desc' },
    });
  }

  async update(accountId: string, userId: string, id: string, dto: UpdateAccountTransferDto) {
    const transfer = await this.prisma.accountTransfer.findFirst({
      where: {
        id,
        userId,
        isDeleted: false,
        OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    return this.prisma.$transaction(async (tx) => {
      const countAsIncome = dto.countAsIncome ?? transfer.countAsIncome;

      if (countAsIncome && !transfer.countAsIncome) {
        // Turned ON: create linked income
        const income = await tx.income.create({
          data: {
            accountId: transfer.toAccountId,
            userId,
            clientId: `transfer-income-${transfer.clientId}`,
            amount: dto.toAmount ?? transfer.toAmount,
            currencyCode: transfer.toCurrency,
            description: 'Transfer from account',
            notes: dto.notes ?? transfer.notes ?? undefined,
            date: dto.date ? new Date(dto.date) : transfer.date,
          },
        });
        return tx.accountTransfer.update({
          where: { id },
          data: {
            ...this.buildUpdateData(dto),
            countAsIncome: true,
            linkedIncomeId: income.id,
            syncVersion: { increment: 1 },
          },
        });
      } else if (!countAsIncome && transfer.countAsIncome && transfer.linkedIncomeId) {
        // Turned OFF: soft-delete linked income
        await tx.income.update({
          where: { id: transfer.linkedIncomeId },
          data: { isDeleted: true, syncVersion: { increment: 1 } },
        });
        return tx.accountTransfer.update({
          where: { id },
          data: {
            ...this.buildUpdateData(dto),
            countAsIncome: false,
            linkedIncomeId: null,
            syncVersion: { increment: 1 },
          },
        });
      } else {
        // No toggle — update fields; keep linked income in sync if present
        if (transfer.linkedIncomeId && countAsIncome) {
          await tx.income.update({
            where: { id: transfer.linkedIncomeId },
            data: {
              amount: dto.toAmount ?? transfer.toAmount,
              notes: dto.notes !== undefined ? (dto.notes || undefined) : undefined,
              date: dto.date ? new Date(dto.date) : undefined,
              syncVersion: { increment: 1 },
            },
          });
        }
        return tx.accountTransfer.update({
          where: { id },
          data: {
            ...this.buildUpdateData(dto),
            countAsIncome,
            syncVersion: { increment: 1 },
          },
        });
      }
    });
  }

  private buildUpdateData(dto: UpdateAccountTransferDto) {
    const data: Record<string, unknown> = {};
    if (dto.fromAmount !== undefined) data.fromAmount = dto.fromAmount;
    if (dto.toAmount !== undefined) data.toAmount = dto.toAmount;
    if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.notes !== undefined) data.notes = dto.notes;
    return data;
  }

  async remove(accountId: string, userId: string, id: string) {
    const transfer = await this.prisma.accountTransfer.findFirst({
      where: {
        id,
        userId,
        isDeleted: false,
        OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    await this.prisma.$transaction(async (tx) => {
      if (transfer.countAsIncome && transfer.linkedIncomeId) {
        await tx.income.update({
          where: { id: transfer.linkedIncomeId },
          data: { isDeleted: true, syncVersion: { increment: 1 } },
        });
      }

      await tx.accountTransfer.update({
        where: { id },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
    });

    return { success: true };
  }
}
