import { PhotoHandler } from './photo.handler';
import type { SlackFile, SlackUserState } from '../types';

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
