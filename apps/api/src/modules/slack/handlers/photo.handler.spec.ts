import { PhotoHandler } from './photo.handler';
import type { SlackFile, SlackUserState } from '../types';
import { buildCategorySplitLine } from '../helpers/i18n';

/** Minimal in-memory stand-in for the ioredis client the handler uses. */
function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
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

const userState: SlackUserState = {
  userId: 'user-1',
  accountId: 'acc-1',
  accountRole: 'editor',
  conversationId: null,
  currencyCode: 'PLN',
  language: 'pl',
  slackUserId: 'U1',
  slackTeamId: 'T1',
  channel: 'D1',
};

function pdfFile(): SlackFile {
  return {
    id: 'file-1',
    mimetype: 'application/pdf',
    url_private_download: 'https://files.slack.com/receipt.pdf',
  };
}

describe('Slack PhotoHandler — geocoded location wiring (ABA-310 bot photo geocode flag)', () => {
  function setup(location: typeof RECEIPT_LOCATION | null) {
    const redis = makeFakeRedis();
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue(baseReceipt(location)),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const client = {
      postPlaceholder: jest.fn().mockResolvedValue('1700000000.000100'),
      downloadFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
      replyText: jest.fn().mockResolvedValue(undefined),
      replyButtons: jest.fn().mockResolvedValue(undefined),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendButtons: jest.fn().mockResolvedValue(undefined),
    };
    const handler = new PhotoHandler(
      ocr as never,
      expenses as never,
      subs as never,
      client as never,
      redis as never,
    );
    return { handler, redis, expenses };
  }

  function shortIdFrom(redis: ReturnType<typeof makeFakeRedis>): string {
    const key = [...redis.store.keys()].find((k) => k.startsWith('slack:receipt:'));
    expect(key).toBeDefined();
    return key!.slice('slack:receipt:'.length);
  }

  it('carries the geocoded location from OCR through to expensesService.create', async () => {
    const { handler, redis, expenses } = setup(RECEIPT_LOCATION);

    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleReceiptAddCallback(shortId, userState);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.location).toEqual(RECEIPT_LOCATION);
  });

  it('omits location when the receipt had no geocodable address', async () => {
    const { handler, redis, expenses } = setup(null);

    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleReceiptAddCallback(shortId, userState);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.location).toBeUndefined();
  });
});

describe('Slack buildCategorySplitLine (receipt category autosplit — bots report the split)', () => {
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

describe('Slack PhotoHandler — receipt category splits reported to the bot (bots report the split)', () => {
  const SPLITS = [
    { categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 180, percentage: 87.8, itemIndexes: [0, 1] },
    { categoryId: 'cat-alcohol', categoryName: 'Alcohol', amount: 25, percentage: 12.2, itemIndexes: [2] },
  ];

  function receiptWithSplits(categorySplits: typeof SPLITS) {
    return { ...baseReceipt(null), categorySplits };
  }

  function setup(categorySplits: typeof SPLITS | undefined) {
    const redis = makeFakeRedis();
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue(
        categorySplits === undefined ? baseReceipt(null) : receiptWithSplits(categorySplits),
      ),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const client = {
      postPlaceholder: jest.fn().mockResolvedValue('1700000000.000100'),
      downloadFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
      replyText: jest.fn().mockResolvedValue(undefined),
      replyButtons: jest.fn().mockResolvedValue(undefined),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendButtons: jest.fn().mockResolvedValue(undefined),
    };
    const handler = new PhotoHandler(
      ocr as never,
      expenses as never,
      subs as never,
      client as never,
      redis as never,
    );
    return { handler, redis, expenses, client };
  }

  function shortIdFrom(redis: ReturnType<typeof makeFakeRedis>): string {
    const key = [...redis.store.keys()].find((k) => k.startsWith('slack:receipt:'));
    expect(key).toBeDefined();
    return key!.slice('slack:receipt:'.length);
  }

  it('passes the receipt category splits into the created expense', async () => {
    const { handler, redis, expenses } = setup(SPLITS);

    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleReceiptAddCallback(shortId, userState);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.splits).toEqual(SPLITS);
  });

  it('appends a split line to the reply', async () => {
    const { handler, client } = setup(SPLITS);

    await handler.handleDocument(pdfFile(), userState);

    const summary = client.replyButtons.mock.calls[0][3] as string;
    expect(summary).toContain('Groceries 180');
    expect(summary).toContain('Alcohol 25');
  });

  it('replies exactly as before when there is no split', async () => {
    // "before this feature existed" == a receipt with no categorySplits field
    // at all (baseReceipt). Today's OCR always returns the field, empty when
    // there is nothing to split — that must produce the byte-identical reply.
    const { handler: legacyHandler, client: legacyClient } = setup(undefined);
    const { handler: emptySplitHandler, client: emptyClient } = setup([]);

    await legacyHandler.handleDocument(pdfFile(), userState);
    await emptySplitHandler.handleDocument(pdfFile(), userState);

    expect(emptyClient.replyButtons.mock.calls[0][3]).toEqual(legacyClient.replyButtons.mock.calls[0][3]);

    // Sanity check: an actual split DOES change the reply.
    const { handler: withSplitsHandler, client: withSplitsClient } = setup(SPLITS);
    await withSplitsHandler.handleDocument(pdfFile(), userState);
    expect(withSplitsClient.replyButtons.mock.calls[0][3]).not.toEqual(legacyClient.replyButtons.mock.calls[0][3]);

    // Also passes no splits through to the created expense.
    const { handler: cbHandler, redis: cbRedis, expenses: cbExpenses } = setup([]);
    await cbHandler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(cbRedis);
    await cbHandler.handleReceiptAddCallback(shortId, userState);
    const dto = cbExpenses.create.mock.calls[0][2];
    expect(dto.splits).toBeUndefined();
  });
});
