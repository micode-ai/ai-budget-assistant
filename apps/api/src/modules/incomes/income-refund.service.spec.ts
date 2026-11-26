import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IncomeRefundService, scoreRefundCandidate } from './income-refund.service';

const income = (o: any = {}) => ({ id: 'i1', amount: 12, currencyCode: 'PLN', date: new Date('2026-11-10'), isDebt: false, isDebtRepayment: false, isSplitReceivable: false, encryptedPayload: null, refundOfExpenseId: null, ...o });
const expense = (o: any = {}) => ({ id: 'e1', amount: 40, currencyCode: 'PLN', isPlanned: false, isSplitReceivable: false, encryptedPayload: null, ...o });

function make(inc: any, exp: any, refunded = 0) {
  const prisma: any = {
    income: {
      findFirst: jest.fn().mockResolvedValue(inc),
      groupBy: jest.fn().mockResolvedValue(refunded ? [{ refundOfExpenseId: 'e1', _sum: { amount: refunded } }] : []),
      update: jest.fn().mockImplementation(async (a: any) => ({ ...inc, ...a.data })),
    },
    expense: { findFirst: jest.fn().mockResolvedValue(exp), findMany: jest.fn().mockResolvedValue([]) },
  };
  return { svc: new IncomeRefundService(prisma), prisma };
}

describe('IncomeRefundService', () => {
  it('links a partial refund', async () => {
    const { svc, prisma } = make(income(), expense(), 20);
    await svc.link('a', 'i1', 'e1');
    expect(prisma.income.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { refundOfExpenseId: 'e1' } });
  });
  it('rejects exceeding the original amount', async () => {
    const { svc } = make(income(), expense(), 35);
    await expect(svc.link('a', 'i1', 'e1')).rejects.toThrow(BadRequestException);
  });
  it('rejects currency mismatch, encrypted and debt rows', async () => {
    await expect(make(income(), expense({ currencyCode: 'EUR' })).svc.link('a', 'i1', 'e1')).rejects.toThrow(BadRequestException);
    await expect(make(income({ encryptedPayload: 'x' }), expense()).svc.link('a', 'i1', 'e1')).rejects.toThrow(BadRequestException);
    await expect(make(income({ isDebt: true }), expense()).svc.link('a', 'i1', 'e1')).rejects.toThrow(BadRequestException);
  });
  it('404s on missing income or expense', async () => {
    await expect(make(null, expense()).svc.link('a', 'i1', 'e1')).rejects.toThrow(NotFoundException);
    await expect(make(income(), null).svc.link('a', 'i1', 'e1')).rejects.toThrow(NotFoundException);
  });
  it('unlink clears and is idempotent', async () => {
    const a = make(income({ refundOfExpenseId: 'e1' }), null);
    await a.svc.unlink('a', 'i1');
    expect(a.prisma.income.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { refundOfExpenseId: null } });
    const b = make(income(), null);
    await b.svc.unlink('a', 'i1');
    expect(b.prisma.income.update).not.toHaveBeenCalled();
  });
  it('ranks merchant match above amount only', () => {
    const m = scoreRefundCandidate({ amount: 12, description: 'Zara refund' }, { amount: 40, merchant: 'Zara' });
    const n = scoreRefundCandidate({ amount: 12, description: 'Zara refund' }, { amount: 12, merchant: 'Lidl' });
    expect(m).toBeGreaterThan(n);
  });
});
