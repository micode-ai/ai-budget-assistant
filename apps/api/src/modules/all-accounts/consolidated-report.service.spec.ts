import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConsolidatedReportService } from './consolidated-report.service';
import { aggregateLedger } from './all-accounts.util';
import type { LedgerRow } from './all-accounts.types';

const cat = (name: string) => ({ key: `expense:${name}`, name, systemKey: null });
const mk = (p: Partial<LedgerRow>): LedgerRow => ({
  accountId: 'a1',
  kind: 'expense',
  date: '2026-11-03',
  description: 'desc',
  amount: 10,
  currencyCode: 'PLN',
  amountBase: 10,
  category: cat('Food'),
  note: null,
  ...p,
});

function setup(rows: LedgerRow[], opts: { tier?: string } = {}) {
  const accounts = [
    { id: 'a1', name: 'Main', encrypted: false },
    { id: 'a2', name: 'Secret', encrypted: false },
    { id: 'a3', name: 'Vault', encrypted: true },
  ];
  const all: any = {
    loadLedger: jest.fn().mockResolvedValue({ accounts, includedIds: ['a1', 'a2'], rows }),
  };
  const groups: any = { resolveAccountIds: jest.fn().mockResolvedValue(['a1']) };
  const csv = { generate: jest.fn().mockReturnValue(Buffer.from('x')) };
  const pdf = { generate: jest.fn().mockResolvedValue(Buffer.from('p')) };
  const xlsx = { generate: jest.fn().mockResolvedValue(Buffer.from('e')) };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ language: 'en' }) },
    account: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'a1', encryptionTier: 0 },
        { id: 'a2', encryptionTier: 1 },
      ]),
    },
    generatedReport: { create: jest.fn().mockResolvedValue({ id: 'rep1' }) },
  };
  const subs: any = { getOrCreateSubscription: jest.fn().mockResolvedValue({ tier: opts.tier ?? 'free' }) };
  const svc = new ConsolidatedReportService(prisma, all, groups, subs, csv as any, pdf as any, xlsx as any);
  return { svc, all, groups, csv, pdf, xlsx, prisma, subs };
}
const body = { format: 'csv' as const, startDate: '2026-11-01', endDate: '2026-11-30' };
const user = { id: 'u1', currencyCode: 'PLN' };

describe('ConsolidatedReportService', () => {
  const rows = [
    mk({}),
    mk({ accountId: 'a2', amount: 5, amountBase: 5, description: 'secret thing' }),
    mk({ note: 'planned', amount: 99, amountBase: 99 }),
    mk({ kind: 'income', amount: 50, amountBase: 50, category: cat('Pay') }),
  ];

  it('lists noted rows with the note but keeps them out of the totals; subtotals and totals equal aggregateLedger', async () => {
    const { svc, csv } = setup(rows);
    await svc.generate(user, body);
    const [csvRows, extra] = csv.generate.mock.calls[0];
    expect(csvRows.find((r: any) => r.note === 'Planned')).toBeDefined();
    expect(csvRows.every((r: any) => 'account' in r && 'note' in r)).toBe(true);
    const agg = aggregateLedger(rows, ['a1', 'a2'], '2026-11-01', '2026-11-30');
    expect(extra.totals).toEqual(agg.totals);
    expect(extra.totals.spent).toBe(15);
    expect(extra.accountSubtotals).toEqual([
      { name: 'Main', ...agg.perAccount.a1 },
      { name: 'Secret', ...agg.perAccount.a2 },
    ]);
    expect(extra.excludedAccounts).toEqual(['Vault']);
  });

  it('localizes the note and the all-accounts label by the request locale, falling back to en', async () => {
    const pl = setup([mk({ note: 'splitReceivable' }), mk({ note: 'internalTransfer', kind: 'income' })]);
    await pl.svc.generate(user, { ...body, format: 'pdf', locale: 'pl' });
    const arg = pl.pdf.generate.mock.calls[0][0];
    expect(arg.accountName).toBe('Wszystkie konta');
    expect(arg.transactions.map((t: any) => t.note).sort()).toEqual(['Podzielone z innymi', 'Przelew między własnymi kontami']);
    const xx = setup([mk({ note: 'planned' })]);
    await xx.svc.generate(user, { ...body, locale: 'xx' });
    expect(xx.csv.generate.mock.calls[0][0][0].note).toBe('Planned');
  });

  it('locale pt yields European Portuguese note labels', async () => {
    const t = setup([mk({ note: 'planned' }), mk({ note: 'splitReceivable' }), mk({ kind: 'income', note: 'internalTransfer' })]);
    await t.svc.generate(user, { ...body, locale: 'pt' });
    expect(t.csv.generate.mock.calls[0][0].map((r: any) => r.note).sort()).toEqual([
      'Dividido com outros',
      'Planeado',
      'Transferência entre contas próprias',
    ]);
  });

  it('prints an empty description for tier-1 account rows only', async () => {
    const { svc, csv } = setup(rows);
    await svc.generate(user, body);
    const csvRows = csv.generate.mock.calls[0][0];
    expect(csvRows.find((r: any) => r.account === 'Secret').description).toBe('');
    expect(csvRows.find((r: any) => r.account === 'Main' && r.type === 'expense' && !r.note).description).toBe('desc');
  });

  it('prints "Other" for an empty merged category', async () => {
    const { svc, csv } = setup([mk({ category: { key: 'expense:__other', name: '', systemKey: null } })]);
    await svc.generate(user, body);
    expect(csv.generate.mock.calls[0][0][0].category).toBe('Other');
  });

  it('stores accountId null with the included ids and returns the report response', async () => {
    const { svc, prisma } = setup(rows);
    const res = await svc.generate(user, body);
    const data = prisma.generatedReport.create.mock.calls[0][0].data;
    expect(data.accountId).toBeNull();
    expect(data.accountIds).toEqual(['a1', 'a2']);
    expect(data.userId).toBe('u1');
    expect(data.filters).toEqual(body);
    expect(res).toMatchObject({ reportId: 'rep1', status: 'completed', downloadUrl: '/reports/rep1/download' });
  });

  it('rejects a group report for a free user with the SubscriptionTierGuard body', async () => {
    const { svc } = setup(rows, { tier: 'free' });
    await expect(svc.generate(user, { ...body, groupId: 'g1' })).rejects.toMatchObject({
      response: {
        message: 'This feature requires a pro subscription or higher',
        requiredTier: 'pro',
        currentTier: 'free',
        code: 'TIER_REQUIRED',
      },
    });
    await expect(svc.generate(user, { ...body, groupId: 'g1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a pro user scopes the ledger to the group accounts', async () => {
    const { svc, all, groups } = setup(rows, { tier: 'pro' });
    await svc.generate(user, { ...body, groupId: 'g1' });
    expect(groups.resolveAccountIds).toHaveBeenCalledWith('u1', 'g1');
    expect(all.loadLedger.mock.calls[0][5]).toEqual({ exclude: [], onlyAccountIds: ['a1'] });
  });

  it('rejects when no account is included', async () => {
    const { svc, all } = setup(rows);
    all.loadLedger.mockResolvedValue({ accounts: [], includedIds: [], rows: [] });
    await expect(svc.generate(user, body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
