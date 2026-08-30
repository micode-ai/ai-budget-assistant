import { PhotoHandler } from './photo.handler';
import { buildCategorySplitLine } from '../helpers/i18n';

// The handler downloads the file via this helper (real network) — stub it.
jest.mock('../helpers/download-file', () => ({
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

/** In-memory stand-in for CacheService (get/set/del), now that pending
 * receipt state lives in Redis instead of a module-level Map. */
function makeCache() {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
  };
}

const RECEIPT_LOCATION = { lat: 52.2297, lng: 21.0122, name: 'Sucha 31, Sucha' };

function baseReceipt(location: typeof RECEIPT_LOCATION | null) {
  return {
    amount: 42.5,
    discountAmount: null,
    currencyCode: 'PLN',
    description: 'Biedronka',
    categoryId: null,
    categorySuggestion: 'Groceries',
    merchant: 'Biedronka',
    date: '2026-07-07',
    confidence: 0.9,
    receiptItems: [],
    location,
  };
}

function makeCtx() {
  return {
    userState: { userId: 'user-1', accountId: 'acc-1', accountRole: 'editor', language: 'pl' },
    from: { id: 123, language_code: 'pl' },
    message: { document: { mime_type: 'application/pdf', file_id: 'F1' } },
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    telegram: { getFileLink: jest.fn().mockResolvedValue({ href: 'https://t.example/file.pdf' }) },
    reply: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
  };
}

/** Pull the generated receiptId out of the inline-keyboard callback_data. */
function receiptIdFromReply(ctx: ReturnType<typeof makeCtx>): string {
  const kb = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
  const cb = kb[0][0].callback_data as string; // 'receipt_add:<id>'
  return cb.split(':')[1];
}

describe('Telegram PhotoHandler — geocoded location wiring (ABA-310 bot photo geocode flag)', () => {
  function setup(location: typeof RECEIPT_LOCATION | null) {
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue(baseReceipt(location)),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const categories = { create: jest.fn() };
    const handler = new PhotoHandler(ocr as never, expenses as never, subs as never, categories as never, makeCache() as never);
    return { handler, expenses };
  }

  it('carries the geocoded location from OCR through to expensesService.create', async () => {
    const { handler, expenses } = setup(RECEIPT_LOCATION);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);
    const receiptId = receiptIdFromReply(ctx);
    await handler.handleReceiptAddCallback(ctx as never, receiptId);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.location).toEqual(RECEIPT_LOCATION);
  });

  it('omits location when the receipt had no geocodable address', async () => {
    const { handler, expenses } = setup(null);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);
    const receiptId = receiptIdFromReply(ctx);
    await handler.handleReceiptAddCallback(ctx as never, receiptId);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.location).toBeUndefined();
  });
});

