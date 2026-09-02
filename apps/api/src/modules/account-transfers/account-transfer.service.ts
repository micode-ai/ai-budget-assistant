import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

    await this.assertCanTransferBetween(userId, dto.fromAccountId, dto.toAccountId);

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
    const transfer = await this.findOwnedTransfer(accountId, userId, id);
    if (!transfer) throw new NotFoundException('Transfer not found');

    const nextFromAccountId = dto.fromAccountId ?? transfer.fromAccountId;
    const nextToAccountId = dto.toAccountId ?? transfer.toAccountId;
    const nextToCurrency = dto.toCurrency ?? transfer.toCurrency;

    if (nextFromAccountId !== transfer.fromAccountId || nextToAccountId !== transfer.toAccountId) {
      if (nextFromAccountId === nextToAccountId) {
        throw new BadRequestException('Cannot transfer to the same account');
      }
      // Deliberately NOT requiring the request's account to stay a party. Correcting
      // "this money went to House, not Family" *from* the Family screen necessarily
      // drops Family from both sides — that is the correction, not an error. The row
      // stays visible on the two accounts it now belongs to, and permission is still
      // decided by assertCanTransferBetween below. The rail used to reject exactly
      // this edit while the client swallowed the rejection, so the money never moved
      // and no error was ever shown.
      await this.assertCanTransferBetween(userId, nextFromAccountId, nextToAccountId);
    }

    return this.prisma.$transaction(async (tx) => {
      const countAsIncome = dto.countAsIncome ?? transfer.countAsIncome;

      if (countAsIncome && !transfer.countAsIncome) {
        // Turned ON: create linked income
        const income = await tx.income.create({
          data: {
            accountId: nextToAccountId,
            userId,
            clientId: `transfer-income-${transfer.clientId}`,
            amount: dto.toAmount ?? transfer.toAmount,
            currencyCode: nextToCurrency,
            description: 'Transfer from account',
            notes: dto.notes ?? transfer.notes ?? undefined,
            date: dto.date ? new Date(dto.date) : transfer.date,
          },
        });
        return tx.accountTransfer.update({
          where: { id: transfer.id },
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
          where: { id: transfer.id },
          data: {
            ...this.buildUpdateData(dto),
            countAsIncome: false,
            linkedIncomeId: null,
            syncVersion: { increment: 1 },
          },
        });
      } else {
        // No toggle — update fields; keep linked income in sync if present.
        // The income lives on the receiving account, so re-homing the transfer has
        // to move it too, or the money lands on an account that is no longer part
        // of the transfer.
        if (transfer.linkedIncomeId && countAsIncome) {
          await tx.income.update({
            where: { id: transfer.linkedIncomeId },
            data: {
              accountId: nextToAccountId,
              currencyCode: nextToCurrency,
              amount: dto.toAmount ?? transfer.toAmount,
              notes: dto.notes !== undefined ? (dto.notes || undefined) : undefined,
              date: dto.date ? new Date(dto.date) : undefined,
              syncVersion: { increment: 1 },
            },
          });
        }
        return tx.accountTransfer.update({
          where: { id: transfer.id },
          data: {
            ...this.buildUpdateData(dto),
            countAsIncome,
            syncVersion: { increment: 1 },
          },
        });
      }
    });
  }

  /**
   * Resolves a transfer the caller may act on: owned by them, not deleted, and
   * touching the account they are acting as (the read boundary — you cannot reach a
   * transfer from an account that is party to neither side).
   *
   * `id` is matched against BOTH the server id and `clientId`: the mobile client
   * addresses a row by its local id until a wallet pull backfills serverId, and
   * matching on `id` alone 404s that edit away — silently, since the client only
   * console.warns. Same convention as ExpensesService.resolveExpensePk (ABA-374).
   * `@@unique([userId, clientId])` makes the clientId branch unambiguous.
   */
  private findOwnedTransfer(accountId: string, userId: string, id: string) {
    return this.prisma.accountTransfer.findFirst({
      where: {
        userId,
        isDeleted: false,
        AND: [
          { OR: [{ id }, { clientId: id }] },
          { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
        ],
      },
    });
  }

  /**
   * The caller must be a member of both accounts and may not be a viewer on the
   * paying side. Shared by create and by the account-change path in update, so the
   * two can't drift into different permission rules.
   */
  private async assertCanTransferBetween(
    userId: string,
    fromAccountId: string,
    toAccountId: string,
  ) {
    const [fromMembership, toMembership] = await Promise.all([
      this.prisma.accountMember.findUnique({
        where: { accountId_userId: { accountId: fromAccountId, userId } },
      }),
      this.prisma.accountMember.findUnique({
        where: { accountId_userId: { accountId: toAccountId, userId } },
      }),
    ]);

    if (!fromMembership || !toMembership) {
      throw new ForbiddenException('You must be a member of both accounts');
    }
    if (fromMembership.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot create transfers');
    }
  }

  private buildUpdateData(dto: UpdateAccountTransferDto) {
    const data: Record<string, unknown> = {};
    if (dto.fromAccountId !== undefined) data.fromAccountId = dto.fromAccountId;
    if (dto.toAccountId !== undefined) data.toAccountId = dto.toAccountId;
    if (dto.fromCurrency !== undefined) data.fromCurrency = dto.fromCurrency;
    if (dto.toCurrency !== undefined) data.toCurrency = dto.toCurrency;
    if (dto.fromAmount !== undefined) data.fromAmount = dto.fromAmount;
    if (dto.toAmount !== undefined) data.toAmount = dto.toAmount;
    if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.notes !== undefined) data.notes = dto.notes;
    return data;
  }

  async remove(accountId: string, userId: string, id: string) {
    const transfer = await this.findOwnedTransfer(accountId, userId, id);
    if (!transfer) throw new NotFoundException('Transfer not found');

    await this.prisma.$transaction(async (tx) => {
      if (transfer.countAsIncome && transfer.linkedIncomeId) {
        await tx.income.update({
          where: { id: transfer.linkedIncomeId },
          data: { isDeleted: true, syncVersion: { increment: 1 } },
        });
      }

      await tx.accountTransfer.update({
        where: { id: transfer.id },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
    });

    return { success: true };
  }
}
