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
// Individual tests override only the fields they care about (e.g. merchantAddress).
const BASE_PARSED_RECEIPT: ParsedReceipt & { suggestedCategory?: string } = {
  merchantName: 'Test Store',
  merchantAddress: null,
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

describe('OcrService', () => {
  let service: OcrService;
  let prisma: any;
  let configService: any;
  let geocodingMock: { geocode: jest.Mock };

  beforeEach(() => {
    mockChatCreate.mockReset();
    prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' }) },
    };
    configService = { get: jest.fn().mockReturnValue('sk-test') };
    geocodingMock = { geocode: jest.fn().mockResolvedValue(null) };
    service = new OcrService(configService, prisma, geocodingMock as any);
  });

  async function runParseWithFixture(overrides: Partial<ParsedReceipt> = {}) {
    const parsed = { ...BASE_PARSED_RECEIPT, ...overrides };
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(parsed) }, finish_reason: 'stop' }],
    });
    return service.parseReceipt('base64imagedata', 'user-1', 'acc-1');
  }

  describe('receipt location (geocoding)', () => {
    it('geocodes merchantAddress and attaches location with the raw address as name', async () => {
      geocodingMock.geocode.mockResolvedValue({ lat: 52.23, lng: 21.01, displayName: 'Warszawa, PL' });
      const result = await runParseWithFixture({ merchantAddress: 'ul. Marszałkowska 10, Warszawa' });
      expect(geocodingMock.geocode).toHaveBeenCalledWith('ul. Marszałkowska 10, Warszawa');
      expect(result.location).toEqual({ lat: 52.23, lng: 21.01, name: 'ul. Marszałkowska 10, Warszawa' });
    });

    it('returns location: null when geocoding finds nothing', async () => {
      geocodingMock.geocode.mockResolvedValue(null);
      const result = await runParseWithFixture({ merchantAddress: 'ul. Marszałkowska 10, Warszawa' });
      expect(result.location).toBeNull();
    });

    it('skips geocoding entirely when the receipt has no address', async () => {
      const result = await runParseWithFixture({ merchantAddress: null });
      expect(geocodingMock.geocode).not.toHaveBeenCalled();
      expect(result.location).toBeNull();
    });
  });
});
