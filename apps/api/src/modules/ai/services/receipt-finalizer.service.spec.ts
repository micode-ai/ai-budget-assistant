import { ReceiptFinalizerService } from './receipt-finalizer.service';
import type { ParsedReceipt } from './ocr.service';

// Base fixture for an already-parsed receipt (what OcrService hands to
// finalizeReceipt after validateAndNormalizeReceipt). Individual tests
// override only the fields they care about.
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
  deposit: null,
  tax: 0,
  total: 10,
  currency: 'USD',
  paymentMethod: 'card',
  confidence: 0.9,
  rawText: 'raw receipt text',
  suggestedCategory: undefined,
};

describe('ReceiptFinalizerService', () => {
  let service: ReceiptFinalizerService;
  let prisma: any;
  let geocodingMock: { geocode: jest.Mock; geocodeStructured: jest.Mock };
  let priceHistoryMock: { getProductTrendsFor: jest.Mock };
  let categorySplitterMock: { classify: jest.Mock };

  beforeEach(() => {
    prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' }) },
      account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    };
    geocodingMock = {
      geocode: jest.fn().mockResolvedValue(null),
      geocodeStructured: jest.fn().mockResolvedValue(null),
    };
    priceHistoryMock = {
      getProductTrendsFor: jest.fn().mockResolvedValue([]),
    };
    categorySplitterMock = {
      classify: jest.fn().mockResolvedValue({ assignments: new Map(), proposals: [] }),
    };
    service = new ReceiptFinalizerService(
      prisma,
      geocodingMock as any,
      priceHistoryMock as any,
      categorySplitterMock as any,
    );
    // Silence the real Nest Logger's console output (same convention as
    // anomaly.service.spec.ts / receipt-check.util.cross-path.spec.ts).
    (service as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  });

  function runFinalize(overrides: Partial<ParsedReceipt> = {}) {
    return service.finalizeReceipt({ ...BASE_PARSED_RECEIPT, ...overrides }, [], 'acc-1', 'user-1');
  }

  describe('receipt location (geocoding)', () => {
    it('geocodes the STRUCTURED store address (not the noisy raw blob) and composes a clean display name', async () => {
      geocodingMock.geocodeStructured.mockResolvedValue({ lat: 53.889, lng: 17.715, displayName: 'Brusy, PL' });
      // merchantAddress deliberately contains the company registered seat (Jeronimo Martins, Kostrzyn)
      // mashed in with the store address — exactly the string Nominatim could not resolve on prod.
      const result = await runFinalize({
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
      const result = await runFinalize({ merchantAddress: 'ul. Marszałkowska 10, Warszawa' });
      expect(geocodingMock.geocodeStructured).not.toHaveBeenCalled();
      expect(geocodingMock.geocode).toHaveBeenCalledWith('ul. Marszałkowska 10, Warszawa');
      expect(result.location).toEqual({ lat: 52.23, lng: 21.01, name: 'ul. Marszałkowska 10, Warszawa' });
    });

    it('returns location: null when structured geocoding finds nothing and there is no free-text fallback', async () => {
      const result = await runFinalize({ merchantCity: 'Brusy', merchantPostalCode: '89-632' });
      expect(geocodingMock.geocodeStructured).toHaveBeenCalled();
      expect(geocodingMock.geocode).not.toHaveBeenCalled(); // merchantAddress is null
      expect(result.location).toBeNull();
    });

    it('skips geocoding entirely when the receipt has no address at all', async () => {
      const result = await runFinalize({});
      expect(geocodingMock.geocodeStructured).not.toHaveBeenCalled();
      expect(geocodingMock.geocode).not.toHaveBeenCalled();
      expect(result.location).toBeNull();
    });
  });
});

describe('ReceiptFinalizerService price check', () => {
  const makeService = (getProductTrendsFor: jest.Mock) => {
    const service = Object.create(ReceiptFinalizerService.prototype) as any;
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
  let service: ReceiptFinalizerService;
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
    prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat-groceries', name: 'Groceries' },
          { id: 'cat-household', name: 'Household' },
        ]),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' }) },
      account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
      accountMember: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    categorySplitterMock = { classify: jest.fn().mockResolvedValue({ assignments: new Map(), proposals: [] }) };
    const geocodingMock = {
      geocode: jest.fn().mockResolvedValue(null),
      geocodeStructured: jest.fn().mockResolvedValue(null),
    };
    const priceHistoryMock = { getProductTrendsFor: jest.fn().mockResolvedValue([]) };
    service = new ReceiptFinalizerService(
      prisma,
      geocodingMock as any,
      priceHistoryMock as any,
      categorySplitterMock as any,
    );
    // Silence the real Nest Logger's console output — the nested
    // 'runCategorySplit with proposals' tests below still spy on this
    // stub's `log` fn directly when they need to assert on a specific call.
    (service as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  });

  function runFixture(overrides: Partial<ParsedReceipt> = {}) {
    return service.finalizeReceipt({ ...TWO_ITEM_RECEIPT, ...overrides }, [], 'acc-1', 'user-1');
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
    categorySplitterMock.classify.mockResolvedValue({
      assignments: new Map([
        [0, 'cat-groceries'],
        [1, 'cat-household'],
      ]),
      proposals: [],
    });

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

  describe('ReceiptFinalizerService.runCategorySplit with proposals', () => {
    const RECEIPT = {
      amount: 30,
      receiptItems: [
        { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 20 },
        { description: 'Płyn do naczyń', canonicalName: 'Płyn do naczyń', totalPrice: 10 },
      ],
    } as any;

    beforeEach(() => {
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Food & Dining' }]);
    });

    it('emits a proposed group as categoryId null and keeps the total exact', async () => {
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food']]),
        proposals: [{ name: 'Chemia', itemIndexes: [1] }],
      });

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT, 'u1');

      expect(splits).toHaveLength(2);
      const proposed = splits.find((s: any) => s.categoryId === null);
      expect(proposed.categoryName).toBe('Chemia');
      expect(proposed.amount).toBeCloseTo(10, 2);
      expect(splits.reduce((sum: number, s: any) => sum + s.amount, 0)).toBeCloseTo(30, 2);
      expect(JSON.stringify(splits)).not.toContain('proposed:');
    });

    it('splits entirely across proposals when every line falls under one and none under an existing category', async () => {
      // Both lines are claimed by a proposal, none by an assignment — the one
      // shape where the name map is populated exclusively from proposals
      // (spec "Edge cases": still two or more groups, so it splits).
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map(),
        proposals: [
          { name: 'Pieczywo', itemIndexes: [0] },
          { name: 'Chemia', itemIndexes: [1] },
        ],
      });

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT, 'u1');

      expect(splits).toHaveLength(2);
      expect(splits.every((s: any) => s.categoryId === null)).toBe(true);
      expect(splits.map((s: any) => s.categoryName).sort()).toEqual(['Chemia', 'Pieczywo']);
      expect(splits.reduce((sum: number, s: any) => sum + s.amount, 0)).toBeCloseTo(30, 2);
      expect(JSON.stringify(splits)).not.toContain('proposed:');
    });

    it('passes the account language to the classifier', async () => {
      prisma.user.findUnique.mockResolvedValue({ language: 'pl' });

      await (service as any).runCategorySplit('a1', RECEIPT, 'u1');

      expect(categorySplitterMock.classify).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'pl' }),
      );
    });

    it('still refuses when everything lands in one category, and logs the reason', async () => {
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food'], [1, 'c-food']]),
        proposals: [],
      });

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT, 'u1');

      expect(splits).toEqual([]);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('one_category'));
    });

    it('drops a proposed category that accounts for too little of the receipt', async () => {
      // The model cannot weigh this itself — by contract it never sees an amount —
      // so the server does. A category minted for 2 of a 100 receipt is clutter,
      // and its line is left unassigned rather than given one.
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food']]),
        proposals: [{ name: 'Chemia', itemIndexes: [1] }],
      });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits, itemCategories } = await (service as any).runCategorySplit(
        'a1',
        {
          amount: 100,
          receiptItems: [
            { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 98 },
            { description: 'Mydło', canonicalName: 'Mydło', totalPrice: 2 },
          ],
        } as any,
        'u1',
      );

      expect(itemCategories).toEqual([{ index: 0, categoryId: 'c-food', categoryName: 'Groceries' }]);
      expect(splits).toEqual([]);
    });

    it('keeps a proposed category that accounts for a real share of the receipt', async () => {
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food']]),
        proposals: [{ name: 'Alkohol', itemIndexes: [1] }],
      });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit(
        'a1',
        {
          amount: 100,
          receiptItems: [
            { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 60 },
            { description: 'Piwo', canonicalName: 'Piwo', totalPrice: 40 },
          ],
        } as any,
        'u1',
      );

      const proposed = splits.find((s: any) => s.categoryId === null);
      expect(proposed.categoryName).toBe('Alkohol');
      expect(proposed.amount).toBeCloseTo(40, 2);
    });

    it('keeps the category of every line when the arithmetic refuses the split', async () => {
      // The classification and the money split answer two different questions.
      // A receipt whose lines do not reconcile with its total still knows which
      // line is beer and which is bread, and that answer is what fills
      // expense_items.category_id and teaches the product rules on save. Throwing
      // it away with the arithmetic left users looking at a receipt of
      // "not assigned" rows to redo by hand.
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food'], [1, 'c-alc']]),
        proposals: [],
      });
      prisma.category.findMany.mockResolvedValue([
        { id: 'c-food', name: 'Groceries' },
        { id: 'c-alc', name: 'Alcohol' },
      ]);

      const { splits, itemCategories } = await (service as any).runCategorySplit(
        'a1',
        // Lines sum to 30 against a total of 100: nothing reconciles, no split.
        {
          amount: 100,
          receiptItems: [
            { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 20 },
            { description: 'Piwo', canonicalName: 'Piwo', totalPrice: 10 },
          ],
        } as any,
        'u1',
      );

      expect(splits).toEqual([]);
      expect(itemCategories).toEqual([
        { index: 0, categoryId: 'c-food', categoryName: 'Groceries' },
        { index: 1, categoryId: 'c-alc', categoryName: 'Alcohol' },
      ]);
    });

    it('refuses when three categories were on offer and everything still lands in one (ABA-398 production case)', async () => {
      prisma.category.findMany.mockResolvedValue([
        { id: 'c-bills', name: 'Bills & Utilities' },
        { id: 'c-fun', name: 'Entertainment' },
        { id: 'c-food', name: 'Food & Dining' },
      ]);
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food'], [1, 'c-food'], [2, 'c-food']]),
        proposals: [],
      });

      const { splits } = await (service as any).runCategorySplit(
        'a1',
        {
          amount: 33,
          receiptItems: [
            { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 8 },
            { description: 'Whisky G Loch 0,7l', canonicalName: 'Whisky G Loch 0,7l', totalPrice: 20 },
            { description: 'Tulipan 9 Sztuk', canonicalName: 'Tulipan 9 Sztuk', totalPrice: 5 },
          ],
        } as any,
        'u1',
      );

      expect(splits).toEqual([]);
    });
  });

  describe('ReceiptFinalizerService.runCategorySplit with a deposit', () => {
    const RECEIPT_WITH_DEPOSIT = {
      amount: 204.5,
      depositAmount: 4.5,
      receiptItems: [{ description: 'Chleb', canonicalName: 'Chleb', totalPrice: 200 }],
    } as any;

    beforeEach(() => {
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food']]),
        proposals: [],
      });
    });

    it('gives the deposit its own group, named in the account owner language', async () => {
      prisma.accountMember.findFirst.mockResolvedValue({ user: { language: 'pl' } });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      const deposit = splits.find((s: any) => s.categoryName === 'Kaucja');
      expect(deposit).toBeDefined();
      expect(deposit.amount).toBeCloseTo(4.5, 2);
      // Not a real category yet: it is created when the user saves.
      expect(deposit.categoryId).toBeNull();
      expect(JSON.stringify(splits)).not.toContain('proposed:');
    });

    it('splits a receipt that is otherwise a single category', async () => {
      prisma.accountMember.findFirst.mockResolvedValue({ user: { language: 'pl' } });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      expect(splits).toHaveLength(2);
      expect(splits.reduce((sum: number, s: any) => sum + s.amount, 0)).toBeCloseTo(204.5, 2);
    });

    it('reuses the deposit category when the account already has it', async () => {
      prisma.accountMember.findFirst.mockResolvedValue({ user: { language: 'pl' } });
      prisma.category.findMany.mockResolvedValue([
        { id: 'c-food', name: 'Groceries' },
        { id: 'c-dep', name: 'Kaucja' },
      ]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      expect(splits.find((s: any) => s.categoryName === 'Kaucja').categoryId).toBe('c-dep');
    });

    it('is not subject to the 10% materiality floor that governs proposals', async () => {
      // 4.5 of 204.5 is 2.2%. A model proposal that small is dropped; a deposit
      // is not a proposal — it is a printed, named block of the receipt.
      prisma.accountMember.findFirst.mockResolvedValue({ user: { language: 'en' } });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      expect(splits.map((s: any) => s.categoryName)).toContain('Deposit');
    });

    it('resolves the deposit name from the account OWNER language, not the scanning member', async () => {
      // The scanning member (userId 'u1') reads English; the account owner
      // reads Polish. A shared account must converge on one deposit category
      // regardless of which member's device did the scan, so the category
      // must follow the owner, not the acting user.
      prisma.user.findUnique.mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' });
      prisma.accountMember.findFirst.mockResolvedValue({ user: { language: 'pl' } });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      expect(splits.map((s: any) => s.categoryName)).toContain('Kaucja');
      expect(splits.map((s: any) => s.categoryName)).not.toContain('Deposit');
      // Filtered on role, never sorted by it — an `orderBy` would risk
      // alphabetically preferring 'editor' over 'owner'.
      expect(prisma.accountMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'a1', role: 'owner' } }),
      );
    });

    it('produces no split for a deposit-only receipt with no line items to classify', async () => {
      // The relaxed few_lines guard lets a zero-labeled-line receipt reach
      // this point when a deposit is present. Traced by hand: the real
      // ReceiptCategorySplitService.classify returns empty
      // assignments/proposals for an empty items array (mocked here to match
      // that), and the pre-existing "no_assignments" check below then refuses
      // any split — deposit included, because a lone deposit with nothing to
      // pair it with is not "a receipt that split", per the design's own
      // "deposit but no line items" edge case.
      prisma.accountMember.findFirst.mockResolvedValue({ user: { language: 'pl' } });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);
      categorySplitterMock.classify.mockResolvedValue({ assignments: new Map(), proposals: [] });

      const { splits, itemCategories } = await (service as any).runCategorySplit(
        'a1',
        { amount: 4.5, depositAmount: 4.5, receiptItems: [] } as any,
        'u1',
      );

      expect(splits).toEqual([]);
      expect(itemCategories).toEqual([]);
    });
  });
});
