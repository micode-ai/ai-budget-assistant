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

describe('OcrService', () => {
  let service: OcrService;
  let prisma: any;
  let configService: any;
  let geocodingMock: { geocode: jest.Mock; geocodeStructured: jest.Mock };
  let priceHistoryMock: { getProductTrendsFor: jest.Mock };
  let categorySplitterMock: { classify: jest.Mock };

  beforeEach(() => {
    mockChatCreate.mockReset();
    prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' }) },
      account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    };
    configService = { get: jest.fn().mockReturnValue('sk-test') };
    geocodingMock = {
      geocode: jest.fn().mockResolvedValue(null),
      geocodeStructured: jest.fn().mockResolvedValue(null),
    };
    priceHistoryMock = {
      getProductTrendsFor: jest.fn().mockResolvedValue([]),
    };
    categorySplitterMock = {
      classify: jest.fn().mockResolvedValue(new Map()),
    };
    service = new OcrService(
      configService,
      prisma,
      geocodingMock as any,
      priceHistoryMock as any,
      categorySplitterMock as any,
    );
  });

  async function runParseWithFixture(overrides: Partial<ParsedReceipt> = {}) {
    const parsed = { ...BASE_PARSED_RECEIPT, ...overrides };
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(parsed) }, finish_reason: 'stop' }],
    });
    return service.parseReceipt('base64imagedata', 'user-1', 'acc-1');
  }

  describe('receipt location (geocoding)', () => {
    it('geocodes the STRUCTURED store address (not the noisy raw blob) and composes a clean display name', async () => {
      geocodingMock.geocodeStructured.mockResolvedValue({ lat: 53.889, lng: 17.715, displayName: 'Brusy, PL' });
      // merchantAddress deliberately contains the company registered seat (Jeronimo Martins, Kostrzyn)
      // mashed in with the store address — exactly the string Nominatim could not resolve on prod.
      const result = await runParseWithFixture({
        merchantAddress: 'ul. Wojska Polskiego 1, 89-632 Brusy, Jeronimo Martins Polska S.A., 62-025 Kostrzyn',
        merchantStreet: 'ul. Wojska Polskiego 1',
        merchantCity: 'Brusy',
        merchantPostalCode: '89-632',
        merchantCountry: 'Poland',
      });
      expect(geocodingMock.geocodeStructured).toHaveBeenCalledWith({
        street: 'ul. Wojska Polskiego 1',
        city: 'Brusy',
        postalCode: '89-632',
        country: 'Poland',
      });
      // The noisy free-text path is NOT used when structured parts resolve.
      expect(geocodingMock.geocode).not.toHaveBeenCalled();
      // Display name is the clean composed store address, NOT the mashed raw blob.
      expect(result.location).toEqual({
        lat: 53.889,
        lng: 17.715,
        name: 'ul. Wojska Polskiego 1, 89-632 Brusy',
      });
    });

    it('falls back to free-text geocoding when the receipt has no structured parts', async () => {
      geocodingMock.geocode.mockResolvedValue({ lat: 52.23, lng: 21.01, displayName: 'Warszawa' });
      const result = await runParseWithFixture({ merchantAddress: 'ul. Marszałkowska 10, Warszawa' });
      expect(geocodingMock.geocodeStructured).not.toHaveBeenCalled();
      expect(geocodingMock.geocode).toHaveBeenCalledWith('ul. Marszałkowska 10, Warszawa');
      expect(result.location).toEqual({ lat: 52.23, lng: 21.01, name: 'ul. Marszałkowska 10, Warszawa' });
    });

    it('returns location: null when structured geocoding finds nothing and there is no free-text fallback', async () => {
      const result = await runParseWithFixture({ merchantCity: 'Brusy', merchantPostalCode: '89-632' });
      expect(geocodingMock.geocodeStructured).toHaveBeenCalled();
      expect(geocodingMock.geocode).not.toHaveBeenCalled(); // merchantAddress is null
      expect(result.location).toBeNull();
    });

    it('skips geocoding entirely when the receipt has no address at all', async () => {
      const result = await runParseWithFixture({});
      expect(geocodingMock.geocodeStructured).not.toHaveBeenCalled();
      expect(geocodingMock.geocode).not.toHaveBeenCalled();
      expect(result.location).toBeNull();
    });
  });
});

describe('OcrService price check', () => {
  const makeService = (getProductTrendsFor: jest.Mock) => {
    const service = Object.create(OcrService.prototype) as any;
    service.priceHistory = { getProductTrendsFor };
    service.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    return service;
  };

  const receipt = {
    merchant: 'Biedronka',
    currencyCode: 'PLN',
    date: '2026-07-25',
    receiptItems: [{ description: 'KAWA', canonicalName: 'Kawa', quantity: 1, unitPrice: 30, totalPrice: 30 }],
  };

  it('returns findings when a line is above the usual price', async () => {
    const service = makeService(
      jest.fn().mockResolvedValue([
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          points: [
            { date: '2026-07-01', price: 20 },
            { date: '2026-07-08', price: 20 },
          ],
        },
      ]),
    );
    const findings = await service.runPriceCheck('acc-1', receipt);
    expect(findings).toHaveLength(1);
    expect(findings[0].canonicalName).toBe('Kawa');
  });

  it('returns an empty array — not undefined — when there is no merchant', async () => {
    const service = makeService(jest.fn());
    const findings = await service.runPriceCheck('acc-1', { ...receipt, merchant: null });
    expect(findings).toEqual([]);
    expect(service.priceHistory.getProductTrendsFor).not.toHaveBeenCalled();
  });

  it('is fail-silent: a thrown query still yields an empty array', async () => {
    const service = makeService(jest.fn().mockRejectedValue(new Error('db down')));
    await expect(service.runPriceCheck('acc-1', receipt)).resolves.toEqual([]);
    expect(service.logger.warn).toHaveBeenCalled();
  });

  it('skips items without a canonical name', async () => {
    const service = makeService(jest.fn());
    const findings = await service.runPriceCheck('acc-1', {
      ...receipt,
      receiptItems: [{ description: 'COS', quantity: 1, unitPrice: 30, totalPrice: 30 }],
    });
    expect(findings).toEqual([]);
    expect(service.priceHistory.getProductTrendsFor).not.toHaveBeenCalled();
  });
});

