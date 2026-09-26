import { OfficialInflationService } from '../official-inflation.service';

function make(opts: { rows?: any[]; fetchError?: Error; stored?: any[]; count?: number } = {}) {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma: any = {
    officialInflationRate: {
      upsert,
      count: jest.fn().mockResolvedValue(opts.count ?? 1),
      findFirst: jest.fn().mockResolvedValue(opts.stored?.[0] ?? null),
      findMany: jest.fn().mockResolvedValue(opts.stored ?? []),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const client: any = {
    fetchLatest: opts.fetchError ? jest.fn().mockRejectedValue(opts.fetchError) : jest.fn().mockResolvedValue(opts.rows ?? []),
  };
  return { svc: new OfficialInflationService(prisma, client), prisma, client, upsert };
}

describe('OfficialInflationService', () => {
  it('upserts every fetched row keyed by country+division+month', async () => {
    const rows = [
      { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: 3.5 },
      { country: 'PL', division: 'CP01', month: '2026-08', annualRatePct: -0.8 },
    ];
    const { svc, upsert } = make({ rows });
    await expect(svc.refresh()).resolves.toBe(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { country_division_month: { country: 'PL', division: 'TOTAL', month: '2026-08' } },
      create: { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: 3.5 },
      update: { annualRatePct: 3.5, fetchedAt: expect.any(Date) },
    });
  });

  it('a failed fetch keeps the stored data and does not throw', async () => {
    const { svc, upsert } = make({ fetchError: new Error('Eurostat HTTP 503') });
    await expect(svc.refresh()).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('latestFor returns the newest month for the country as a division map', async () => {
    const stored = [
      { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: '3.50' },
      { country: 'PL', division: 'CP04', month: '2026-08', annualRatePct: '5.10' },
    ];
    const { svc, prisma } = make({ stored });
    await expect(svc.latestFor('PL')).resolves.toEqual({ month: '2026-08', rates: { TOTAL: 3.5, CP04: 5.1 } });
    expect(prisma.officialInflationRate.findFirst).toHaveBeenCalledWith({
      where: { country: 'PL' }, orderBy: { month: 'desc' }, select: { month: true },
    });
  });

  it('latestFor is null when nothing is stored for the country', async () => {
    const { svc } = make({ stored: [] });
    await expect(svc.latestFor('PL')).resolves.toBeNull();
  });
});
