import { Logger } from '@nestjs/common';
import { processProjectChange } from './project.handler';
import { SyncHandlerContext } from '../sync-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  project: { upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};

function makeCtx(): SyncHandlerContext {
  return {
    prisma: mockPrisma,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expensesService: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incomesService: {} as any,
    logger: new Logger('test'),
  };
}

describe('processProjectChange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts a project on create keyed by clientId', async () => {
    mockPrisma.project.upsert.mockResolvedValue({ id: 'srv-proj-1', syncVersion: 0 });

    const result = await processProjectChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'project',
      entityId: 'client-proj-1',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { name: 'Vacation', localId: 'client-proj-1' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'client-proj-1', status: 'success', serverId: 'srv-proj-1', serverVersion: 0 });
    expect(mockPrisma.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId_clientId: { accountId: 'acc-1', clientId: 'client-proj-1' } } }),
    );
  });

  it('errors updating a project that does not belong to this account (IDOR guard)', async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null);

    const result = await processProjectChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'project',
      entityId: 'other-accounts-project',
      operation: 'update',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { name: 'Hijack attempt' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'other-accounts-project', status: 'error', error: 'Project not found' });
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('soft-deletes a project scoped to the account', async () => {
    mockPrisma.project.updateMany.mockResolvedValue({ count: 1 });

    const result = await processProjectChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'project',
      entityId: 'srv-proj-1',
      operation: 'delete',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { name: 'Vacation' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'srv-proj-1', status: 'success' });
    expect(mockPrisma.project.updateMany).toHaveBeenCalledWith({
      where: { id: 'srv-proj-1', accountId: 'acc-1' },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
  });
});