describe('finalizeReceipt category splits', () => {
  let service: OcrService;
  let prisma: any;
  let categorySplitterMock: { classify: jest.Mock };

  // A two-item receipt: buildCategorySplits refuses to split fewer than two
  // categories, and the fallback canonical-name builder gives each item a
  // non-empty label even though the fixture never sets `canonicalName`.
  const TWO_ITEM_RECEIPT: ParsedReceipt & { suggestedCategory?: string } = {
    ...BASE_PARSED_RECEIPT,
    items: [
      { description: 'Bread', totalPrice: 5 },
      { description: 'Shampoo', totalPrice: 5 },
    ],
    subtotal: 10,
    total: 10,
  };

  beforeEach(() => {
    mockChatCreate.mockReset();
    prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat-groceries', name: 'Groceries' },
          { id: 'cat-household', name: 'Household' },
        ]),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' }) },
      account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    };
    categorySplitterMock = { classify: jest.fn().mockResolvedValue(new Map()) };
    const configService = { get: jest.fn().mockReturnValue('sk-test') };
    const geocodingMock = {
      geocode: jest.fn().mockResolvedValue(null),
      geocodeStructured: jest.fn().mockResolvedValue(null),
    };
    const priceHistoryMock = { getProductTrendsFor: jest.fn().mockResolvedValue([]) };
    service = new OcrService(
      configService as any,
      prisma,
      geocodingMock as any,
      priceHistoryMock as any,
      categorySplitterMock as any,
    );
  });

  function runFixture(overrides: Partial<ParsedReceipt> = {}) {
    const parsed = { ...TWO_ITEM_RECEIPT, ...overrides };
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(parsed) }, finish_reason: 'stop' }],
    });
    return service.parseReceipt('base64imagedata', 'user-1', 'acc-1');
  }

  it('always exposes categorySplits, even when classification finds nothing', async () => {
    const result = await runFixture();
    expect(categorySplitterMock.classify).toHaveBeenCalled();
    expect(result.categorySplits).toEqual([]);
  });

  it('never lets a classifier failure break the scan', async () => {
    categorySplitterMock.classify.mockRejectedValue(new Error('model unavailable'));
    const result = await runFixture();
    expect(result.categorySplits).toEqual([]);
    // Everything else the funnel already produced stays intact.
    expect(result.merchant).toBe('Test Store');
    expect(result.amount).toBe(10);
    expect(result.currencyCode).toBe('USD');
    expect(result.receiptItems).toHaveLength(2);
  });

  it('skips classification for a fully encrypted (tier-2) account', async () => {
    prisma.account.findUnique.mockResolvedValue({ encryptionTier: 2 });
    const result = await runFixture();
    expect(result.categorySplits).toEqual([]);
    expect(categorySplitterMock.classify).not.toHaveBeenCalled();
  });

  it('folds an unlabeled line into the dominant category instead of refusing the split', async () => {
    // Total 100: two labeled lines summing 50, plus one unlabeled line (no
    // description, no canonicalName — e.g. a fee or an OCR miss) worth 45.
    // A filter that dropped the unlabeled line before buildCategorySplits saw
    // it would leave only 50 of 100 accounted for — a 50% gap, well past the
    // 5% tolerance — and the split would be refused ([]) even though the
    // spec requires the unlabeled money to fold into the dominant group.
    categorySplitterMock.classify.mockResolvedValue(
      new Map([
        [0, 'cat-groceries'],
        [1, 'cat-household'],
      ]),
    );

    const result = await runFixture({
      items: [
        { description: 'Bread', totalPrice: 25 },
        { description: 'Shampoo', totalPrice: 25 },
        { description: '', totalPrice: 45 },
      ],
      subtotal: 100,
      total: 100,
    });

    // Only the two labeled lines are sent to the classifier — there is
    // nothing to classify without a label — and original-index provenance
    // is preserved (index 0/1, not re-indexed after filtering).
    expect(categorySplitterMock.classify).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ index: 0, label: 'Bread' }),
          expect.objectContaining({ index: 1, label: 'Shampoo' }),
        ],
      }),
    );

    // The receipt actually splits (not []), and the unlabeled line's 45 is
    // folded into the dominant group (cat-groceries: 25 assigned + 50
    // residual = 75), not silently dropped.
    expect(result.categorySplits).toEqual([
      { categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 75, percentage: 75, itemIndexes: [0] },
      { categoryId: 'cat-household', categoryName: 'Household', amount: 25, percentage: 25, itemIndexes: [1] },
    ]);
  });
});
