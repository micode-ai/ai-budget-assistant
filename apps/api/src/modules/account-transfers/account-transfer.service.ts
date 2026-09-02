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

    // The mobile queue re-sends a create whose response was lost, with the same
    // localId. Without this pre-check the retry hits @@unique([userId, clientId])
    // and 500s forever, so the row could never leave the queue. Checked BEFORE the
    // $transaction, and the P2002 re-fetch below is outside it too — a constraint
    // violation aborts the whole Postgres transaction (ABA-313).
    const already = await this.prisma.accountTransfer.findUnique({
      where: { userId_clientId: { userId, clientId: dto.localId } },
    });
    if (already) return already;

    const countAsIncome = dto.countAsIncome ?? false;

    try {
      return await this.createRow(userId, dto, countAsIncome);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        const raced = await this.prisma.accountTransfer.findUnique({
          where: { userId_clientId: { userId, clientId: dto.localId } },
        });
        if (raced) return raced;
      }
      throw e;
    }
  }

  private createRow(
    userId: string,
    dto: CreateAccountTransferDto,
    countAsIncome: boolean,
  ) {
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

  /**
   * Every transfer touching this account, whoever created it. Deliberately NOT
   * filtered by `userId` (ABA-473): `WalletService` aggregates transfers by account
   * with no user filter, so a shared account's balance already counts a transfer
   * made by another member — hiding the row itself only made the list disagree with
   * the balance it is supposed to explain. `userId` stays on the row as creator
   * attribution.
   */
  async findAll(accountId: string, _userId: string) {
    return this.prisma.accountTransfer.findMany({
      where: {
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

    if (nextFromAccountId === nextToAccountId) {
      throw new BadRequestException('Cannot transfer to the same account');
    }
    // Deliberately NOT requiring the request's account to stay a party. Correcting
    // "this money went to House, not Family" *from* the Family screen necessarily
    // drops Family from both sides — that is the correction, not an error. The row
    // stays visible on the two accounts it now belongs to. The rail used to reject
    // exactly this edit while the client swallowed the rejection, so the money never
    // moved and no error was ever shown.
    //
    // Checked on EVERY edit, not only when the accounts change (ABA-473): the row is
    // no longer creator-locked, and changing an amount moves the *other* account's
    // balance too — so the rule is "you may edit a transfer only if you could have
    // created it". Skipping the check on a no-account-change edit was safe only
    // while the lookup required `userId`.
    await this.assertCanTransferBetween(userId, nextFromAccountId, nextToAccountId);

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
   * Resolves a transfer the caller may act on: not deleted, and touching the account
   * they are acting as. That party scoping IS the read boundary — you cannot reach a
   * transfer from an account that is party to neither side — and it replaced a
   * `userId` filter (ABA-473) so a shared account's other members can see and fix a
   * transfer they did not create. Permission to actually write is then decided by
   * `assertCanTransferBetween` in the callers.
   *
   * `id` is matched against BOTH the server id and `clientId`: the mobile client
   * addresses a row by its local id until a wallet pull backfills serverId, and
   * matching on `id` alone 404s that edit away — silently, since the client only
   * console.warns. Same convention as ExpensesService.resolveExpensePk (ABA-374).
   * A clientId is a client-generated UUIDv4, so dropping `userId` from that branch
   * cannot realistically collide, and the party scoping bounds it anyway.
   */
  private findOwnedTransfer(accountId: string, _userId: string, id: string) {
    return this.prisma.accountTransfer.findFirst({
      where: {
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

    // Deleting moves both accounts' balances, so it takes the same permission as
    // creating the transfer would (ABA-473) — the row is no longer creator-locked.
    await this.assertCanTransferBetween(userId, transfer.fromAccountId, transfer.toAccountId);

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
