import { ReceiptFinalizerService } from './receipt-finalizer.service';
import type { ParsedReceipt } from './ocr.service';
import { verifyScanAttestation, attestedLineHash } from '../../community-prices/scan-attestation.util';

const SALT = 'att-salt-att-salt-att-salt-att-salt-xx';

const GOOD: ParsedReceipt & { suggestedCategory?: string } = {
  merchantName: 'BIEDRONKA 123',
  merchantAddress: 'Marszalkowska 1, Warszawa',
  merchantStreet: 'Marszalkowska 1',
  merchantCity: 'Warszawa',
  merchantPostalCode: '00-001',
  merchantCountry: 'PL',
  date: '2026-10-09',
  time: '12:30',
  items: [
    { description: 'MLEKO', canonicalName: 'Mleko 1L', quantity: 1, unitPrice: 3.5, totalPrice: 3.5 },
    { description: 'CHLEB', canonicalName: 'Chleb', quantity: 2, unitPrice: 3.5, totalPrice: 7 },
  ],
  subtotal: 10.5,
  discount: null,
  deposit: null,
  tax: 0,
  total: 10.5,
  currency: 'PLN',
  paymentMethod: 'card',
  confidence: 0.9,
};

describe('ReceiptFinalizerService scan attestation (ABA-642)', () => {
  let service: ReceiptFinalizerService;
  let geocoding: { geocode: jest.Mock; geocodeStructured: jest.Mock };
  let communityPrices: { readEnabled: jest.Mock; getStoreBaselines: jest.Mock };
  let priceHistory: { getProductTrendsFor: jest.Mock };
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.COMMUNITY_PRICE_SALT = SALT;
    delete process.env.COMMUNITY_MIN_OCR_CONFIDENCE_PCT;
    const prisma: any = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ language: 'en' }) },
      account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    };
    geocoding = {
      geocode: jest.fn().mockResolvedValue(null),
      geocodeStructured: jest.fn().mockResolvedValue({ lat: 52.2297, lng: 21.0122 }),
    };
    priceHistory = { getProductTrendsFor: jest.fn().mockResolvedValue([]) };
    communityPrices = {
      readEnabled: jest.fn().mockReturnValue(true),
      getStoreBaselines: jest.fn().mockResolvedValue([{ canonicalName: 'Mleko 1L', medianPrice: 2, currency: 'PLN' }]),
    };
    service = new ReceiptFinalizerService(
      prisma,
      geocoding as any,
      priceHistory as any,
      { classify: jest.fn().mockResolvedValue({ assignments: new Map(), proposals: [] }) } as any,
      { getRulesMap: jest.fn().mockResolvedValue(new Map()) } as any,
      communityPrices as any,
    );
    (service as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  });

  afterAll(() => {
    process.env = saved;
  });

  const run = (over: Partial<ParsedReceipt> = {}, options: any = {}) =>
    service.finalizeReceipt({ ...GOOD, ...over } as any, [], 'acc-1', 'user-1', options);

  it('issues a token bound to the caller when every gate passes', async () => {
    const r = await run();
    expect(r.scanAttestation).toBeDefined();
    const p = verifyScanAttestation(SALT, r.scanAttestation, { userId: 'user-1', accountId: 'acc-1', now: new Date() });
    expect(p).toMatchObject({ m: 'biedronka', c: 'PLN', d: '2026-10-09', t: '12:30', tot: 1050, loc: [52.2297, 21.0122] });
    expect(p!.h).toEqual([attestedLineHash('Mleko 1L', 1, 3.5), attestedLineHash('Chleb', 2, 7)]);
    expect(verifyScanAttestation(SALT, r.scanAttestation, { userId: 'other', accountId: 'acc-1', now: new Date() })).toBeNull();
  });

  it('issues none when the salt is unset', async () => {
    delete process.env.COMMUNITY_PRICE_SALT;
    expect((await run()).scanAttestation).toBeUndefined();
  });

  it('ABA-642 audit: issues none when the salt is shorter than 32 characters (weak HMAC key)', async () => {
    process.env.COMMUNITY_PRICE_SALT = 'short-salt';
    expect((await run()).scanAttestation).toBeUndefined();
  });

  it('issues none below 80% confidence, and a missing confidence (0.7 default) fails on purpose', async () => {
    expect((await run({ confidence: 0.79 })).scanAttestation).toBeUndefined();
    expect((await run({ confidence: undefined as any })).scanAttestation).toBeUndefined();
    expect((await run({ confidence: 0.8 })).scanAttestation).toBeDefined();
  });

  it('issues none when the line sum misses the total by more than 5%', async () => {
    expect((await run({ total: 14 })).scanAttestation).toBeUndefined();
  });

  it('a basket discount or deposit that explains the gap still reconciles', async () => {
    expect((await run({ total: 8.5, discount: 2 })).scanAttestation).toBeDefined();
    expect((await run({ total: 12.5, deposit: 2 })).scanAttestation).toBeDefined();
  });

  it('issues none with fewer than 2 named priced lines', async () => {
    const one = [GOOD.items[0]];
    expect((await run({ items: one, total: 3.5 })).scanAttestation).toBeUndefined();
    const unnamed = [GOOD.items[0], { description: 'X', totalPrice: 7 }];
    expect((await run({ items: unnamed })).scanAttestation).toBeUndefined();
  });

  it('excludes names over 64 characters', async () => {
    const long = [GOOD.items[0], { ...GOOD.items[1], canonicalName: 'x'.repeat(65) }];
    expect((await run({ items: long })).scanAttestation).toBeUndefined();
  });

  it.each([
    ['merchant', { merchantName: null }],
    ['date', { date: null }],
    ['currency', { currency: '' }],
  ])('issues none without a %s', async (_n, over) => {
    expect((await run(over as any)).scanAttestation).toBeUndefined();
  });

  it('issues none without a server-geocoded location (no address to geocode)', async () => {
    geocoding.geocodeStructured.mockResolvedValue(null);
    expect((await run()).scanAttestation).toBeUndefined();
  });

  it('issues none when the caller opts out (plain text such as an e-mail body)', async () => {
    expect((await run({}, { attest: false })).scanAttestation).toBeUndefined();
  });

  describe('community baseline in the price check', () => {
    const history = [{ canonicalName: 'Mleko 1L', currency: 'PLN', points: [] }];
    beforeEach(() => priceHistory.getProductTrendsFor.mockResolvedValue(history));
    const dearMilk = { items: [{ ...GOOD.items[0], unitPrice: 3.5 }, GOOD.items[1]] };

    it('yields a community finding only when the caller asks, the flag is on and a location exists', async () => {
      const r = await run(dearMilk, { communityBaseline: true });
      expect(communityPrices.getStoreBaselines).toHaveBeenCalledWith('user-1', ['Mleko 1L', 'Chleb'], 'biedronka', 52.2297, 21.0122, 'PLN');
      expect(r.priceFindings).toHaveLength(1);
      expect(r.priceFindings[0]).toMatchObject({ canonicalName: 'Mleko 1L', source: 'community' });
    });

    it('never asks for a baseline when the request did not carry communityBaseline (bots, old builds)', async () => {
      const r = await run(dearMilk, {});
      expect(communityPrices.getStoreBaselines).not.toHaveBeenCalled();
      expect(r.priceFindings).toEqual([]);
    });

    it('never asks for a baseline when the read flag is off', async () => {
      communityPrices.readEnabled.mockReturnValue(false);
      await run(dearMilk, { communityBaseline: true });
      expect(communityPrices.getStoreBaselines).not.toHaveBeenCalled();
    });

    it('a personal history of 2+ points wins over the community baseline', async () => {
      priceHistory.getProductTrendsFor.mockResolvedValue([
        { canonicalName: 'Mleko 1L', currency: 'PLN', points: [{ date: '2026-09-20', price: 3.4 }, { date: '2026-09-27', price: 3.4 }] },
      ]);
      const r = await run(dearMilk, { communityBaseline: true });
      expect(r.priceFindings).toEqual([]); // 3.5 vs personal 3.4: below the rise threshold
    });
  });
});
