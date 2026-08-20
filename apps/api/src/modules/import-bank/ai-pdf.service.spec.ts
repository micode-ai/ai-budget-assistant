import { ImportBankService } from './import-bank.service';
import { ImportBankAiPreviewService } from './ai-preview.service';
import { ImportBankAiPdfService } from './ai-pdf.service';
import { ImportBankDedupService } from './import-bank-dedup.service';
import { extractPdfText } from './utils/pdf-text';

const SINGLE_PAGE_TEXT =
  'Saldo poczatkowe: 1 000,00 PLN\n15.01.2026 BIEDRONKA -50,00\nSaldo koncowe: 950,00 PLN';

jest.mock('./utils/pdf-text', () => ({
  isPdfBuffer: () => true,
  extractPdfText: jest.fn(),
}));

// `extractPdfText` is now called TWICE per successful run: once (no joiner)
// in `parsePdfPreview` for parser detection + balance reconciliation, and
// once (joiner = '\f') inside `tryAiExtraction` solely to learn page
// boundaries. The default implementation below returns the same
// single-page text for both calls, matching pdf-parse's real behaviour when
// no `\f` boundary marker is present in the text either way — i.e. no
// truncation occurs unless a test explicitly queues a multi-page response.
const mockedExtractPdfText = extractPdfText as jest.Mock;

const ROWS = [{ date: '2026-01-15', amount: -50, currencyCode: 'PLN', description: 'Biedronka' }];

