import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { ImportWiseService } from './import-wise.service';
import { ImportBatchesService } from '../import-batches/import-batches.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';

const HEADER =
  'TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Exchange From,Exchange To,Exchange Rate,Exchange From Amount,Exchange To Amount,Payer Name,Payee Name,Merchant,Total fees,Note';

function row(fields: {
  id: string;
  date: string;
  amount: string;
  currency: string;
  description?: string;
  paymentRef?: string;
  exchangeFrom?: string;
  exchangeTo?: string;
  exchangeRate?: string;
  exchangeFromAmount?: string;
  exchangeToAmount?: string;
  payerName?: string;
  payeeName?: string;
  merchant?: string;
  totalFees?: string;
  note?: string;
}): string {
  return [
    fields.id,
    fields.date,
    fields.amount,
    fields.currency,
    fields.description ?? '',
    fields.paymentRef ?? '',
    fields.exchangeFrom ?? '',
    fields.exchangeTo ?? '',
    fields.exchangeRate ?? '',
    fields.exchangeFromAmount ?? '',
    fields.exchangeToAmount ?? '',
    fields.payerName ?? '',
    fields.payeeName ?? '',
    fields.merchant ?? '',
    fields.totalFees ?? '',
    fields.note ?? '',
  ].join(',');
}

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('ImportWiseService', () => {
  let service: ImportWiseService;
  const prisma = {
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    income: { findMany: jest.fn().mockResolvedValue([]) },
    currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  const importBatches = {
    createBatch: jest.fn().mockResolvedValue('batch-1'),
    finalizeBatch: jest.fn().mockResolvedValue(undefined),
  };
  const anomaly = { checkExpenseBatch: jest.fn().mockResolvedValue(undefined) };
  const merchantRules = { getRulesMap: jest.fn().mockResolvedValue(new Map<string, string>()) };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.income.findMany.mockResolvedValue([]);
    prisma.currencyExchange.findMany.mockResolvedValue([]);
    prisma.category.findFirst.mockResolvedValue(null);
    importBatches.createBatch.mockResolvedValue('batch-1');
    merchantRules.getRulesMap.mockResolvedValue(new Map<string, string>());
    anomaly.checkExpenseBatch.mockResolvedValue(undefined);

    const mod = await Test.createTestingModule({
      providers: [
        ImportWiseService,
        { provide: PrismaService, useValue: prisma },
        { provide: ImportBatchesService, useValue: importBatches },
        { provide: AnomalyService, useValue: anomaly },
        { provide: MerchantRulesService, useValue: merchantRules },
      ],
    }).compile();
    service = mod.get(ImportWiseService);
  });

  describe('parsePreview', () => {
    it('rejects a non-Wise CSV that lacks the TransferWise ID column', async () => {
      const text = 'Foo,Bar\n1,2';
      await expect(
        service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8')),
      ).rejects.toThrow(/Unsupported CSV format/);
    });

    it('strips a UTF-8 BOM before parsing', async () => {
      const text = '﻿' + csv(row({ id: 'tw-1', date: '2026-01-10', amount: '-10.00', currency: 'EUR' }));
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].kind).toBe('expense');
    });

    it('classifies a negative amount as an expense', async () => {
      const text = csv(
        row({ id: 'tw-1', date: '2026-01-10', amount: '-45.50', currency: 'USD', description: 'Uber ride', merchant: 'UBER' }),
      );
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.totalRows).toBe(1);
      expect(res.rows[0]).toMatchObject({
        kind: 'expense',
        amount: 45.5,
        currencyCode: 'USD',
        externalRef: 'wise:tw-1',
        suggestedCategoryName: 'Transport',
      });
    });

    it('classifies a positive amount as income', async () => {
      const text = csv(row({ id: 'tw-2', date: '2026-01-11', amount: '100.00', currency: 'GBP', description: 'Salary' }));
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows[0]).toMatchObject({ kind: 'income', amount: 100, currencyCode: 'GBP', externalRef: 'wise:tw-2' });
    });

    it('folds Total fees into the expense amount', async () => {
      const text = csv(
        row({ id: 'tw-3', date: '2026-01-12', amount: '-50.00', currency: 'EUR', totalFees: '1.50' }),
      );
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows[0].amount).toBe(51.5);
    });

    it('suggests a category from MERCHANT_CATEGORY_HINTS via substring match, case-insensitively', async () => {
      const text = csv(
        row({ id: 'tw-4', date: '2026-01-12', amount: '-9.99', currency: 'USD', merchant: 'spotify premium' }),
      );
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows[0].suggestedCategoryName).toBe('Subscriptions');
    });

    it('leaves suggestedCategoryName undefined when no merchant hint matches', async () => {
      const text = csv(
        row({ id: 'tw-5', date: '2026-01-12', amount: '-9.99', currency: 'USD', merchant: 'Random Local Shop' }),
      );
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows[0].suggestedCategoryName).toBeUndefined();
    });

    it('marks a row as alreadyImported when its externalRef already exists as an expense', async () => {
      prisma.expense.findMany.mockResolvedValue([{ externalRef: 'wise:tw-6' }]);
      const text = csv(row({ id: 'tw-6', date: '2026-01-13', amount: '-20.00', currency: 'PLN' }));
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows[0].alreadyImported).toBe(true);
      expect(res.importable).toBe(0);
      expect(res.skipped).toBe(1);
    });

    it('marks a row as alreadyImported when its externalRef already exists as an income', async () => {
      prisma.income.findMany.mockResolvedValue([{ externalRef: 'wise:tw-7' }]);
      const text = csv(row({ id: 'tw-7', date: '2026-01-13', amount: '20.00', currency: 'PLN' }));
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows[0].alreadyImported).toBe(true);
      expect(res.skipped).toBe(1);
    });

    it('normalizes a slash-separated dd/mm/yyyy date to ISO', async () => {
      const text = csv(row({ id: 'tw-8', date: '05/01/2026', amount: '-1.00', currency: 'USD' }));
      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
      expect(res.rows[0].date).toBe('2026-01-05');
    });

    describe('FX pairing', () => {
      it('pairs two opposite-sign rows sharing Payment Reference + Date into one fx row, not two expense/income rows', async () => {
        const text = csv(
          row({
            id: 'tw-out',
            date: '2026-02-01',
            amount: '-100.00',
            currency: 'EUR',
            paymentRef: 'CONV-1',
            exchangeFrom: 'EUR',
            exchangeTo: 'USD',
            exchangeRate: '1.10',
          }),
          row({
            id: 'tw-in',
            date: '2026-02-01',
            amount: '110.00',
            currency: 'USD',
            paymentRef: 'CONV-1',
            exchangeFrom: 'USD',
            exchangeTo: 'EUR',
          }),
        );

        const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));

        expect(res.totalRows).toBe(1);
        expect(res.rows[0]).toMatchObject({
          kind: 'fx',
          currencyCode: 'EUR',
          fxFromCurrency: 'EUR',
          fxFromAmount: 100,
          fxToCurrency: 'USD',
          fxToAmount: 110,
          externalRef: 'wise:tw-out+tw-in',
        });
        expect(res.rows[0].fxRate).toBeCloseTo(1.1, 5);
      });

      it('falls back to computed rate (toAmount/fromAmount) when Exchange Rate column is blank', async () => {
        const text = csv(
          row({
            id: 'tw-out2',
            date: '2026-02-02',
            amount: '-50.00',
            currency: 'EUR',
            paymentRef: 'CONV-2',
            exchangeFrom: 'EUR',
            exchangeTo: 'GBP',
          }),
          row({
            id: 'tw-in2',
            date: '2026-02-02',
            amount: '43.00',
            currency: 'GBP',
            paymentRef: 'CONV-2',
            exchangeFrom: 'GBP',
            exchangeTo: 'EUR',
          }),
        );

        const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
        expect(res.rows[0].kind).toBe('fx');
        expect(res.rows[0].fxRate).toBeCloseTo(43 / 50, 5);
      });

      it('does NOT pair rows with the same Payment Reference + Date when both have the same sign', async () => {
        const text = csv(
          row({
            id: 'tw-a',
            date: '2026-02-03',
            amount: '-30.00',
            currency: 'EUR',
            paymentRef: 'CONV-3',
            exchangeFrom: 'EUR',
            exchangeTo: 'USD',
          }),
          row({
            id: 'tw-b',
            date: '2026-02-03',
            amount: '-25.00',
            currency: 'USD',
            paymentRef: 'CONV-3',
            exchangeFrom: 'USD',
            exchangeTo: 'EUR',
          }),
        );

        const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
        // No opposite-sign match found -> both remain regular expense rows.
        expect(res.rows.every((r) => r.kind === 'expense')).toBe(true);
        expect(res.totalRows).toBe(2);
      });

      it('does NOT misclassify an unpaired conversion row as fx — it stays a regular expense/income row', async () => {
        // A single conversion leg with no matching opposite-sign row sharing
        // the same Payment Reference + Date must fall through to the regular
        // expense/income path, not be silently dropped or wrongly paired.
        const text = csv(
          row({
            id: 'tw-lonely',
            date: '2026-02-04',
            amount: '-75.00',
            currency: 'EUR',
            paymentRef: 'CONV-4',
            exchangeFrom: 'EUR',
            exchangeTo: 'USD',
            exchangeRate: '1.08',
          }),
        );

        const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
        expect(res.totalRows).toBe(1);
        expect(res.rows[0].kind).toBe('expense');
        expect(res.rows[0].externalRef).toBe('wise:tw-lonely');
      });

      it('does not pair rows whose Exchange From equals Exchange To (not a real conversion candidate)', async () => {
        const text = csv(
          row({
            id: 'tw-same-1',
            date: '2026-02-05',
            amount: '-10.00',
            currency: 'EUR',
            paymentRef: 'CONV-5',
            exchangeFrom: 'EUR',
            exchangeTo: 'EUR',
          }),
          row({
            id: 'tw-same-2',
            date: '2026-02-05',
            amount: '10.00',
            currency: 'EUR',
            paymentRef: 'CONV-5',
            exchangeFrom: 'EUR',
            exchangeTo: 'EUR',
          }),
        );

        const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
        expect(res.rows.every((r) => r.kind !== 'fx')).toBe(true);
        expect(res.totalRows).toBe(2);
      });

      it('pairs only the first matching candidate when three rows share the same reference/date (greedy pairing)', async () => {
        const text = csv(
          row({
            id: 'tw-x',
            date: '2026-02-06',
            amount: '-100.00',
            currency: 'EUR',
            paymentRef: 'CONV-6',
            exchangeFrom: 'EUR',
            exchangeTo: 'USD',
          }),
          row({
            id: 'tw-y',
            date: '2026-02-06',
            amount: '110.00',
            currency: 'USD',
            paymentRef: 'CONV-6',
            exchangeFrom: 'USD',
            exchangeTo: 'EUR',
          }),
          row({
            id: 'tw-z',
            date: '2026-02-06',
            amount: '108.00',
            currency: 'USD',
            paymentRef: 'CONV-6',
            exchangeFrom: 'USD',
            exchangeTo: 'EUR',
          }),
        );

        const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'));
        // tw-x pairs with tw-y (first match); tw-z is left unpaired and
        // falls through as a regular income row.
        expect(res.totalRows).toBe(2);
        const fxRows = res.rows.filter((r) => r.kind === 'fx');
        const incomeRows = res.rows.filter((r) => r.kind === 'income');
        expect(fxRows).toHaveLength(1);
        expect(fxRows[0].externalRef).toBe('wise:tw-x+tw-y');
        expect(incomeRows).toHaveLength(1);
        expect(incomeRows[0].externalRef).toBe('wise:tw-z');
      });
    });
  });

  describe('commit', () => {
    function txStub() {
      return {
        category: { findFirst: jest.fn().mockResolvedValue(null) },
        expense: { create: jest.fn().mockResolvedValue({ id: 'e-1' }) },
        income: { create: jest.fn().mockResolvedValue({ id: 'i-1' }) },
        currencyExchange: { create: jest.fn().mockResolvedValue({ id: 'fx-1' }) },
      };
    }

    it('writes an expense row with source: import and externalRef wise:<TransferWise ID>', async () => {
      const tx = txStub();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'expense',
            date: '2026-01-10',
            amount: 45.5,
            currencyCode: 'USD',
            description: 'Uber ride',
            merchant: 'UBER',
            externalRef: 'wise:tw-1',
            suggestedCategoryName: 'Transport',
            alreadyImported: false,
          },
        ],
      };

      const res = await service.commit('acc-1', 'user-1', dto as any);

      expect(tx.expense.create).toHaveBeenCalledTimes(1);
      const createArgs = tx.expense.create.mock.calls[0][0];
      expect(createArgs.data).toMatchObject({
        accountId: 'acc-1',
        userId: 'user-1',
        amount: 45.5,
        currencyCode: 'USD',
        source: 'import',
        externalRef: 'wise:tw-1',
        importBatchId: 'batch-1',
      });
      expect(res.createdExpenses).toBe(1);
      expect(res.createdIncomes).toBe(0);
      expect(res.createdExchanges).toBe(0);
      expect(res.batchId).toBe('batch-1');
    });

    it('writes an income row', async () => {
      const tx = txStub();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'income',
            date: '2026-01-11',
            amount: 100,
            currencyCode: 'GBP',
            description: 'Salary',
            externalRef: 'wise:tw-2',
            alreadyImported: false,
          },
        ],
      };

      const res = await service.commit('acc-1', 'user-1', dto as any);
      expect(tx.income.create).toHaveBeenCalledTimes(1);
      expect(tx.income.create.mock.calls[0][0].data).toMatchObject({
        accountId: 'acc-1',
        userId: 'user-1',
        amount: 100,
        currencyCode: 'GBP',
        externalRef: 'wise:tw-2',
        importBatchId: 'batch-1',
      });
      expect(res.createdIncomes).toBe(1);
    });

    it('writes a currencyExchange row for an fx-kind row, not an AccountTransfer', async () => {
      const tx = txStub();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'fx',
            date: '2026-02-01',
            amount: 100,
            currencyCode: 'EUR',
            description: 'Currency exchange',
            externalRef: 'wise:tw-out+tw-in',
            alreadyImported: false,
            fxFromCurrency: 'EUR',
            fxFromAmount: 100,
            fxToCurrency: 'USD',
            fxToAmount: 110,
            fxRate: 1.1,
          },
        ],
      };

      const res = await service.commit('acc-1', 'user-1', dto as any);
      expect(tx.currencyExchange.create).toHaveBeenCalledTimes(1);
      expect(tx.currencyExchange.create.mock.calls[0][0].data).toMatchObject({
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        fromAmount: 100,
        toAmount: 110,
        exchangeRate: 1.1,
        externalRef: 'wise:tw-out+tw-in',
      });
      expect(res.createdExchanges).toBe(1);
    });

    it('skips rows already flagged alreadyImported without writing them', async () => {
      const tx = txStub();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'expense',
            date: '2026-01-10',
            amount: 10,
            currencyCode: 'USD',
            description: 'x',
            externalRef: 'wise:tw-dup',
            alreadyImported: true,
          },
        ],
      };

      const res = await service.commit('acc-1', 'user-1', dto as any);
      expect(tx.expense.create).not.toHaveBeenCalled();
      expect(res.createdExpenses).toBe(0);
    });

    it('applies a learned merchant rule category over the static hint', async () => {
      merchantRules.getRulesMap.mockResolvedValue(new Map([['uber', 'cat-learned']]));
      const tx = txStub();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'expense',
            date: '2026-01-10',
            amount: 45.5,
            currencyCode: 'USD',
            description: 'Uber ride',
            merchant: 'Uber',
            externalRef: 'wise:tw-1',
            suggestedCategoryName: 'Transport',
            alreadyImported: false,
          },
        ],
      };

      await service.commit('acc-1', 'user-1', dto as any);
      expect(tx.category.findFirst).not.toHaveBeenCalled();
      expect(tx.expense.create.mock.calls[0][0].data.categoryId).toBe('cat-learned');
    });

    it('dedups a P2002 error on a duplicate externalRef inside the transaction and continues', async () => {
      const tx = txStub();
      tx.expense.create
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
        .mockResolvedValueOnce({ id: 'e-2' });
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'expense',
            date: '2026-01-10',
            amount: 10,
            currencyCode: 'USD',
            description: 'a',
            externalRef: 'wise:tw-dup1',
            alreadyImported: false,
          },
          {
            idx: 1,
            kind: 'expense',
            date: '2026-01-11',
            amount: 20,
            currencyCode: 'USD',
            description: 'b',
            externalRef: 'wise:tw-dup2',
            alreadyImported: false,
          },
        ],
      };

      const res = await service.commit('acc-1', 'user-1', dto as any);
      expect(tx.expense.create).toHaveBeenCalledTimes(2);
      expect(res.createdExpenses).toBe(1);
    });

    it('rethrows a non-P2002 error from the transaction', async () => {
      const tx = txStub();
      tx.expense.create.mockRejectedValueOnce(new Error('boom'));
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'expense',
            date: '2026-01-10',
            amount: 10,
            currencyCode: 'USD',
            description: 'a',
            externalRef: 'wise:tw-1',
            alreadyImported: false,
          },
        ],
      };

      await expect(service.commit('acc-1', 'user-1', dto as any)).rejects.toThrow('boom');
    });

    it('fires anomaly.checkExpenseBatch with the created expense ids after commit', async () => {
      const tx = txStub();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const dto = {
        rows: [
          {
            idx: 0,
            kind: 'expense',
            date: '2026-01-10',
            amount: 10,
            currencyCode: 'USD',
            description: 'a',
            externalRef: 'wise:tw-1',
            alreadyImported: false,
          },
        ],
      };

      await service.commit('acc-1', 'user-1', dto as any);
      expect(anomaly.checkExpenseBatch).toHaveBeenCalledWith('acc-1', 'user-1', ['e-1']);
    });
  });
});
