import { ImportBankService, parseInferenceQuotaEnv } from './import-bank.service';

const CSV = 'Data;Kwota;Opis\n2026-01-15;-50,00;Biedronka\n2026-01-16;1200,00;Wyplata';
const CSV_WITH_CURRENCY =
  'Data;Kwota;Waluta;Opis\n2026-01-15;-50,00;EUR;Biedronka\n2026-01-16;1200,00;EUR;Wyplata';

function buildService(overrides: {
  consentAt?: Date | null;
  encryptionTier?: number;
  signature?: any;
  inferred?: any;
  quotaUsedToday?: number;
  /** null => simulate the user lookup finding nothing; undefined => 'USD'. */
  userCurrency?: string | null;
} = {}) {
  const prisma: any = {
    account: {
      findUnique: jest.fn().mockResolvedValue({
        aiImportConsentAt: overrides.consentAt ?? null,
        encryptionTier: overrides.encryptionTier ?? 0,
      }),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.userCurrency === null ? null : { currencyCode: overrides.userCurrency ?? 'USD' },
      ),
    },
    csvImportMapping: { findFirst: jest.fn().mockResolvedValue(null) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    income: { findMany: jest.fn().mockResolvedValue([]) },
    currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache: any = {
    get: jest.fn().mockResolvedValue(overrides.quotaUsedToday ?? 0),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const mapping: any = {
    findByFingerprint: jest.fn().mockResolvedValue(null),
    rekey: jest.fn().mockResolvedValue(undefined),
  };
  const signatures: any = {
    find: jest.fn().mockResolvedValue(overrides.signature ?? null),
    record: jest.fn(),
    confirm: jest.fn(),
    markCorrected: jest.fn(),
  };
  const ai: any = {
    isEnabled: jest.fn().mockReturnValue(true),
    inferMapping: jest.fn().mockResolvedValue(overrides.inferred ?? null),
    extractRows: jest.fn(),
  };
  const service = new ImportBankService(
    prisma,
    { create: jest.fn() } as any,   // importBatches
    mapping,
    { sendMessage: jest.fn() } as any, // telegram
    { checkExpenseBatch: jest.fn() } as any, // anomaly
    { getRulesMap: jest.fn().mockResolvedValue(new Map()) } as any, // merchantRules
    signatures,
    ai,
    { getCurrent: jest.fn(), trackAiUsage: jest.fn() } as any, // subscriptions
    cache,
  );
  return { service, prisma, signatures, ai, cache };
}

const GOOD_INFERENCE = {
  mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
  amountFormat: 'polish' as const,
  dateFormat: 'auto' as const,
  bankLabel: 'Test Bank',
};

describe('AI inference path', () => {
  it('asks for consent when no parser matches and consent is absent', async () => {
    const { service, ai } = buildService();
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_ai_consent');
    expect(res.headers).toEqual(['Data', 'Kwota', 'Opis']);
    expect(ai.inferMapping).not.toHaveBeenCalled();
  });

  it('infers and parses once consent is on file', async () => {
    const { service, ai, signatures } = buildService({
      consentAt: new Date(),
      inferred: GOOD_INFERENCE,
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(ai.inferMapping).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('parsed');
    expect(res.aiInferred).toBe(true);
    expect(res.aiBankLabel).toBe('Test Bank');
    expect(res.totalRows).toBe(2);
    expect(signatures.record).toHaveBeenCalledTimes(1);
  });

  it('serves a stored signature WITHOUT calling the model', async () => {
    const { service, ai } = buildService({
      consentAt: new Date(),
      signature: {
        mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
        delimiter: ';', amountFormat: 'polish', dateFormat: 'auto', bankLabel: 'Cached Bank',
      },
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(ai.inferMapping).not.toHaveBeenCalled();
    expect(res.status).toBe('parsed');
    expect(res.totalRows).toBe(2);
  });

  it('falls back to needs_picker when inference fails', async () => {
    const { service, signatures } = buildService({ consentAt: new Date(), inferred: null });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_picker');
    expect(signatures.record).not.toHaveBeenCalled();
  });

  it('does not store a signature when the mapping parses zero rows', async () => {
    const { service, signatures } = buildService({
      consentAt: new Date(),
      // 'Opis' is a real header but holds no dates, so every row fails to parse.
      inferred: { ...GOOD_INFERENCE, mapping: { date: 'Opis', amount: 'Kwota', description: 'Opis' } },
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_mapping');
    expect(res.aiMapping).toBeDefined();
    expect(signatures.record).not.toHaveBeenCalled();
  });

  it('refuses a tier-2 E2EE account before calling the model', async () => {
    const { service, ai } = buildService({ consentAt: new Date(), encryptionTier: 2 });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_picker');
    expect(ai.inferMapping).not.toHaveBeenCalled();
  });

  it('degrades to needs_picker when the daily inference quota is spent', async () => {
    const { service, ai } = buildService({ consentAt: new Date(), quotaUsedToday: 20 });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_picker');
    expect(ai.inferMapping).not.toHaveBeenCalled();
  });

  it('does not spend quota when a stored signature answers the request', async () => {
    const { service, cache } = buildService({
      consentAt: new Date(),
      signature: {
        mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
        delimiter: ';', amountFormat: 'polish', dateFormat: 'auto',
      },
    });
    await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('never records consent from the preview path — even when inference is ready to run', async () => {
    // `preview` carries no ViewerBlockGuard, so if it could grant consent
    // implicitly, any viewer previewing a file could record account-wide
    // consent on every other member's behalf. Consent is granted ONLY by
    // the dedicated, guarded grantAiConsent (POST /import/bank/ai-consent).
    const { service, prisma } = buildService({ inferred: GOOD_INFERENCE });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('needs_ai_consent');
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('sends the model more than 3 sample rows when the file has them (up to MAX_SAMPLE_ROWS)', async () => {
    const dataRows = Array.from(
      { length: 6 },
      (_, i) => `2026-01-${10 + i};-${i + 1},00;Row ${i}`,
    );
    const csv = ['Data;Kwota;Opis', ...dataRows].join('\n');
    const { service, ai } = buildService({ consentAt: new Date(), inferred: GOOD_INFERENCE });

    await service.parsePreview('acc', 'user', Buffer.from(csv), {});

    expect(ai.inferMapping).toHaveBeenCalledTimes(1);
    const sampleRowsArg = ai.inferMapping.mock.calls[0][1];
    // detectParser (upstream, unrelated to this fix) still only ever sees 3;
    // the AI call must see every row the file has, up to the 10-row cap.
    expect(sampleRowsArg).toHaveLength(6);
  });

  it('echoes headers/sampleRows/delimiter/amountFormat/dateFormat on a fresh-inference success, so the mapper can re-open on the same context', async () => {
    const { service } = buildService({ consentAt: new Date(), inferred: GOOD_INFERENCE });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('parsed');
    expect(res.aiInferred).toBe(true);
    expect(res.headers).toEqual(['Data', 'Kwota', 'Opis']);
    expect(res.sampleRows).toEqual([
      ['2026-01-15', '-50,00', 'Biedronka'],
      ['2026-01-16', '1200,00', 'Wyplata'],
    ]);
    expect(res.delimiter).toBe(';');
    expect(res.amountFormat).toBe('polish');
    expect(res.dateFormat).toBe('auto');
  });

  it('echoes headers/sampleRows/delimiter/amountFormat/dateFormat on a stored-signature hit, so the mapper can re-open on the same context', async () => {
    const { service } = buildService({
      consentAt: new Date(),
      signature: {
        // 'polish'/'YYYY-MM-DD' are deliberately explicit (not the mapper's
        // own defaults of 'polish'/'auto') so the assertions below can only
        // pass if these values were genuinely threaded through from the
        // stored row, not coincidentally matching a hardcoded default — while
        // still parsing the ISO-dated, comma-decimal CSV fixture correctly
        // (an incompatible pairing would zero out the rows and fall through
        // to the "stale signature" branch instead of this one).
        mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
        delimiter: ';', amountFormat: 'polish', dateFormat: 'YYYY-MM-DD', bankLabel: 'Cached Bank',
      },
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('parsed');
    expect(res.totalRows).toBe(2);
    expect(res.headers).toEqual(['Data', 'Kwota', 'Opis']);
    expect(res.sampleRows?.length).toBeGreaterThan(0);
    expect(res.delimiter).toBe(';');
    expect(res.amountFormat).toBe('polish');
    expect(res.dateFormat).toBe('YYYY-MM-DD');
  });

  it('does not add headers/sampleRows/delimiter/amountFormat/dateFormat to a non-AI parsed response', async () => {
    // detectParser recognises this as mBank without any AI involvement.
    const mbankCsv = [
      '#Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji',
      '2026-01-16;2026-01-16;PLATNOSC KARTA;Zakupy;BIEDRONKA;PL999;-87,45 PLN;3113,05 PLN',
    ].join('\n');
    const { service } = buildService();
    const res = await service.parsePreview('acc', 'user', Buffer.from(mbankCsv), {});
    expect(res.status).toBe('parsed');
    expect(res.aiInferred).toBeUndefined();
    expect(res.headers).toBeUndefined();
    expect(res.sampleRows).toBeUndefined();
    expect(res.delimiter).toBeUndefined();
    expect(res.amountFormat).toBeUndefined();
    expect(res.dateFormat).toBeUndefined();
  });

  it('falls through to inference when a stored signature no longer parses this file', async () => {
    const { service, ai, signatures } = buildService({
      consentAt: new Date(),
      signature: {
        // 'NoSuchColumn' does not exist in the CSV header, so every row's
        // date lookup misses and the mapping parses zero rows.
        mapping: { date: 'NoSuchColumn', amount: 'Kwota', description: 'Opis' },
        delimiter: ';', amountFormat: 'polish', dateFormat: 'auto', bankLabel: 'Stale Bank',
      },
      inferred: GOOD_INFERENCE,
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(ai.inferMapping).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('parsed');
    expect(res.aiInferred).toBe(true);
    expect(res.aiBankLabel).toBe('Test Bank'); // from GOOD_INFERENCE, not the stale signature
    expect(res.totalRows).toBe(2);
    expect(signatures.record).toHaveBeenCalledTimes(1);
  });
});

describe('grantAiConsent (the single writer of consent)', () => {
  it('records consent for a normal account', async () => {
    const { service, prisma } = buildService();
    await expect(service.grantAiConsent('acc')).resolves.toEqual({ ok: true });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc' },
      data: { aiImportConsentAt: expect.any(Date) },
    });
  });

  it('refuses a tier-2 E2EE account without writing anything', async () => {
    const { service, prisma } = buildService({ encryptionTier: 2 });
    await expect(service.grantAiConsent('acc')).rejects.toMatchObject({
      response: { code: 'E2EE_UNSUPPORTED' },
    });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});

describe('currency assumption', () => {
  it('stamps the resolved user currency and sets currencyAssumed when the mapping has no currency column', async () => {
    const { service } = buildService({
      consentAt: new Date(),
      inferred: GOOD_INFERENCE, // mapping has no `currency` key
      userCurrency: 'EUR',
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.status).toBe('parsed');
    expect(res.currencyAssumed).toBe('EUR');
    expect(res.rows!.every((r) => r.currencyCode === 'EUR')).toBe(true);
  });

  it('leaves currencyAssumed unset and uses the file currency when the mapping has a currency column', async () => {
    const { service } = buildService({
      consentAt: new Date(),
      inferred: {
        ...GOOD_INFERENCE,
        mapping: { date: 'Data', amount: 'Kwota', description: 'Opis', currency: 'Waluta' },
      },
      userCurrency: 'EUR', // must NOT win over the file's own currency column
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV_WITH_CURRENCY), {});
    expect(res.status).toBe('parsed');
    expect(res.currencyAssumed).toBeUndefined();
    expect(res.rows!.every((r) => r.currencyCode === 'EUR')).toBe(true); // from the file's own 'Waluta' column
  });

  it('falls back to PLN when the user lookup finds nothing', async () => {
    const { service } = buildService({
      consentAt: new Date(),
      inferred: GOOD_INFERENCE,
      userCurrency: null,
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from(CSV), {});
    expect(res.currencyAssumed).toBe('PLN');
  });
});

describe('parseInferenceQuotaEnv (daily inference ceiling parsing)', () => {
  it('falls back to 20 when the env var is unset', () => {
    expect(parseInferenceQuotaEnv(undefined)).toBe(20);
  });

  it('falls back to 20 when the env var is non-numeric, instead of silently disabling the ceiling', () => {
    // Number('not-a-number') is NaN, and `used >= NaN` is always false — the
    // guard this test protects makes sure that never reaches the comparison.
    expect(parseInferenceQuotaEnv('not-a-number')).toBe(20);
  });

  it('honors a valid numeric override', () => {
    expect(parseInferenceQuotaEnv('5')).toBe(5);
  });
});

describe('externalRef invariant', () => {
  it('produces byte-identical externalRefs for AI inference and manual mapping', async () => {
    const manualMapping = { date: 'Data', amount: 'Kwota', description: 'Opis' };

    const manual = await buildService().service.parsePreview('acc', 'user', Buffer.from(CSV), {
      inlineMapping: manualMapping,
      amountFormat: 'polish',
      dateFormat: 'auto',
    });

    const inferred = await buildService({
      consentAt: new Date(),
      inferred: GOOD_INFERENCE,
    }).service.parsePreview('acc', 'user', Buffer.from(CSV), {});

    // Guard against the assertion below passing on two empty arrays: the
    // fixture has two rows, so both runs must actually have produced them.
    expect(manual.rows).toHaveLength(2);
    expect(inferred.rows).toHaveLength(2);

    expect(inferred.rows!.map((r) => r.externalRef)).toEqual(manual.rows!.map((r) => r.externalRef));
    expect(inferred.detectedBankId).toBe('universal');
  });
});