describe('Telegram PhotoHandler — buildPriceCheckLine (receipt price-check summary)', () => {
  function setup() {
    const ocr = { parseReceipt: jest.fn(), parseReceiptPdf: jest.fn() };
    const expenses = { create: jest.fn() };
    const subs = { trackAiUsage: jest.fn() };
    const categories = { create: jest.fn() };
    return new PhotoHandler(ocr as never, expenses as never, subs as never, categories as never, makeCache() as never);
  }

  it('appends a price-check line when the scan returned findings', async () => {
    const handler = setup();
    const summary = (handler as any).buildPriceCheckLine(
      {
        priceFindings: [
          { canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' },
          { canonicalName: 'Mleko', overpaidAmount: 2, currencyCode: 'PLN' },
        ],
      } as any,
      'en',
    );
    expect(summary).toContain('2');
    expect(summary).toContain('6');
  });

  it('returns an empty string when there are no findings', () => {
    const handler = setup();
    expect((handler as any).buildPriceCheckLine({ priceFindings: [] } as any, 'en')).toBe('');
  });

  const findings = (n: number) =>
    Array.from({ length: n }, () => ({ canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' }));

  // The old wording put the count directly before a noun, which is ungrammatical in
  // Russian for most counts. Assert the count is NOT immediately followed by a word:
  // it must be the last token of its clause, so no noun has to agree with it.
  it.each([1, 2, 5])('keeps the count away from any agreeing noun (ru, count=%i)', (n) => {
    const handler = setup();
    const line = (handler as any).buildPriceCheckLine({ priceFindings: findings(n) } as any, 'ru');
    expect(line).toMatch(new RegExp(`${n}\\s*(,|\\.|$)`));
    expect(line).not.toMatch(new RegExp(`${n}\\s+\\p{L}`, 'u'));
  });
});

describe('Telegram buildCategorySplitLine (receipt category autosplit — bots report the split)', () => {
  it('returns an empty string for an empty splits array', () => {
    expect(buildCategorySplitLine([], 'PLN', 'en')).toBe('');
  });

  it('lists each category name with its amount', () => {
    const line = buildCategorySplitLine(
      [
        { categoryName: 'Groceries', amount: 180 },
        { categoryName: 'Alcohol', amount: 25 },
      ],
      'PLN',
      'en',
    );
    expect(line).toContain('Groceries 180');
    expect(line).toContain('Alcohol 25');
  });
});

describe('Telegram PhotoHandler — receipt category splits reported to the bot (bots report the split)', () => {
  const SPLITS = [
    { categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 180, percentage: 87.8, itemIndexes: [0, 1] },
    { categoryId: 'cat-alcohol', categoryName: 'Alcohol', amount: 25, percentage: 12.2, itemIndexes: [2] },
  ];

  function receiptWithSplits(categorySplits: typeof SPLITS) {
    return { ...baseReceipt(null), categorySplits };
  }

  function setup(categorySplits: typeof SPLITS | undefined) {
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue(
        categorySplits === undefined ? baseReceipt(null) : receiptWithSplits(categorySplits),
      ),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const categories = { create: jest.fn() };
    const handler = new PhotoHandler(ocr as never, expenses as never, subs as never, categories as never, makeCache() as never);
    return { handler, expenses };
  }

  it('passes the receipt category splits into the created expense', async () => {
    const { handler, expenses } = setup(SPLITS);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);
    const receiptId = receiptIdFromReply(ctx);
    await handler.handleReceiptAddCallback(ctx as never, receiptId);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.splits).toEqual(SPLITS);
  });

  it('appends a split line to the reply', async () => {
    const { handler } = setup(SPLITS);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);

    const summary = ctx.reply.mock.calls[0][0] as string;
    expect(summary).toContain('Groceries 180');
    expect(summary).toContain('Alcohol 25');
  });

  // Telegram sends the summary with parse_mode: 'HTML'. A category name is
  // user-controlled free text ("Health & Beauty" is an entirely ordinary
  // category), and an unescaped '&' makes Telegram reject the whole message
  // with a parse-entities error — which the surrounding try/catch then
  // reports to the user as receiptScanFailed, even though the scan actually
  // succeeded. merchant/description/categorySuggestion/item descriptions are
  // all escaped in this same file; the category-split line must be too.
  it('HTML-escapes category names before they reach the parse_mode: HTML reply', async () => {
    const { handler } = setup([
      { categoryId: 'cat-hb', categoryName: 'Health & Beauty', amount: 50, percentage: 100, itemIndexes: [0] },
    ]);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);

    const summary = ctx.reply.mock.calls[0][0] as string;
    expect(summary).toContain('Health &amp; Beauty');
    expect(summary).not.toContain('Health & Beauty');
  });

  it('replies exactly as before when there is no split', async () => {
    // "before this feature existed" == a receipt with no categorySplits field
    // at all (baseReceipt). Today's OCR always returns the field, empty when
    // there is nothing to split — that must produce the byte-identical reply.
    const { handler: legacyHandler } = setup(undefined);
    const { handler: emptySplitHandler } = setup([]);
    const ctxLegacy = makeCtx();
    const ctxEmpty = makeCtx();

    await legacyHandler.handleDocument(ctxLegacy as never);
    await emptySplitHandler.handleDocument(ctxEmpty as never);

    expect(ctxEmpty.reply.mock.calls[0][0]).toEqual(ctxLegacy.reply.mock.calls[0][0]);

    // Sanity check: an actual split DOES change the reply, so the equality
    // above is a real assertion and not a tautology from a broken test.
    const { handler: withSplitsHandler } = setup(SPLITS);
    const ctxWithSplits = makeCtx();
    await withSplitsHandler.handleDocument(ctxWithSplits as never);
    expect(ctxWithSplits.reply.mock.calls[0][0]).not.toEqual(ctxLegacy.reply.mock.calls[0][0]);

    // Also passes no splits through to the created expense.
    const { handler: cbHandler, expenses } = setup([]);
    const ctxCb = makeCtx();
    await cbHandler.handleDocument(ctxCb as never);
    const receiptId = receiptIdFromReply(ctxCb);
    await cbHandler.handleReceiptAddCallback(ctxCb as never, receiptId);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.splits).toBeUndefined();
  });

  // A split set must sum to the expense total or not appear at all: category
  // analytics prefer split rows over the expense's own categoryId. Once a
  // proposed (`categoryId: null`) group is resolved into a real, created
  // category, the FULL split set travels — 20 (already-real) + 10 (proposed,
  // now created) = 30 = the expense amount. This replaces the earlier
  // interim behavior of withholding the whole set.
  it('creates a category for a proposed group and passes the full resolved split set', async () => {
    const MIXED_SPLITS = [
      { categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 20, percentage: 66.67, itemIndexes: [0] },
      { categoryId: null, categoryName: 'Chemia', amount: 10, percentage: 33.33, itemIndexes: [1] },
    ];
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue({ ...baseReceipt(null), amount: 30, categorySplits: MIXED_SPLITS }),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const categories = { create: jest.fn().mockResolvedValue({ id: 'cat-chemia' }) };
    const handler = new PhotoHandler(ocr as never, expenses as never, subs as never, categories as never, makeCache() as never);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);
    const receiptId = receiptIdFromReply(ctx);
    await handler.handleReceiptAddCallback(ctx as never, receiptId);

    expect(categories.create).toHaveBeenCalledTimes(1);
    expect(categories.create).toHaveBeenCalledWith('acc-1', 'user-1', { name: 'Chemia', type: 'expense', icon: '🏷️' });
    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.amount).toBe(30);
    expect(dto.splits).toEqual([
      { categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 20, percentage: 66.67, itemIndexes: [0] },
      { categoryId: 'cat-chemia', categoryName: 'Chemia', amount: 10, percentage: 33.33, itemIndexes: [1] },
    ]);
  });
});
