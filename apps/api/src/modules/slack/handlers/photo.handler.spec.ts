import { PhotoHandler } from './photo.handler';
import type { SlackFile, SlackUserState } from '../types';
import { buildCategorySplitLine, t } from '../helpers/i18n';

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

/** In-memory stand-in for ShoppingListService — reconciles nothing by default. */
function makeShoppingList() {
  return { reconcileWithReceipt: jest.fn().mockResolvedValue({ checkedLabels: [] }) };
}

/** ABA-599: stand-in for ChatActionRecorderService — reuses whatever conversationId
 * it's given by default, as if the write landed back in the same conversation. */
function makeChatActionRecorder(impl?: (params: any) => Promise<string>) {
  return {
    recordExternalWrite: jest.fn(impl ?? ((params: any) => Promise.resolve(params.conversationId ?? 'conv-new'))),
  };
}

/** ABA-599: stand-in for SlackLinkService — only updateConversationId is used here. */
function makeLinkService() {
  return { updateConversationId: jest.fn().mockResolvedValue(undefined) };
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
    const categories = { create: jest.fn() };
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
      categories as never,
      makeShoppingList() as never,
      client as never,
      makeChatActionRecorder() as never,
      makeLinkService() as never,
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
    const categories = { create: jest.fn() };
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
      categories as never,
      makeShoppingList() as never,
      client as never,
      makeChatActionRecorder() as never,
      makeLinkService() as never,
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

  // A split set must sum to the expense total or not appear at all: category
  // analytics prefer split rows over the expense's own categoryId. Once a
  // proposed (`categoryId: null`) group is resolved into a real, created
  // category, the FULL split set travels — 20 (already-real) + 10 (proposed,
  // now created) = 30 = the expense amount. A partial split set (withholding
  // the proposed group, or creating the category without wiring it back into
  // the splits) is the specific defect this test exists to catch.
  it('creates a category for a proposed group and passes the full resolved split set', async () => {
    const MIXED_SPLITS = [
      { categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 20, percentage: 66.67, itemIndexes: [0] },
      { categoryId: null, categoryName: 'Chemia', amount: 10, percentage: 33.33, itemIndexes: [1] },
    ];
    const redis = makeFakeRedis();
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue({ ...baseReceipt(null), amount: 30, categorySplits: MIXED_SPLITS }),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const categories = { create: jest.fn().mockResolvedValue({ id: 'cat-chemia' }) };
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
      categories as never,
      makeShoppingList() as never,
      client as never,
      makeChatActionRecorder() as never,
      makeLinkService() as never,
      redis as never,
    );

    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleReceiptAddCallback(shortId, userState);

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

describe('Slack PhotoHandler — line-item editing (ABA-482)', () => {
  const ITEMS = [
    { description: 'Bread', quantity: 1, unitPrice: 5.99, totalPrice: 5.99, categoryId: 'cat-food' },
    { description: 'Beer', quantity: 2, unitPrice: 3.0, totalPrice: 6.0, categoryId: 'cat-beer' },
  ];

  function setup() {
    const redis = makeFakeRedis();
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue({
        ...baseReceipt(null),
        amount: 11.99,
        receiptItems: ITEMS,
        categorySplits: [],
      }),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const categories = { create: jest.fn() };
    const client = {
      postPlaceholder: jest.fn().mockResolvedValue('1700000000.000100'),
      downloadFile: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
      replyText: jest.fn().mockResolvedValue(undefined),
      replyButtons: jest.fn().mockResolvedValue(undefined),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendButtons: jest.fn().mockResolvedValue(undefined),
    };
    const handler = new PhotoHandler(
      ocr as never,
      expenses as never,
      subs as never,
      categories as never,
      makeShoppingList() as never,
      client as never,
      makeChatActionRecorder() as never,
      makeLinkService() as never,
      redis as never,
    );
    return { handler, redis, expenses, client };
  }

  const shortIdFrom = (redis: ReturnType<typeof makeFakeRedis>) => {
    const key = [...redis.store.keys()].find((k) => k.startsWith('slack:receipt:'));
    return key!.slice('slack:receipt:'.length);
  };

  it('ignores text when the user is not editing items', async () => {
    const { handler } = setup();

    await expect(handler.handleItemEditInput('2 = 14,69', userState)).resolves.toBe(false);
  });

  it('carries a corrected line price through to the created expense', async () => {
    const { handler, redis, expenses } = setup();
    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleItemsCallback(shortId, userState);

    await expect(handler.handleItemEditInput('2 = 14,69', userState)).resolves.toBe(true);
    await handler.handleReceiptAddCallback(shortId, userState);

    const dto = expenses.create.mock.calls[0][2];
    expect(dto.items[1].totalPrice).toBe(14.69);
    expect(dto.items[1].unitPrice).toBe(7.35);
  });

  it('drops a removed line from the created expense', async () => {
    const { handler, redis, expenses } = setup();
    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleItemsCallback(shortId, userState);

    await handler.handleItemEditInput('1 -', userState);
    await handler.handleReceiptAddCallback(shortId, userState);

    const dto = expenses.create.mock.calls[0][2];
    expect(dto.items.map((i: { description: string }) => i.description)).toEqual(['Beer']);
  });

  it('leaves edit mode once the expense is confirmed', async () => {
    const { handler, redis } = setup();
    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleItemsCallback(shortId, userState);

    await handler.handleReceiptAddCallback(shortId, userState);

    await expect(handler.handleItemEditInput('1 -', userState)).resolves.toBe(false);
  });
});

describe('Slack PhotoHandler — records the write for chat undo (ABA-599)', () => {
  const CREATED_EXPENSE = {
    id: 'exp-99',
    amount: 42.5,
    currencyCode: 'PLN',
    description: 'Biedronka',
    category: { name: 'Groceries' },
    date: '2026-07-07',
  };

  function setup(recorderImpl?: (params: any) => Promise<string>) {
    const redis = makeFakeRedis();
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue(baseReceipt(null)),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ expense: CREATED_EXPENSE, isNew: true }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const categories = { create: jest.fn() };
    const client = {
      postPlaceholder: jest.fn().mockResolvedValue('1700000000.000100'),
      downloadFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
      replyText: jest.fn().mockResolvedValue(undefined),
      replyButtons: jest.fn().mockResolvedValue(undefined),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendButtons: jest.fn().mockResolvedValue(undefined),
    };
    const chatActionRecorder = makeChatActionRecorder(recorderImpl);
    const linkService = makeLinkService();
    const handler = new PhotoHandler(
      ocr as never,
      expenses as never,
      subs as never,
      categories as never,
      makeShoppingList() as never,
      client as never,
      chatActionRecorder as never,
      linkService as never,
      redis as never,
    );
    return { handler, redis, client, chatActionRecorder, linkService };
  }

  function shortIdFrom(redis: ReturnType<typeof makeFakeRedis>): string {
    const key = [...redis.store.keys()].find((k) => k.startsWith('slack:receipt:'));
    return key!.slice('slack:receipt:'.length);
  }

  /** Flushes the fire-and-forget recorder promise chain, which is never awaited
   * by the handler itself. */
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('records the created expense as undoable, using the created row id', async () => {
    const { handler, redis, chatActionRecorder } = setup();

    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleReceiptAddCallback(shortId, userState);

    expect(chatActionRecorder.recordExternalWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        accountId: 'acc-1',
        actionType: 'create_expense',
        resultData: expect.objectContaining({
          id: 'exp-99',
          amount: 42.5,
          currencyCode: 'PLN',
          category: 'Groceries',
        }),
      }),
    );
  });

  it('never affects the success reply, even when recording rejects', async () => {
    const { handler, redis, client } = setup(() => Promise.reject(new Error('boom')));

    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleReceiptAddCallback(shortId, userState);
    await flush();

    const lastCall = client.sendText.mock.calls[client.sendText.mock.calls.length - 1];
    expect(lastCall[2]).toContain('42.5 PLN');
    expect(lastCall[2]).toContain('Biedronka');
  });

  it('persists the new conversation id back onto the link when the recorder created one', async () => {
    const { handler, redis, linkService } = setup(() => Promise.resolve('conv-brand-new'));

    await handler.handleDocument(pdfFile(), userState);
    const shortId = shortIdFrom(redis);
    await handler.handleReceiptAddCallback(shortId, userState);
    await flush();

    expect(linkService.updateConversationId).toHaveBeenCalledWith('U1', 'conv-brand-new');
  });
});