function buildService(
  overrides: { tier?: string; rows?: any[]; usage?: { used: number; limit: number } } = {},
) {
  const prisma: any = {
    account: {
      findUnique: jest.fn().mockResolvedValue({ aiImportConsentAt: new Date(), encryptionTier: 0 }),
      update: jest.fn(),
    },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    income: { findMany: jest.fn().mockResolvedValue([]) },
    currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache: any = { get: jest.fn().mockResolvedValue(0), set: jest.fn() };
  const ai: any = {
    isEnabled: () => true,
    inferMapping: jest.fn(),
    extractRows: jest.fn().mockResolvedValue(overrides.rows ?? ROWS),
  };
  const subscriptions: any = {
    getCurrent: jest.fn().mockResolvedValue({ tier: overrides.tier ?? 'pro' }),
    getUsageStats: jest.fn().mockResolvedValue({
      aiRequestsUsed: overrides.usage?.used ?? 0,
      aiRequestsLimit: overrides.usage?.limit ?? 300,
    }),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  };
  const signatures: any = {
    find: jest.fn().mockResolvedValue(null),
    record: jest.fn(),
    confirm: jest.fn(),
    markCorrected: jest.fn(),
  };
  const dedup = new ImportBankDedupService(prisma);
  const aiPreview = new ImportBankAiPreviewService(prisma, cache, signatures, ai, dedup);
  const aiPdf = new ImportBankAiPdfService(ai, subscriptions, aiPreview, dedup);
  const service = new ImportBankService(
    prisma,
    { create: jest.fn() } as any,
    { findByFingerprint: jest.fn().mockResolvedValue(null), rekey: jest.fn().mockResolvedValue(undefined) } as any,
    { sendMessage: jest.fn() } as any,
    { checkExpenseBatch: jest.fn() } as any,
    { getRulesMap: jest.fn().mockResolvedValue(new Map()) } as any,
    signatures,
    aiPreview,
    aiPdf,
    dedup,
  );
  return { service, ai, subscriptions };
}

describe('AI PDF extraction path', () => {
  beforeEach(() => {
    mockedExtractPdfText.mockReset();
    mockedExtractPdfText.mockImplementation(() => Promise.resolve(SINGLE_PAGE_TEXT));
  });

  it('extracts rows and tracks AI usage for a Pro account', async () => {
    const { service, subscriptions } = buildService();
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(res.status).toBe('parsed');
    expect(res.detectedBankId).toBe('ai');
    expect(res.totalRows).toBe(1);
    expect(res.extractionWarning).toBeUndefined();
    expect(subscriptions.trackAiUsage).toHaveBeenCalledWith('user', 'ocr', 2.0, 'acc');
  });

  it('tracks AI usage exactly once on a successful extraction (never billed twice, never billed on failure)', async () => {
    const { service, subscriptions } = buildService();
    await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(subscriptions.trackAiUsage).toHaveBeenCalledTimes(1);
  });

  it('rejects a free account with a TIER_REQUIRED payload', async () => {
    const { service, ai } = buildService({ tier: 'free' });
    await expect(
      service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {}),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'TIER_REQUIRED', requiredTier: 'pro' },
    });
    expect(ai.extractRows).not.toHaveBeenCalled();
  });

  it('rejects a Pro account whose monthly AI usage is already exhausted, before extractRows is called and without billing', async () => {
    const { service, ai, subscriptions } = buildService({ usage: { used: 300, limit: 300 } });
    await expect(
      service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {}),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'TIER_REQUIRED' },
    });
    expect(ai.extractRows).not.toHaveBeenCalled();
    expect(subscriptions.trackAiUsage).not.toHaveBeenCalled();
  });

  it('allows an extraction that still fits under the remaining quota', async () => {
    // used(298) + cost(2.0) = 300 === limit(300) — right at the edge, still allowed.
    const { service } = buildService({ usage: { used: 298, limit: 300 } });
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(res.status).toBe('parsed');
  });

  it('flags balance_mismatch when rows do not add up', async () => {
    const { service } = buildService({
      rows: [{ date: '2026-01-15', amount: -10, currencyCode: 'PLN', description: 'partial' }],
    });
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(res.status).toBe('parsed');
    expect(res.extractionWarning).toBe('balance_mismatch');
  });

  it('falls back to needs_picker when extraction yields nothing', async () => {
    const { service } = buildService({ rows: [] });
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});
    expect(res.status).toBe('needs_picker');
  });

  it('caps pages at MAX_PDF_PAGES (20) and reports the drop', async () => {
    // First call = the un-joined extraction in parsePdfPreview (parser
    // detection + balance text). Second call = the joined re-extraction in
    // tryAiExtraction, which is what pagination actually reads.
    const manyPages = Array.from({ length: 25 }, (_, i) => `Page ${i + 1} content`);
    mockedExtractPdfText
      .mockImplementationOnce(() => Promise.resolve(SINGLE_PAGE_TEXT))
      .mockImplementationOnce(() => Promise.resolve(manyPages.join('\f')));

    const { service, ai } = buildService();
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});

    expect(res.status).toBe('parsed');
    expect(res.droppedPages).toBe(5);
    expect(res.extractionWarning).toBe('pages_truncated');
    expect(ai.extractRows).toHaveBeenCalledTimes(1);
    expect(ai.extractRows.mock.calls[0][0]).toHaveLength(20);
  });

  it('degrades to needs_picker (never a 5xx) when the paginated re-extraction throws', async () => {
    // First call = the un-joined extraction in parsePdfPreview (parser
    // detection + balance text) — succeeds. Second call = the joined
    // re-extraction inside tryAiExtraction, used solely to learn page
    // boundaries — this one throws, mirroring a pdf-parse failure that
    // parsePdfPreview's OWN (already try/catch-guarded) call to the same
    // function would otherwise turn into a 400, not a 500.
    mockedExtractPdfText
      .mockImplementationOnce(() => Promise.resolve(SINGLE_PAGE_TEXT))
      .mockImplementationOnce(() => Promise.reject(new Error('boom')));

    const { service, ai, subscriptions } = buildService();
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});

    expect(res.status).toBe('needs_picker');
    expect(ai.extractRows).not.toHaveBeenCalled();
    expect(subscriptions.trackAiUsage).not.toHaveBeenCalled();
  });

  it('reports droppedPages and pages_truncated even when the (truncated) extraction yields nothing', async () => {
    const manyPages = Array.from({ length: 22 }, (_, i) => `Page ${i + 1} content`);
    mockedExtractPdfText
      .mockImplementationOnce(() => Promise.resolve(SINGLE_PAGE_TEXT))
      .mockImplementationOnce(() => Promise.resolve(manyPages.join('\f')));

    const { service } = buildService({ rows: [] });
    const res = await service.parsePreview('acc', 'user', Buffer.from('%PDF-1.7'), {});

    expect(res.status).toBe('needs_picker');
    expect(res.droppedPages).toBe(2);
    expect(res.extractionWarning).toBe('pages_truncated');
  });
});
