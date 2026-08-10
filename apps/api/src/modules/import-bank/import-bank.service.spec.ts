import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { ImportBankService } from './import-bank.service';
import { ImportBatchesService } from '../import-batches/import-batches.service';
import { MappingService } from './mapping/mapping.service';
import { TelegramService } from '../telegram/telegram.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { SignatureService } from './ai/signature.service';
import { StatementAiService } from './ai/statement-ai.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CacheService } from '../../common/cache/cache.service';
import { headerFingerprint } from './utils/header-fingerprint';

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
  const mapping = {
    findByFingerprint: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
    rekey: jest.fn().mockResolvedValue(undefined),
  };
  const telegram = {
    sendMessage: jest.fn().mockResolvedValue(true),
    sendDocument: jest.fn().mockResolvedValue(true),
  };
  const importBatches = {
    createBatch: jest.fn().mockResolvedValue('batch-1'),
    finalizeBatch: jest.fn().mockResolvedValue(undefined),
  };
  const anomaly = { checkExpenseBatch: jest.fn().mockResolvedValue(undefined) };
  const merchantRules = { getRulesMap: jest.fn().mockResolvedValue(new Map<string, string>()) };
  // The AI inference path is exercised separately in ai-preview.service.spec.ts.
  // Here `ai.isEnabled()` defaults to false so the `!parser` branch (needs_picker)
  // short-circuits before ever touching `signatures`/`prisma.account`/`cache`,
  // matching this file's pre-existing (non-AI) expectations unchanged.
  const signatures = {
    find: jest.fn().mockResolvedValue(null),
    record: jest.fn(),
    confirm: jest.fn().mockResolvedValue(undefined),
    markCorrected: jest.fn().mockResolvedValue(undefined),
  };
  const ai = {
    isEnabled: jest.fn().mockReturnValue(false),
    inferMapping: jest.fn(),
    extractRows: jest.fn(),
  };
  const subscriptions = { getCurrent: jest.fn(), trackAiUsage: jest.fn() };
  const cache = { get: jest.fn().mockResolvedValue(0), set: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.income.findMany.mockResolvedValue([]);
    prisma.currencyExchange.findMany.mockResolvedValue([]);
    merchantRules.getRulesMap.mockResolvedValue(new Map<string, string>());
    mapping.findByFingerprint.mockResolvedValue(null);
    signatures.find.mockResolvedValue(null);
    ai.isEnabled.mockReturnValue(false);
    cache.get.mockResolvedValue(0);
    const mod = await Test.createTestingModule({
      providers: [
        ImportBankService,
        { provide: PrismaService, useValue: prisma },
        { provide: ImportBatchesService, useValue: importBatches },
        { provide: MappingService, useValue: mapping },
        { provide: TelegramService, useValue: telegram },
        { provide: AnomalyService, useValue: anomaly },
        { provide: MerchantRulesService, useValue: merchantRules },
        { provide: SignatureService, useValue: signatures },
        { provide: StatementAiService, useValue: ai },
        { provide: SubscriptionsService, useValue: subscriptions },
        { provide: CacheService, useValue: cache },
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

  it('ignores rolled-back rows in content dedup, so an undone import can be redone', async () => {
    // Rolling back an import sets { isDeleted: true, externalRef: null } — the
    // null ref is deliberate, so layer 1 stops matching and the file can be
    // imported again. Layer 2 must not resurrect those rows, or the rollback
    // feature is defeated: re-importing the same file comes back with almost
    // everything flagged already-imported and unchecked.
    //
    // The mock models the database honestly: a query that filters
    // isDeleted: false does not see the soft-deleted row.
    prisma.expense.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args?.select?.externalRef
          ? []
          : args?.where?.isDeleted === false
            ? []
            : [{ date: new Date('2026-01-16'), amount: 87.45, currencyCode: 'PLN' }],
      ),
    );

    const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(MBANK_CSV, 'utf-8'), {});
    expect(res.rows).toHaveLength(1);
    expect(res.rows![0].alreadyImported).toBe(false);
    expect(res.importable).toBe(1);
    expect(res.skipped).toBe(0);
  });

  it('requestBank forwards bank name + sample file to the ops Telegram chat', async () => {
    const file = { originalname: 'wyciag.pdf', size: 2048, buffer: Buffer.from('%PDF-1.7') } as any;
    const res = await service.requestBank(
      { name: 'Jan Kowalski', email: 'jan@test.local' },
      { bankName: 'Santander', notes: 'CSV export from web' },
      file,
    );
    expect(res.ok).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    const msg = telegram.sendMessage.mock.calls[0][0] as string;
    expect(msg).toContain('Santander');
    expect(msg).toContain('jan@test.local');
    expect(telegram.sendDocument).toHaveBeenCalledWith(file.buffer, 'wyciag.pdf', expect.stringContaining('Santander'));
  });

  it('requestBank works without a file (message only)', async () => {
    const res = await service.requestBank(
      { name: 'A', email: 'a@test.local' },
      { bankName: 'Nest Bank' },
      undefined,
    );
    expect(res.ok).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegram.sendDocument).not.toHaveBeenCalled();
  });

  // Regression (ABA-313): a duplicate externalRef inside a Postgres $transaction
  // aborts the whole transaction (25P02) and crashed the import. The fix removes
  // duplicates — both already-in-DB and intra-batch repeats — BEFORE the tx.
  it('commit pre-filters duplicate externalRefs (DB + intra-batch) so the constraint never fires', async () => {
    // 'bank:x:exists' is already in the DB; the other findMany calls return none.
    prisma.expense.findMany.mockImplementation((args: any) =>
      Promise.resolve((args.where.externalRef?.in ?? []).includes('bank:x:exists') ? [{ externalRef: 'bank:x:exists' }] : []),
    );
    const txExpenseCreate = jest.fn().mockResolvedValue({ id: 'e-new' });
    const tx = {
      expense: { create: txExpenseCreate },
      income: { create: jest.fn() },
      currencyExchange: { create: jest.fn() },
    };
    (prisma as any).$transaction = jest.fn(async (cb: any) => cb(tx));

    const row = (externalRef: string, amount: number) => ({
      kind: 'expense' as const,
      externalRef,
      amount,
      currencyCode: 'PLN',
      description: 'x',
      date: '2026-01-01',
      alreadyImported: false,
    });
    const rows = [
      row('bank:x:exists', 10), // already in DB -> skip
      row('bank:x:dup', 20),    // first occurrence -> insert
      row('bank:x:dup', 20),    // intra-batch repeat -> skip
      row('bank:x:new', 30),    // unique -> insert
    ];

    const res = await service.commit('acc-1', 'user-1', { rows } as any);

    // Only the two genuinely-new refs get inserted; no throw (the crash regression).
    expect(txExpenseCreate).toHaveBeenCalledTimes(2);
    expect(res.createdExpenses).toBe(2);
    expect(res.skippedDuplicates).toBe(2);
  });

  // Signature dictionary bookkeeping: a successful commit either confirms
  // the fingerprint it used, OR marks it corrected instead. The two are
  // mutually exclusive: a correction must never also count as a
  // confirmation, or correctedCount could never outnumber confirmedCount and
  // self-quarantine (signature.service.ts's isQuarantined) could never fire,
  // no matter how many users corrected the same bad mapping.
  //
  // The decision is now structural (does dto.mapping differ from the stored
  // signature's mapping?), NOT dto.saveMapping — a whole-branch review found
  // that saveMapping was never actually sent by the client, which pinned
  // correctedCount at 0 forever (see the ABA-390 final-fix-report). Both
  // bumps are fire-and-forget, but the mock is a plain jest.fn() with no
  // assertions of its own, so these pin the conditions explicitly rather
  // than relying on the commit not throwing.
  describe('signature bookkeeping', () => {
    const txStub = () => ({
      expense: { create: jest.fn().mockResolvedValue({ id: 'e-1' }) },
      income: { create: jest.fn() },
      currencyExchange: { create: jest.fn() },
    });

    const STORED_MAPPING = { date: 'Date', amount: 'Amount', description: 'Description' };

    it('confirms a plain AI-import commit that carries no mapping at all', async () => {
      (prisma as any).$transaction = jest.fn(async (cb: any) => cb(txStub()));

      await service.commit('acc-1', 'user-1', { rows: [], headerFingerprint: 'fp-1' } as any);

      expect(signatures.confirm).toHaveBeenCalledWith('fp-1');
      expect(signatures.markCorrected).not.toHaveBeenCalled();
    });

    it('confirms when the commit mapping matches the stored signature (tapped through unchanged)', async () => {
      (prisma as any).$transaction = jest.fn(async (cb: any) => cb(txStub()));
      signatures.find.mockResolvedValueOnce({ mapping: STORED_MAPPING });

      await service.commit('acc-1', 'user-1', {
        rows: [],
        headerFingerprint: 'fp-2',
        mapping: { ...STORED_MAPPING }, // structurally identical, different object
      } as any);

      expect(signatures.find).toHaveBeenCalledWith('fp-2');
      expect(signatures.confirm).toHaveBeenCalledWith('fp-2');
      expect(signatures.markCorrected).not.toHaveBeenCalled();
    });

    it('marks corrected when the commit mapping differs from the stored signature — even without saveMapping', async () => {
      (prisma as any).$transaction = jest.fn(async (cb: any) => cb(txStub()));
      signatures.find.mockResolvedValueOnce({ mapping: STORED_MAPPING });

      await service.commit('acc-1', 'user-1', {
        rows: [],
        headerFingerprint: 'fp-3',
        mapping: { date: 'Data', amount: 'Amount', description: 'Description' }, // 'date' column changed
        // No saveMapping here — the bug this guards: the old predicate keyed
        // the correction signal off saveMapping, which the client never sent,
        // so correctedCount was structurally pinned at 0.
      } as any);

      expect(mapping.create).not.toHaveBeenCalled();
      expect(signatures.markCorrected).toHaveBeenCalledWith('fp-3');
      expect(signatures.confirm).not.toHaveBeenCalled();
    });

    it('still creates the saved mapping AND marks corrected when the client also saves its own override', async () => {
      (prisma as any).$transaction = jest.fn(async (cb: any) => cb(txStub()));
      signatures.find.mockResolvedValueOnce({ mapping: STORED_MAPPING });

      await service.commit('acc-1', 'user-1', {
        rows: [],
        headerFingerprint: 'fp-4',
        mapping: { date: 'Data', amount: 'Amount', description: 'Description' },
        saveMapping: { name: 'My bank' },
      } as any);

      expect(mapping.create).toHaveBeenCalledTimes(1);
      expect(signatures.markCorrected).toHaveBeenCalledWith('fp-4');
      expect(signatures.confirm).not.toHaveBeenCalled();
    });

    it('confirms when there is no stored signature at all (a manually-mapped file that was never AI-inferred)', async () => {
      (prisma as any).$transaction = jest.fn(async (cb: any) => cb(txStub()));
      signatures.find.mockResolvedValueOnce(null);

      await service.commit('acc-1', 'user-1', {
        rows: [],
        headerFingerprint: 'fp-5',
        mapping: STORED_MAPPING,
      } as any);

      expect(signatures.confirm).toHaveBeenCalledWith('fp-5');
      expect(signatures.markCorrected).not.toHaveBeenCalled();
    });

    it('calls neither confirm nor markCorrected when headerFingerprint is absent', async () => {
      (prisma as any).$transaction = jest.fn(async (cb: any) => cb(txStub()));

      await service.commit('acc-1', 'user-1', { rows: [] } as any);

      expect(signatures.confirm).not.toHaveBeenCalled();
      expect(signatures.markCorrected).not.toHaveBeenCalled();
    });

    // Integration with the REAL SignatureService (not a jest.fn() double):
    // enough corrections drive its own find() to return null, and THIS
    // service must fall back to confirming gracefully once that happens,
    // rather than throwing or somehow still marking it corrected. A stateful
    // fake Prisma row mirrors signature.service.spec.ts's own quarantine test
    // so the two don't drift.
    it('a real SignatureService quarantines after one correction, and the next commit confirms once find() goes null', async () => {
      const row: { mapping: unknown; confirmedCount: number; correctedCount: number } = {
        mapping: STORED_MAPPING,
        confirmedCount: 0,
        correctedCount: 0,
      };
      const sigPrisma: any = {
        bankStatementSignature: {
          findUnique: jest.fn(async () => ({ ...row })),
          update: jest.fn(async ({ data }: any) => {
            const [field] = Object.keys(data) as ('confirmedCount' | 'correctedCount')[];
            row[field] += data[field].increment;
          }),
        },
      };
      const realSignatures = new SignatureService(sigPrisma);
      const mod = await Test.createTestingModule({
        providers: [
          ImportBankService,
          { provide: PrismaService, useValue: prisma },
          { provide: ImportBatchesService, useValue: importBatches },
          { provide: MappingService, useValue: mapping },
          { provide: TelegramService, useValue: telegram },
          { provide: AnomalyService, useValue: anomaly },
          { provide: MerchantRulesService, useValue: merchantRules },
          { provide: SignatureService, useValue: realSignatures },
          { provide: StatementAiService, useValue: ai },
          { provide: SubscriptionsService, useValue: subscriptions },
          { provide: CacheService, useValue: cache },
        ],
      }).compile();
      const svc = mod.get(ImportBankService);
      (prisma as any).$transaction = jest.fn(async (cb: any) => cb(txStub()));

      const differentMapping = { date: 'Data', amount: 'Amount', description: 'Description' };
      const commitOnce = () =>
        svc.commit('acc-1', 'user-1', { rows: [], headerFingerprint: 'fp-q', mapping: differentMapping } as any);

      // Call 1: the row is virgin (0/0, not quarantined) and the mapping
      // genuinely differs -> a real correction. Starting from confirmedCount
      // 0, a single correction is already enough to quarantine (1 > 0).
      await commitOnce();
      expect(row).toMatchObject({ confirmedCount: 0, correctedCount: 1 });

      // Call 2: find() now sees the quarantined row and returns null, so
      // there is nothing to compare the (still-differing) mapping against ->
      // this commit confirms instead, exactly like a never-inferred fingerprint.
      await commitOnce();
      expect(row).toMatchObject({ confirmedCount: 1, correctedCount: 1 });
    });
  });

  // Legacy fingerprint fallback for saved per-account mappings (ABA fix): a
  // mapping saved before delimiter sniffing existed was fingerprinted on a
  // single merged header cell (peekHeaders hardcoded ';'). A retry against
  // that legacy fingerprint must still find it, and re-key it onto the
  // correctly-sniffed one so the fallback is needed only once.
  describe('legacy fingerprint fallback for saved mappings', () => {
    it('retries the pre-sniffing (";"-only) fingerprint on a miss, uses the row, and re-keys it', async () => {
      const csv = 'Date,Amount,Description\n2026-01-15,-50.00,Sklep';
      // Before delimiter sniffing, peekHeaders(text, ';') on a comma file
      // merges the whole header line into ONE cell.
      const legacyFingerprint = headerFingerprint(['Date,Amount,Description']);
      const savedRow = {
        id: 'mapping-legacy',
        bankId: 'universal',
        mapping: { date: 'Date', amount: 'Amount', description: 'Description' },
      };
      mapping.findByFingerprint.mockImplementation(async (_accountId: string, fp: string) =>
        fp === legacyFingerprint ? savedRow : null,
      );

      const res = await service.parsePreview('acc-1', 'user-1', Buffer.from(csv, 'utf-8'), {});

      expect(res.status).toBe('parsed');
      expect(res.detectedBankId).toBe('universal');
      expect(mapping.findByFingerprint).toHaveBeenCalledTimes(2);
      expect(mapping.findByFingerprint.mock.calls[1][1]).toBe(legacyFingerprint);
      expect(mapping.rekey).toHaveBeenCalledWith('mapping-legacy', expect.any(String));
      // The row must be re-keyed onto the NEW (sniffed) fingerprint, not left
      // pointing at the legacy one.
      expect(mapping.rekey.mock.calls[0][1]).not.toBe(legacyFingerprint);
    });

    it('does not retry when the sniffed delimiter is already ";" (fingerprints would be identical)', async () => {
      const csv = 'Date;Amount;Description\n2026-01-15;-50,00;Sklep';
      mapping.findByFingerprint.mockResolvedValue(null);

      await service.parsePreview('acc-1', 'user-1', Buffer.from(csv, 'utf-8'), {});

      expect(mapping.findByFingerprint).toHaveBeenCalledTimes(1);
      expect(mapping.rekey).not.toHaveBeenCalled();
    });

    it('does not retry when a mapping is already found under the current fingerprint', async () => {
      const csv = 'Date,Amount,Description\n2026-01-15,-50.00,Sklep';
      mapping.findByFingerprint.mockResolvedValue({
        id: 'mapping-current',
        bankId: 'universal',
        mapping: { date: 'Date', amount: 'Amount', description: 'Description' },
      });

      await service.parsePreview('acc-1', 'user-1', Buffer.from(csv, 'utf-8'), {});

      expect(mapping.findByFingerprint).toHaveBeenCalledTimes(1);
      expect(mapping.rekey).not.toHaveBeenCalled();
    });
  });
});
