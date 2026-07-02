import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { computeBalances, simplifyDebts, round2, ShareInput } from './settle-up-calculator';
import type { SettleUpResponse, Currency, SettleUpPayResponse } from '@budget/shared-types';
import type { SettleUpPayDto } from './dto';

@Injectable()
export class TripSettleUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  private async getRatesSafe(base: string): Promise<Record<string, number> | null> {
    try {
      const { rates } = await this.exchangeRateService.getRates(base);
      return rates || null;
    } catch {
      return null;
    }
  }

  private convertAmount(
    amount: number,
    from: string,
    base: string,
    rates: Record<string, number>,
  ): number | null {
    if (from === base) return amount;
    const r = rates[from];
    if (!r || r <= 0) return null;
    return Math.round((amount / r) * 100) / 100;
  }

  async getBalances(accountId: string): Promise<SettleUpResponse> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    const baseCurrency = account?.currencyCode ?? 'USD';
    const rates = await this.getRatesSafe(baseCurrency);
    let fxApproximate = rates === null;

    const expenses = await this.prisma.expense.findMany({
      where: { accountId, isDeleted: false, paidByUserId: { not: null } },
      include: { shares: true },
    });

    const shareInputs: ShareInput[] = expenses
      .filter((e: any) => e.shares.length > 0)
      .map((e: any) => {
        const amount = Number(e.amount);
        const convertedAmount = rates
          ? this.convertAmount(amount, e.currencyCode, baseCurrency, rates)
          : amount;
        if (convertedAmount === null) fxApproximate = true;
        return {
          expenseId: e.id,
          paidByUserId: e.paidByUserId as string,
          amountInAccountCurrency: convertedAmount ?? amount,
          shares: e.shares.map((s: any) => {
            const shareAmount = Number(s.shareAmount);
            const converted = rates
              ? this.convertAmount(shareAmount, e.currencyCode, baseCurrency, rates)
              : shareAmount;
            if (converted === null) fxApproximate = true;
            return { userId: s.userId, shareAmount: converted ?? shareAmount };
          }),
        };
      });

    const balances = computeBalances(shareInputs);

    // Confirmed settle-up payments are real money movements that already reduced the
    // debt — net them out of the raw expense-derived balances BEFORE simplifying, so a
    // paid-and-confirmed debt doesn't keep reappearing in suggestedTransfers forever.
    const confirmedTxns = await this.prisma.settleUpTransaction.findMany({
      where: { accountId, status: 'confirmed' },
    });
    const net = new Map(balances.map((b) => [b.userId, b.netAmount]));
    for (const txn of confirmedTxns) {
      const amount = Number(txn.amount);
      net.set(txn.fromUserId, round2((net.get(txn.fromUserId) ?? 0) + amount));
      net.set(txn.toUserId, round2((net.get(txn.toUserId) ?? 0) - amount));
    }
    const adjustedBalances = Array.from(net.entries()).map(([userId, netAmount]) => ({
      userId,
      netAmount,
    }));

    const pendingTransactions = await this.prisma.settleUpTransaction.findMany({
      where: { accountId, status: 'pending' },
    });

    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      include: { user: { select: { name: true } } },
    });
    const nameByUserId = new Map(members.map((m: any) => [m.userId, m.user.name]));

    return {
      balances: adjustedBalances.map((b) => ({
        userId: b.userId,
        userName: nameByUserId.get(b.userId) ?? 'Unknown',
        netAmount: b.netAmount,
      })),
      suggestedTransfers: simplifyDebts(adjustedBalances),
      currencyCode: baseCurrency as Currency,
      fxApproximate,
      pendingTransactions: pendingTransactions.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        amount: Number(t.amount),
        method: t.method,
        status: t.status,
        confirmedAt: t.confirmedAt ? t.confirmedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async createPayment(
    accountId: string,
    dto: SettleUpPayDto,
    callerUserId: string,
  ): Promise<SettleUpPayResponse> {
    // Fix 1: the payer must be the authenticated caller — never trust a client-supplied
    // fromUserId. Reject explicitly (403) instead of silently substituting callerUserId,
    // so a client bug surfaces loudly rather than quietly changing who "paid".
    if (dto.fromUserId !== callerUserId) {
      throw new ForbiddenException('You can only record payments you are making yourself');
    }

    // Fix 2: the payment must match a real, server-computed suggested transfer. This is
    // derived from computeBalances/simplifyDebts over real AccountMember/Expense/
    // TripExpenseShare rows, so it also guarantees toUserId (and fromUserId) are real
    // account members with a real computed debt — closing the membership-validation gap
    // without a separate AccountMember lookup.
    const { suggestedTransfers } = await this.getBalances(accountId);
    const matchesSuggestedTransfer = suggestedTransfers.some(
      (t) =>
        t.fromUserId === dto.fromUserId &&
        t.toUserId === dto.toUserId &&
        Math.abs(t.amount - dto.amount) < 0.01,
    );
    if (!matchesSuggestedTransfer) {
      throw new BadRequestException(
        'This payment does not match a suggested transfer for this account',
      );
    }

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    const currencyCode = account?.currencyCode ?? 'USD';

    const transaction = await this.prisma.settleUpTransaction.create({
      data: {
        accountId,
        fromUserId: dto.fromUserId,
        toUserId: dto.toUserId,
        amount: dto.amount,
        status: 'pending',
      },
    });

    const creditor = await this.prisma.accountMember.findFirst({
      where: { accountId, userId: dto.toUserId },
    });

    let paymentLink: string | null = null;
    let manualInstructions = false;

    if (creditor?.paymentMethod === 'revolut' && creditor.paymentHandle) {
      // Fix 3: encode the free-text handle + amount before interpolating into the URL.
      paymentLink = `https://revolut.me/${encodeURIComponent(creditor.paymentHandle)}?amount=${encodeURIComponent(String(dto.amount))}&currency=${currencyCode}`;
    } else if (creditor?.paymentMethod === 'paypal' && creditor.paymentHandle) {
      paymentLink = `https://paypal.me/${encodeURIComponent(creditor.paymentHandle)}/${encodeURIComponent(String(dto.amount))}${currencyCode}`;
    } else if (creditor?.paymentMethod === 'blik' && creditor.paymentHandle) {
      manualInstructions = true;
    }

    return {
      transactionId: transaction.id,
      paymentLink,
      manualInstructions,
      paymentHandle: creditor?.paymentHandle ?? null,
    };
  }

  async confirmPayment(accountId: string, transactionId: string, callerUserId: string) {
    // Account-scoped lookup: matching on BOTH id AND accountId ensures a transaction id
    // from a different account resolves to null (404) even if the caller is a legitimate
    // member of some other account and happens to guess/enumerate a valid txn id.
    const transaction = await this.prisma.settleUpTransaction.findFirst({
      where: { id: transactionId, accountId },
    });
    if (!transaction) {
      throw new NotFoundException('Settle-up transaction not found');
    }
    // Only the receiver (toUserId) may confirm — callerUserId is guard-derived from the
    // JWT, never client-supplied, so this cannot be spoofed by a request body/param.
    if (transaction.toUserId !== callerUserId) {
      throw new ForbiddenException('Only the receiver can confirm this payment');
    }
    return this.prisma.settleUpTransaction.update({
      where: { id: transactionId },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
  }
}
