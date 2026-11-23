import { ReportsService } from './reports.service';

describe('ReportsService report scope includes consolidated reports', () => {
  const prisma: any = { generatedReport: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), delete: jest.fn() } };
  const svc = new ReportsService(prisma, {} as any, {} as any, {} as any, {} as any);

  it('listReports matches this account OR consolidated (null) reports, always scoped to the user', async () => {
    await svc.listReports('acc1', 'user1');
    expect(prisma.generatedReport.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user1',
      OR: [{ accountId: 'acc1' }, { accountId: null }],
    });
  });

  it('download and delete use the same widened scope', async () => {
    prisma.generatedReport.findFirst.mockResolvedValue(null);
    await expect(svc.downloadReport('acc1', 'user1', 'r1', {} as any)).rejects.toThrow();
    await expect(svc.deleteReport('acc1', 'user1', 'r1')).rejects.toThrow();
    for (const c of prisma.generatedReport.findFirst.mock.calls) {
      expect(c[0].where).toEqual({ id: 'r1', userId: 'user1', OR: [{ accountId: 'acc1' }, { accountId: null }] });
    }
  });
});
