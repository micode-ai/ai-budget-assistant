import { buildCanonicalNameFallback, OcrService, ParsedReceipt } from './ocr.service';

describe('buildCanonicalNameFallback', () => {
  it('preserves size discriminators: fat% and volume (original token order)', () => {
    expect(buildCanonicalNameFallback('MLEKO 3,2% ŁACIATE 1L')).toBe('MLEKO 3,2% ŁACIATE 1L');
  });

  it('preserves weight and skips purely numeric prefix', () => {
    expect(buildCanonicalNameFallback('123 CHLEB 500G')).toBe('CHLEB 500G');
  });

  it('skips tokens shorter than 3 chars (unless size token)', () => {
    expect(buildCanonicalNameFallback('AB MLEKO')).toBe('MLEKO');
  });

  it('returns null when no suitable token exists', () => {
    expect(buildCanonicalNameFallback('12 AB')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(buildCanonicalNameFallback('')).toBeNull();
  });

  it('strips pack quantity (6SZT) but keeps per-unit volume (1L)', () => {
    expect(buildCanonicalNameFallback('MLEKO ŁACIATE 1L 6SZT')).toBe('MLEKO ŁACIATE 1L');
  });

  it('extracts per-unit size from multiplier+size token (4X130G → 130G)', () => {
    expect(buildCanonicalNameFallback('SERK DANIO TRUSKAWKOWY 4X130G')).toBe('SERK DANIO TRUSKAWKOWY 130G');
  });

  it('extracts per-unit size from × multiplier (6x0,5L)', () => {
    expect(buildCanonicalNameFallback('PIWO TYSKIE 6x0,5L')).toBe('PIWO TYSKIE 0,5L');
  });

  it('keeps alcohol and volume for beer/wine', () => {
    expect(buildCanonicalNameFallback('PIWO TYSKIE 0,5L 4,7%')).toBe('PIWO TYSKIE 0,5L 4,7%');
  });

  it('caps at 3 text tokens but includes all size tokens', () => {
    expect(buildCanonicalNameFallback('JOGURT ACTIVIA TRUSKAWKOWY BRZOSKWINIA 150G')).toBe('JOGURT ACTIVIA TRUSKAWKOWY 150G');
  });

  it('handles 1L (2-char) size token that was previously filtered by length check', () => {
    expect(buildCanonicalNameFallback('SOK JABŁKOWY 1L')).toBe('SOK JABŁKOWY 1L');
  });

  it('filters bare multiplier without unit (4X alone)', () => {
    expect(buildCanonicalNameFallback('BATONIK SNICKERS 4X')).toBe('BATONIK SNICKERS');
  });
});

const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

// Base fixture for a parsed receipt returned by the mocked OpenAI call.
// Individual tests override only the fields they care about.
const BASE_PARSED_RECEIPT: ParsedReceipt & { suggestedCategory?: string } = {
  merchantName: 'Test Store',
  merchantAddress: null,
  merchantStreet: null,
  merchantCity: null,
  merchantPostalCode: null,
  merchantCountry: null,
  date: '2026-01-15',
  time: '12:00',
  items: [{ description: 'Item', totalPrice: 10 }],
  subtotal: 10,
  discount: null,
  tax: 0,
  total: 10,
  currency: 'USD',
  paymentMethod: 'card',
  confidence: 0.9,
  rawText: 'raw receipt text',
  suggestedCategory: undefined,
};

/**
 * OcrService now owns only prompt construction, the raw OpenAI call, and
 * validateAndNormalizeReceipt/normalizeDate — the price check, category
 * split, and geocoding logic live in ReceiptFinalizerService (see
 * receipt-finalizer.service.spec.ts), and PDF text/page extraction lives in
 * ReceiptPdfService. These tests exercise OcrService in isolation, with both
 * collaborators mocked, to pin the wiring: what gets sent to OpenAI, and
 * that the validated/normalized parse result is handed to the finalizer.
 */
describe('OcrService', () => {
  let service: OcrService;
  let prisma: any;
  let configService: any;
  let receiptFinalizerMock: { finalizeReceipt: jest.Mock };
  let receiptPdfMock: { extractText: jest.Mock; renderToPngs: jest.Mock };

  beforeEach(() => {
    mockChatCreate.mockReset();
    prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' }) },
    };
    configService = { get: jest.fn().mockReturnValue('sk-test') };
    receiptFinalizerMock = {
      finalizeReceipt: jest.fn().mockResolvedValue({ receiptItems: [], categorySplits: [], priceFindings: [] }),
    };
    receiptPdfMock = {
      extractText: jest.fn(),
      renderToPngs: jest.fn(),
    };
    service = new OcrService(configService, prisma, receiptFinalizerMock as any, receiptPdfMock as any);
    // Silence the real Nest Logger's console output (same convention as
    // anomaly.service.spec.ts) — these tests log [Vision]/[PDF] lines that
    // are not what any assertion here cares about.
    (service as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  });

  function mockOpenAiResponse(overrides: Partial<ParsedReceipt> = {}) {
    const parsed = { ...BASE_PARSED_RECEIPT, ...overrides };
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(parsed) }, finish_reason: 'stop' }],
    });
    return parsed;
  }

  describe('parseReceipt', () => {
    it('sends a vision request and hands the normalized parse to the finalizer', async () => {
      mockOpenAiResponse({ merchantName: 'Biedronka' });

      const result = await service.parseReceipt('base64imagedata', 'user-1', 'acc-1');

      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4.1',
          messages: [
            expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'image_url' }),
              ]),
            }),
          ],
        }),
      );
      expect(receiptFinalizerMock.finalizeReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ merchantName: 'Biedronka' }),
        [],
        'acc-1',
        'user-1',
      );
      expect(result).toEqual({ receiptItems: [], categorySplits: [], priceFindings: [] });
    });

    it('throws when OpenAI returns no content', async () => {
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: null }, finish_reason: 'stop' }] });
      await expect(service.parseReceipt('base64imagedata', 'user-1', 'acc-1')).rejects.toThrow('No response from AI');
      expect(receiptFinalizerMock.finalizeReceipt).not.toHaveBeenCalled();
    });
  });

  describe('parseReceiptPdf', () => {
    it('uses the cheaper text-only path when the PDF has meaningful extracted text', async () => {
      receiptPdfMock.extractText.mockResolvedValue({
        text: 'A'.repeat(200),
        meaningfulTextLength: 200,
        hasMeaningfulText: true,
      });
      mockOpenAiResponse();

      await service.parseReceiptPdf('cGRmYmFzZTY0', 'user-1', 'acc-1');

      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [{ role: 'user', content: expect.any(String) }] }),
      );
      expect(receiptPdfMock.renderToPngs).not.toHaveBeenCalled();
      expect(receiptFinalizerMock.finalizeReceipt).toHaveBeenCalled();
    });

    it('renders pages to PNG and sends a vision request for a scanned PDF', async () => {
      receiptPdfMock.extractText.mockResolvedValue({ text: '', meaningfulTextLength: 0, hasMeaningfulText: false });
      receiptPdfMock.renderToPngs.mockResolvedValue([Buffer.from('fake-png')]);
      mockOpenAiResponse();

      await service.parseReceiptPdf('cGRmYmFzZTY0', 'user-1', 'acc-1');

      expect(receiptPdfMock.renderToPngs).toHaveBeenCalled();
      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.arrayContaining([expect.objectContaining({ type: 'image_url' })]),
            }),
          ],
        }),
      );
      expect(receiptFinalizerMock.finalizeReceipt).toHaveBeenCalled();
    });

    it('falls back to a raw PDF file upload when page rendering fails', async () => {
      receiptPdfMock.extractText.mockResolvedValue({ text: '', meaningfulTextLength: 0, hasMeaningfulText: false });
      receiptPdfMock.renderToPngs.mockRejectedValue(new Error('pdftoppm not installed'));
      mockOpenAiResponse();

      await service.parseReceiptPdf('cGRmYmFzZTY0', 'user-1', 'acc-1');

      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.arrayContaining([expect.objectContaining({ type: 'file' })]),
            }),
          ],
        }),
      );
      expect(receiptFinalizerMock.finalizeReceipt).toHaveBeenCalled();
    });
  });
});
