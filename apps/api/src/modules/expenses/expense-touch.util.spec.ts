import { touchExpenses } from './expense-touch.util';

describe('touchExpenses', () => {
  const make = () => ({ expense: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } });

  it('bumps updatedAt on the matching expense, always scoped to the account', async () => {
    const client = make();
    await touchExpenses(client as any, 'acc-1', { id: 'e-1' });
    expect(client.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'e-1', accountId: 'acc-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('cannot be widened to another account by the where clause', async () => {
    const client = make();
    await touchExpenses(client as any, 'acc-1', { id: 'e-1', accountId: 'acc-2' } as any);
    expect(client.expense.updateMany.mock.calls[0][0].where.accountId).toBe('acc-1');
  });

  it('is a no-op for an undefined filter value rather than bumping the whole account', async () => {
    const client = make();
    await touchExpenses(client as any, 'acc-1', { id: undefined });
    expect(client.expense.updateMany).not.toHaveBeenCalled();
  });

  it('never touches syncVersion', async () => {
    const client = make();
    await touchExpenses(client as any, 'acc-1', { id: 'e-1' });
    expect(Object.keys(client.expense.updateMany.mock.calls[0][0].data)).toEqual(['updatedAt']);
  });
});
