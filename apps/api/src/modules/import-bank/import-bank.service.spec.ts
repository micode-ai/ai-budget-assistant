import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { ImportBankService } from './import-bank.service';
import { MappingService } from './mapping/mapping.service';

const MBANK_CSV = [
  '#Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji',
  '2026-01-16;2026-01-16;PLATNOSC KARTA;Zakupy;BIEDRONKA;PL999;-87,45 PLN;3113,05 PLN',
].join('\n');

describe('ImportBankService.parsePreview', () => {
  let service: ImportBankService;
  const prisma = {
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    income: { findMany: jest.fn().mockResolvedValue([]) },
    currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
    csvImportMapping: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const mapping = { findByFingerprint: jest.fn().mockResolvedValue(null) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ImportBankService,
        { provide: PrismaService, useValue: prisma },
        { provide: MappingService, useValue: mapping },
      ],
    }).compile();
    service = mod.get(ImportBankService);
  });

  it('detects mBank and returns parsed status with ImportRow[]', async () => {
    const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(MBANK_CSV, 'utf-8'), {});
    expect(res.status).toBe('parsed');
    expect(res.detectedBankId).toBe('mbank');
    expect(res.rows).toHaveLength(1);
    expect(res.rows![0].externalRef).toMatch(/^bank:mbank:2026-01-16:-8745:/);
  });

  it('returns needs_picker for unrecognized CSV', async () => {
    const text = 'Col1;Col2\nfoo;bar';
    const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(text, 'utf-8'), {});
    expect(res.status).toBe('needs_picker');
    expect(res.headers).toContain('Col1');
    expect(res.supportedBanks?.map((b) => b.id)).toContain('mbank');
  });

  it('flags a row as already-imported when it matches an existing manual transaction', async () => {
    // Layer 1 (externalRef select) finds nothing; Layer 2 (content select)
    // returns a manual expense with the same date/amount/currency.
    prisma.expense.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args?.select?.externalRef
          ? []
          : [{ date: new Date('2026-01-16'), amount: 87.45, currencyCode: 'PLN' }],
      ),
    );

    const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(MBANK_CSV, 'utf-8'), {});
    expect(res.rows).toHaveLength(1);
    expect(res.rows![0].alreadyImported).toBe(true);
    expect(res.importable).toBe(0);
    expect(res.skipped).toBe(1);
  });

  it('greedily matches one-to-one: one existing absorbs only one of two identical-amount rows', async () => {
    const twoRows = [
      '#Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji',
      '2026-01-16;2026-01-16;PLATNOSC KARTA;Sklep A;X;PL999;-87,45 PLN;1,00 PLN',
      '2026-01-16;2026-01-16;PLATNOSC KARTA;Sklep B;Y;PL999;-87,45 PLN;1,00 PLN',
    ].join('\n');

    prisma.expense.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args?.select?.externalRef
          ? []
          : [{ date: new Date('2026-01-16'), amount: 87.45, currencyCode: 'PLN' }],
      ),
    );

    const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(twoRows, 'utf-8'), {});
    expect(res.rows).toHaveLength(2);
    expect(res.rows!.filter((r) => r.alreadyImported)).toHaveLength(1);
    expect(res.importable).toBe(1);
    expect(res.skipped).toBe(1);
  });
});
