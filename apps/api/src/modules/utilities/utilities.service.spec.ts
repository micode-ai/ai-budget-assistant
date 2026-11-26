import { NotFoundException } from '@nestjs/common';
import { UtilitiesService } from './utilities.service';

describe('UtilitiesService', () => {
  const make = (expense: unknown) => {
    const prisma = {
      expense: { findFirst: jest.fn().mockResolvedValue(expense) },
      utilityReading: { upsert: jest.fn().mockResolvedValue({}), findFirst: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
    };
    return { prisma, svc: new UtilitiesService(prisma as never, {} as never) };
  };

  it('derives the unit price and writes the resolved expense PK', async () => {
    const { prisma, svc } = make({ id: 'e-pk', amount: 120 });
    await svc.upsert('a1', 'client-id', { kind: 'electricity', consumption: 300, unit: 'kwh', propertyLabel: ' Flat ' });
    const arg = prisma.utilityReading.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ expenseId: 'e-pk' });
    expect(arg.create).toMatchObject({ accountId: 'a1', expenseId: 'e-pk', unitPrice: 0.4, propertyLabel: 'Flat' });
    expect(arg.update.unitPrice).toBe(0.4);
  });

  it('rejects an expense outside the account', async () => {
    const { svc } = make(null);
    await expect(svc.upsert('a1', 'x', { kind: 'gas', consumption: 1, unit: 'm3' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
