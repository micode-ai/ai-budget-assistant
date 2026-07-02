import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TripSettleUpService } from './trip-settle-up.service';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';

describe('TripSettleUpService.getBalances', () => {
  let service: TripSettleUpService;
  let prisma: any;
  let exchangeRateService: any;

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', currencyCode: 'USD' }) },
      expense: {
        // Prisma Decimal arrives as Decimal; the service always wraps with Number()
        // (established convention, see anomaly.service.spec.ts) — plain numbers here.
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            amount: 90,
            currencyCode: 'USD',
            paidByUserId: 'alice',
            userId: 'alice',
            shares: [
              { userId: 'alice', shareAmount: 30 },
              { userId: 'bob', shareAmount: 30 },
              { userId: 'carol', shareAmount: 30 },
            ],
          },
        ]),
      },
      accountMember: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'alice', user: { name: 'Alice' } },
          { userId: 'bob', user: { name: 'Bob' } },
          { userId: 'carol', user: { name: 'Carol' } },
        ]),
      },
      settleUpTransaction: {
        // getBalances() calls findMany twice (confirmed, then pending) — default to
        // empty for both so existing tests (that don't care about settle-up txns) are
        // unaffected. Tests that DO care override this mock explicitly.
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    exchangeRateService = { getRates: jest.fn().mockResolvedValue({ base: 'USD', rates: { USD: 1 } }) };

    const module = await Test.createTestingModule({
      providers: [
        TripSettleUpService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExchangeRateService, useValue: exchangeRateService },
      ],
    }).compile();
    service = module.get(TripSettleUpService);
  });

  it('returns balances and suggested transfers for the account', async () => {
    const result = await service.getBalances('acc-1');
    expect(result.currencyCode).toBe('USD');
    expect(result.balances.find((b) => b.userId === 'alice')?.netAmount).toBe(60);
    expect(result.suggestedTransfers).toHaveLength(2);
    expect(result.fxApproximate).toBe(false);
  });

  it('flags fxApproximate when the entire rate fetch fails, even if every expense is already in base currency', async () => {
    exchangeRateService.getRates.mockRejectedValue(new Error('rate provider down'));

    const result = await service.getBalances('acc-1');
    expect(result.currencyCode).toBe('USD');
    expect(result.balances.find((b) => b.userId === 'alice')?.netAmount).toBe(60);
    expect(result.fxApproximate).toBe(true);
  });

  it('returns an empty pendingTransactions array when there are no settle-up transactions', async () => {
    const result = await service.getBalances('acc-1');
    expect(result.pendingTransactions).toEqual([]);
  });

  describe('settle-up transaction netting', () => {
    // A dedicated one-directional fixture (alice paid $90, bob owes the full $90 — no carol
    // share) makes the netting math unambiguous to assert on.
    const singleDebtorExpense = [
      {
        id: 'e1',
        amount: 90,
        currencyCode: 'USD',
        paidByUserId: 'alice',
        userId: 'alice',
        shares: [
          { userId: 'alice', shareAmount: 0 },
          { userId: 'bob', shareAmount: 90 },
        ],
      },
    ];

    it('nets a confirmed partial payment out of suggestedTransfers', async () => {
      prisma.expense.findMany = jest.fn().mockResolvedValue(singleDebtorExpense);
      prisma.settleUpTransaction.findMany = jest.fn().mockImplementation(({ where }: any) => {
        if (where.status === 'confirmed') {
          return Promise.resolve([
            {
              id: 'txn-c1',
              accountId: 'acc-1',
              fromUserId: 'bob',
              toUserId: 'alice',
              amount: 30,
              method: null,
              status: 'confirmed',
              confirmedAt: new Date('2026-06-01T00:00:00Z'),
              createdAt: new Date('2026-05-01T00:00:00Z'),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getBalances('acc-1');
      expect(result.suggestedTransfers).toEqual([
        { fromUserId: 'bob', toUserId: 'alice', amount: 60 },
      ]);
      // The returned `balances` summary must reflect the same confirmed-payment netting
      // as `suggestedTransfers` — not the stale raw $90/-$90 from computeBalances().
      expect(result.balances.find((b) => b.userId === 'alice')?.netAmount).toBe(60);
      expect(result.balances.find((b) => b.userId === 'bob')?.netAmount).toBe(-60);
    });

    it('nets a confirmed full payment out of suggestedTransfers (fully paid => no entry)', async () => {
      prisma.expense.findMany = jest.fn().mockResolvedValue(singleDebtorExpense);
      prisma.settleUpTransaction.findMany = jest.fn().mockImplementation(({ where }: any) => {
        if (where.status === 'confirmed') {
          return Promise.resolve([
            {
              id: 'txn-c2',
              accountId: 'acc-1',
              fromUserId: 'bob',
              toUserId: 'alice',
              amount: 90,
              method: null,
              status: 'confirmed',
              confirmedAt: new Date('2026-06-01T00:00:00Z'),
              createdAt: new Date('2026-05-01T00:00:00Z'),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getBalances('acc-1');
      expect(result.suggestedTransfers).toEqual([]);
      // Fully paid: the `balances` summary must also show zero, not the stale raw debt.
      expect(result.balances.find((b) => b.userId === 'alice')?.netAmount).toBe(0);
      expect(result.balances.find((b) => b.userId === 'bob')?.netAmount).toBe(0);
    });

    it('returns pendingTransactions populated correctly and excludes confirmed transactions from it', async () => {
      const pendingTxn = {
        id: 'txn-p1',
        accountId: 'acc-1',
        fromUserId: 'carol',
        toUserId: 'alice',
        amount: 30,
        method: null,
        status: 'pending',
        confirmedAt: null,
        createdAt: new Date('2026-06-15T00:00:00Z'),
      };
      const confirmedTxn = {
        id: 'txn-c3',
        accountId: 'acc-1',
        fromUserId: 'bob',
        toUserId: 'alice',
        amount: 30,
        method: null,
        status: 'confirmed',
        confirmedAt: new Date('2026-06-10T00:00:00Z'),
        createdAt: new Date('2026-06-01T00:00:00Z'),
      };
      prisma.settleUpTransaction.findMany = jest.fn().mockImplementation(({ where }: any) => {
        if (where.status === 'confirmed') return Promise.resolve([confirmedTxn]);
        if (where.status === 'pending') return Promise.resolve([pendingTxn]);
        return Promise.resolve([]);
      });

      const result = await service.getBalances('acc-1');
      expect(result.pendingTransactions).toHaveLength(1);
      expect(result.pendingTransactions[0]).toMatchObject({
        id: 'txn-p1',
        status: 'pending',
        fromUserId: 'carol',
        toUserId: 'alice',
        amount: 30,
      });
      expect(result.pendingTransactions.some((t) => t.id === 'txn-c3')).toBe(false);
    });
  });

  describe('createPayment', () => {
    // Shared beforeEach fixture (alice paid 90, split 30/30/30 among alice/bob/carol) means
    // bob owes alice 30 and carol owes alice 30 — these are the only two entries getBalances()
    // will report in suggestedTransfers, and createPayment now validates against exactly that.

    it('generates a Revolut deep link when the creditor has one configured', async () => {
      prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-1' }), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest.fn().mockResolvedValue({ paymentMethod: 'revolut', paymentHandle: 'jdoe' });

      const result = await service.createPayment(
        'acc-1',
        { fromUserId: 'bob', toUserId: 'alice', amount: 30 },
        'bob',
      );

      expect(result.paymentLink).toBe('https://revolut.me/jdoe?amount=30&currency=USD');
      expect(result.manualInstructions).toBe(false);
    });

    it('URL-encodes a payment handle that contains characters needing encoding', async () => {
      prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-1b' }), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest
        .fn()
        .mockResolvedValue({ paymentMethod: 'revolut', paymentHandle: 'john doe&x' });

      const result = await service.createPayment(
        'acc-1',
        { fromUserId: 'bob', toUserId: 'alice', amount: 30 },
        'bob',
      );

      expect(result.paymentLink).toBe(
        `https://revolut.me/${encodeURIComponent('john doe&x')}?amount=30&currency=USD`,
      );
      // sanity: the raw un-encoded handle must not appear verbatim in the URL
      expect(result.paymentLink).not.toContain('john doe&x');
    });

    it('URL-encodes the PayPal handle and amount too', async () => {
      prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-1c' }), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest
        .fn()
        .mockResolvedValue({ paymentMethod: 'paypal', paymentHandle: 'j doe' });

      const result = await service.createPayment(
        'acc-1',
        { fromUserId: 'bob', toUserId: 'alice', amount: 30 },
        'bob',
      );

      expect(result.paymentLink).toBe(
        `https://paypal.me/${encodeURIComponent('j doe')}/30USD`,
      );
    });

    it('returns manual instructions for BLIK', async () => {
      prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-2' }), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest.fn().mockResolvedValue({ paymentMethod: 'blik', paymentHandle: '+48123456789' });

      const result = await service.createPayment(
        'acc-1',
        { fromUserId: 'bob', toUserId: 'alice', amount: 30 },
        'bob',
      );

      expect(result.paymentLink).toBeNull();
      expect(result.manualInstructions).toBe(true);
      expect(result.paymentHandle).toBe('+48123456789');
    });

    it('returns no link when the creditor has no payment method set', async () => {
      prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-3' }), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest.fn().mockResolvedValue({ paymentMethod: null, paymentHandle: null });

      const result = await service.createPayment(
        'acc-1',
        { fromUserId: 'bob', toUserId: 'alice', amount: 30 },
        'bob',
      );

      expect(result.paymentLink).toBeNull();
      expect(result.manualInstructions).toBe(false);
    });

    it('throws ForbiddenException when dto.fromUserId does not match the authenticated caller', async () => {
      prisma.settleUpTransaction = { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest.fn();

      await expect(
        service.createPayment(
          'acc-1',
          { fromUserId: 'bob', toUserId: 'alice', amount: 30 },
          'carol', // caller is carol, but dto claims to be paying as bob
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.settleUpTransaction.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the amount does not match any suggested transfer', async () => {
      prisma.settleUpTransaction = { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest.fn();

      await expect(
        service.createPayment(
          'acc-1',
          { fromUserId: 'bob', toUserId: 'alice', amount: 999 }, // real debt is 30, not 999
          'bob',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.settleUpTransaction.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when toUserId is not a real debtor relationship (e.g. a non-member id)', async () => {
      prisma.settleUpTransaction = { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
      prisma.accountMember.findFirst = jest.fn();

      await expect(
        service.createPayment(
          'acc-1',
          { fromUserId: 'bob', toUserId: 'mallory', amount: 30 }, // mallory has no computed debt relationship with bob
          'bob',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.settleUpTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmPayment', () => {
    it('confirms when called by the receiver', async () => {
      prisma.settleUpTransaction = {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'txn-1', accountId: 'acc-1', toUserId: 'alice', status: 'pending' }),
        update: jest.fn().mockResolvedValue({ id: 'txn-1', status: 'confirmed' }),
      };

      const result = await service.confirmPayment('acc-1', 'txn-1', 'alice');
      expect(result.status).toBe('confirmed');
      expect(prisma.settleUpTransaction.findFirst).toHaveBeenCalledWith({
        where: { id: 'txn-1', accountId: 'acc-1' },
      });
    });

    it('throws ForbiddenException when called by someone other than the receiver', async () => {
      prisma.settleUpTransaction = {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'txn-1', accountId: 'acc-1', toUserId: 'alice', status: 'pending' }),
        update: jest.fn(),
      };

      await expect(service.confirmPayment('acc-1', 'txn-1', 'bob')).rejects.toThrow(
        'Only the receiver can confirm this payment',
      );
      await expect(service.confirmPayment('acc-1', 'txn-1', 'bob')).rejects.toThrow(ForbiddenException);
      expect(prisma.settleUpTransaction.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the transaction does not belong to the account', async () => {
      prisma.settleUpTransaction = {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      };

      await expect(service.confirmPayment('acc-1', 'txn-missing', 'alice')).rejects.toThrow(
        'Settle-up transaction not found',
      );
      await expect(service.confirmPayment('acc-1', 'txn-missing', 'alice')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.settleUpTransaction.update).not.toHaveBeenCalled();
    });
  });
});