describe('Slack PhotoHandler — same-file duplicate warning (ABA-603)', () => {
  const DUPLICATE_MATCH = {
    kind: 'exact' as const,
    expenseId: 'exp-old',
    clientId: 'client-old',
    merchant: 'Biedronka',
    description: null,
    amount: 42.5,
    currencyCode: 'PLN',
    date: '2026-07-01T00:00:00.000Z',
  };

  const STAGE2_MATCH = {
    kind: 'likely' as const,
    expenseId: 'exp-older',
    clientId: 'client-older',
    merchant: 'Duplicate Shop',
    description: null,
    amount: 42.5,
    currencyCode: 'PLN',
    date: '2026-07-06T00:00:00.000Z',
  };

  /** Pull the generated scanId out of the duplicate-warning button ids. */
  function scanIdFromButtons(client: { sendButtons: jest.Mock }, callIndex = 0): string {
    const buttons = client.sendButtons.mock.calls[callIndex][3] as Array<{ id: string }>;
    return buttons[0].id.split(':')[1];
  }

  function setup(duplicate: typeof DUPLICATE_MATCH | null, receiptOverrides: Record<string, unknown> = {}) {
    const redis = makeFakeRedis();
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue({ ...baseReceipt(null), ...receiptOverrides }),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const categories = { create: jest.fn() };
    const client = {
      postPlaceholder: jest.fn().mockResolvedValue('1700000000.000100'),
      downloadFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
      replyText: jest.fn().mockResolvedValue(undefined),
      replyButtons: jest.fn().mockResolvedValue(undefined),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendButtons: jest.fn().mockResolvedValue(undefined),
    };
    const receiptDuplicates = { findByFingerprint: jest.fn().mockResolvedValue(duplicate) };
    const handler = new PhotoHandler(
      ocr as never,
      expenses as never,
      subs as never,
      categories as never,
      makeShoppingList() as never,
      client as never,
      makeChatActionRecorder() as never,
      makeLinkService() as never,
      redis as never,
      receiptDuplicates as never,
    );
    return { handler, redis, ocr, expenses, subs, client, receiptDuplicates };
  }

  it('warns instead of scanning when the fingerprint already matches a saved expense', async () => {
    const { handler, ocr, subs, client, redis } = setup(DUPLICATE_MATCH);

    await handler.handleDocument(pdfFile(), userState);

    expect(subs.trackAiUsage).not.toHaveBeenCalled();
    expect(ocr.parseReceiptPdf).not.toHaveBeenCalled();
    expect(client.postPlaceholder).not.toHaveBeenCalled();
    expect(client.sendButtons).toHaveBeenCalledTimes(1);
    const text = client.sendButtons.mock.calls[0][2] as string;
    expect(text).toContain('Biedronka');
    expect([...redis.store.keys()].some((k) => k.startsWith('slack:dupscan:'))).toBe(true);
  });

  it('runs the scan normally when there is no fingerprint match', async () => {
    const { handler, ocr, subs } = setup(null);

    await handler.handleDocument(pdfFile(), userState);

    expect(subs.trackAiUsage).toHaveBeenCalledTimes(1);
    expect(ocr.parseReceiptPdf).toHaveBeenCalledTimes(1);
  });

  it('"Scan anyway" runs OCR on the parked scan', async () => {
    const { handler, ocr, subs, client } = setup(DUPLICATE_MATCH);

    await handler.handleDocument(pdfFile(), userState);
    const scanId = scanIdFromButtons(client);
    await handler.handleRescanCallback(scanId, userState);

    expect(subs.trackAiUsage).toHaveBeenCalledTimes(1);
    expect(ocr.parseReceiptPdf).toHaveBeenCalledTimes(1);
    expect(client.sendButtons).toHaveBeenCalledTimes(1); // duplicate warning only
    expect(client.replyButtons).toHaveBeenCalledTimes(1); // OCR preview
  });

  it('reports the request expired when "Scan anyway" is tapped after the parked scan is gone', async () => {
    const { handler, client } = setup(DUPLICATE_MATCH);

    await handler.handleRescanCallback('not-a-real-scan-id', userState);

    expect(client.sendText).toHaveBeenCalledWith(
      userState.slackTeamId,
      userState.channel,
      t('scanRequestExpired', userState.language),
    );
  });

  it('cancelling the duplicate warning discards the parked scan', async () => {
    const { handler, ocr, client, redis } = setup(DUPLICATE_MATCH);

    await handler.handleDocument(pdfFile(), userState);
    const scanId = scanIdFromButtons(client);
    await handler.handleRescanCancelCallback(scanId, userState);

    expect(redis.store.has(`slack:dupscan:${scanId}`)).toBe(false);
    await handler.handleRescanCallback(scanId, userState);
    expect(ocr.parseReceiptPdf).not.toHaveBeenCalled();
  });

  it('adds the stage-2 warning line to the preview when OCR itself reports a possible duplicate', async () => {
    const { handler, client } = setup(null, { possibleDuplicate: STAGE2_MATCH });

    await handler.handleDocument(pdfFile(), userState);

    const summary = client.replyButtons.mock.calls[0][3] as string;
    expect(summary).toContain('Duplicate Shop');
  });

  it('replies exactly as before when OCR reports no possible duplicate', async () => {
    const { handler, client } = setup(null, { possibleDuplicate: null });

    await handler.handleDocument(pdfFile(), userState);

    const summary = client.replyButtons.mock.calls[0][3] as string;
    expect(summary).not.toContain('Duplicate Shop');
  });
});
