import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PhotoHandler } from './photo.handler';
import { t } from '../helpers/i18n';
import { downloadFile } from '../helpers/download-file';

// The handler downloads the file via this helper (real network) — stub it.
jest.mock('../helpers/download-file', () => ({
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('photo')),
}));
const download = downloadFile as jest.Mock;

/** In-memory CacheService: values are copied, as a Redis read is a fresh copy. */
function makeCache() {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null)),
    set: jest.fn(async (key: string, value: unknown, _ttl?: number) => {
      store.set(key, JSON.stringify(value));
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
    setIfAbsent: jest.fn(async (key: string, _ttl?: number) => {
      if (store.has(key)) return false;
      store.set(key, '1');
      return true;
    }),
  };
}

/** A promise the test resolves or rejects by hand, to interleave two taps. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setImmediate(r));

const b64 = (s: string) => Buffer.from(s).toString('base64');

function baseReceipt() {
  return {
    amount: 42.5,
    discountAmount: null,
    depositAmount: null,
    currencyCode: 'PLN',
    description: 'Biedronka',
    categoryId: null,
    categorySuggestion: 'Groceries',
    merchant: 'Biedronka',
    date: '2026-07-07',
    confidence: 0.9,
    receiptItems: [],
    location: null,
  };
}

function setup() {
  const ocr = {
    parseReceipt: jest.fn().mockResolvedValue({ ...baseReceipt(), fingerprint: 'f1', scanAttestation: 'att1' }),
    parseReceiptPdf: jest.fn().mockResolvedValue(baseReceipt()),
    parseReceiptParts: jest.fn().mockResolvedValue({
      ...baseReceipt(),
      amount: 99.9,
      merchant: 'Long Shop',
      description: 'Long Shop',
      receiptItems: [{ description: 'Milk', totalPrice: 99.9 }],
      fingerprint: 'fparts',
      scanAttestation: 'attparts',
    }),
  };
  const expenses = { create: jest.fn().mockResolvedValue({ expense: { id: 'exp-1' } }) };
  const subs = {
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
    refundAiUsage: jest.fn().mockResolvedValue(undefined),
  };
  const cache = makeCache();
  const handler = new PhotoHandler(
    ocr as never,
    expenses as never,
    subs as never,
    { create: jest.fn() } as never,
    { reconcileWithReceipt: jest.fn().mockResolvedValue({ checkedLabels: [] }) } as never,
    cache as never,
    { recordExternalWrite: jest.fn().mockResolvedValue(null) } as never,
    { updateConversationId: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return { handler, ocr, expenses, subs, cache };
}
type H = ReturnType<typeof setup>;

let messageId = 100;
function photoCtx(opts: { fromId?: number; chatId?: number; userId?: string; photo?: unknown[] } = {}) {
  return {
    userState: { userId: opts.userId ?? 'user-1', accountId: 'acc-1', accountRole: 'editor', language: 'en' },
    from: { id: opts.fromId ?? 123, language_code: 'en' },
    chat: { id: opts.chatId ?? -100 },
    message: {
      photo: opts.photo ?? [
        { file_id: 'S', file_size: 10_000, width: 320, height: 640 },
        { file_id: 'L', file_size: 200_000, width: 1280, height: 2560 },
      ],
    },
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    telegram: {
      getFileLink: jest.fn().mockResolvedValue({ href: 'https://t.example/photo.jpg' }),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(true),
    },
    reply: jest.fn().mockImplementation(async () => ({ message_id: ++messageId })),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    deleteMessage: jest.fn().mockResolvedValue(true),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
  };
}
type Ctx = ReturnType<typeof photoCtx>;

const buttons = (ctx: Ctx, call: number): string[] =>
  (ctx.reply.mock.calls[call][1].reply_markup.inline_keyboard as Array<Array<{ callback_data: string }>>)
    .flat()
    .map((b) => b.callback_data);

/** Scan photo 1, then send photo 2 into the same chat; returns the question's callbacks. */
async function scanThenSecond(h: H, ctx: Ctx) {
  download.mockResolvedValueOnce(Buffer.from('part-one'));
  await h.handler.handlePhoto(ctx as never);
  const receiptId = buttons(ctx, 0)[0].split(':')[1];
  download.mockResolvedValueOnce(Buffer.from('part-two'));
  await h.handler.handlePhoto(ctx as never);
  const [part, fresh] = buttons(ctx, 1);
  return { receiptId, part, fresh };
}

describe('Telegram PhotoHandler — long receipt in several photos', () => {
  it('single photo with no pointer scans immediately (unchanged)', async () => {
    const h = setup();
    const ctx = photoCtx();
    download.mockResolvedValueOnce(Buffer.from('part-one'));

    await h.handler.handlePhoto(ctx as never);

    expect(h.subs.trackAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(h.ocr.parseReceipt).toHaveBeenCalledWith(b64('part-one'), 'user-1', 'acc-1', undefined);
    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(buttons(ctx, 0)[0]).toMatch(/^receipt_add:/);
    expect(await h.cache.get('telegram:receipt-latest:-100:123')).toBe(buttons(ctx, 0)[0].split(':')[1]);
  });

  const SIZES = [
    { file_id: 'S', file_size: 10_000, width: 320, height: 640 },
    { file_id: 'M', file_size: 900_000, width: 800, height: 1600 },
    { file_id: 'XL', file_size: 2_000_000, width: 2560, height: 5120 },
  ];

  it('a plain single photo scans from the largest size, exactly as before', async () => {
    const h = setup();
    const ctx = photoCtx({ photo: SIZES });
    await h.handler.handlePhoto(ctx as never);
    expect(ctx.telegram.getFileLink).toHaveBeenCalledWith('XL');
  });

  it('a photo that may become a part uses the largest size within the part cap', async () => {
    const h = setup();
    const ctx = photoCtx();
    await h.handler.handlePhoto(ctx as never);
    const next = photoCtx({ photo: SIZES });
    await h.handler.handlePhoto(next as never);
    expect(next.telegram.getFileLink).toHaveBeenCalledWith('M');
    expect(buttons(next, 0)[0]).toMatch(/^receipt_part:/);
  });

  it('a single photo saves with no extra parts', async () => {
    const h = setup();
    const ctx = photoCtx();
    download.mockResolvedValueOnce(Buffer.from('part-one'));
    await h.handler.handlePhoto(ctx as never);
    await h.handler.handleReceiptAddCallback(ctx as never, buttons(ctx, 0)[0].split(':')[1]);

    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.receiptImageBase64).toBe(b64('part-one'));
    expect(dto.receiptMimeType).toBe('image/jpeg');
    expect(dto.receiptImageParts).toBeUndefined();
    expect(dto.receiptFingerprint).toBe('f1');
  });

  it('photo with a live pointer asks the question', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part, fresh } = await scanThenSecond(h, ctx);

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[1][0]).toBe(t('receiptContinuationQuestion', 'en'));
    const tmpId = fresh.split(':')[1];
    expect(part).toBe(`receipt_part:${receiptId}:${tmpId}`);
    expect(fresh).toBe(`receipt_new:${tmpId}`);
    expect(part.length).toBeLessThanOrEqual(64); // Telegram's callback_data cap
    expect(await h.cache.get(`telegram:scan:${tmpId}`)).toMatchObject({ base64: b64('part-two') });
  });

  it('continuation re-reads all parts in one call and replaces the card', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    const [, rid, tmpId] = part.split(':');
    const cardMessageId = messageId - 1; // the card was the reply before the question

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(h.ocr.parseReceiptParts).toHaveBeenCalledTimes(1);
    expect(h.ocr.parseReceiptParts.mock.calls[0][0]).toEqual([
      { imageBase64: b64('part-one'), mimeType: 'image/jpeg' },
      { imageBase64: b64('part-two'), mimeType: 'image/jpeg' },
    ]);
    // Billed like the API: 2.0 per part, so the added part costs one more 2.0.
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(2);
    expect(h.subs.trackAiUsage).toHaveBeenLastCalledWith('user-1', 'ocr', 2.0, 'acc-1');

    const data = await h.cache.get(`telegram:receipt:${receiptId}`);
    expect(data.amount).toBe(99.9);
    expect(data.items).toEqual([{ description: 'Milk', totalPrice: 99.9 }]);
    expect(data.receiptFingerprint).toBe('fparts');
    expect(data.scanAttestation).toBe('attparts');
    expect(data.parts).toHaveLength(2);

    // The tap is visible at once: the question turns into a "reading…" note.
    expect(ctx.editMessageText).toHaveBeenCalledWith(t('receiptPartsReading', 'en'));
    // The updated card is posted at the bottom, the old card and the note are deleted.
    expect(ctx.telegram.editMessageText).not.toHaveBeenCalled();
    expect(ctx.telegram.deleteMessage).toHaveBeenCalledWith(-100, cardMessageId);
    expect(ctx.deleteMessage).toHaveBeenCalledTimes(1);
    const last = ctx.reply.mock.calls[ctx.reply.mock.calls.length - 1];
    expect(last[0]).toContain('Long Shop');
    expect(last[1].reply_markup.inline_keyboard[0][0].callback_data).toBe(`receipt_add:${receiptId}`);
    const sentId = (await ctx.reply.mock.results[ctx.reply.mock.results.length - 1].value).message_id;
    expect((await h.cache.get(`telegram:receipt:${receiptId}`)).cardMessageId).toBe(sentId);
    expect(await h.cache.get(`telegram:scan:${tmpId}`)).toBeNull();
  });

  it('still posts the new card when the old one cannot be deleted', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { part } = await scanThenSecond(h, ctx);
    ctx.telegram.deleteMessage.mockRejectedValueOnce(new Error('message to delete not found'));
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    const last = ctx.reply.mock.calls[ctx.reply.mock.calls.length - 1];
    expect(last[0]).toContain('Long Shop');
    expect(last[1].reply_markup.inline_keyboard[0][0].callback_data).toBe(`receipt_add:${rid}`);
  });

  it('save passes receiptImageParts', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { part } = await scanThenSecond(h, ctx);
    const [, rid, tmpId] = part.split(':');
    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    await h.handler.handleReceiptAddCallback(ctx as never, rid);

    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.receiptImageBase64).toBe(b64('part-one'));
    expect(dto.receiptImageParts).toEqual([{ imageBase64: b64('part-two'), mimeType: 'image/jpeg' }]);
    expect(dto.receiptFingerprint).toBe('fparts');
    expect(dto.scanAttestation).toBe('attparts');
    expect(dto.amount).toBe(99.9);
    // Saving ends the pending receipt, so the next photo scans at once.
    expect(await h.cache.get('telegram:receipt-latest:-100:123')).toBeNull();
  });

  it('new receipt scans the photo alone', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { fresh } = await scanThenSecond(h, ctx);

    await h.handler.handleNewReceiptCallback(ctx as never, fresh.split(':')[1]);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(h.ocr.parseReceipt.mock.calls[1][0]).toBe(b64('part-two'));
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(2);
    expect(await h.cache.get(`telegram:scan:${fresh.split(':')[1]}`)).toBeNull();
  });

  it("pointer is per chat and user — another user's photo in a group is not offered as continuation", async () => {
    const h = setup();
    const alice = photoCtx({ fromId: 1, userId: 'user-a' });
    await h.handler.handlePhoto(alice as never);

    const bob = photoCtx({ fromId: 2, userId: 'user-b' });
    await h.handler.handlePhoto(bob as never);

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(buttons(bob, 0)[0]).toMatch(/^receipt_add:/);

    // The same user in another chat starts fresh too.
    const aliceDm = photoCtx({ fromId: 1, userId: 'user-a', chatId: 1 });
    await h.handler.handlePhoto(aliceDm as never);
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(3);
  });

  it('another member cannot answer the question for the photo owner', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { part, fresh } = await scanThenSecond(h, ctx);
    const [, rid, tmpId] = part.split(':');
    const bob = photoCtx({ fromId: 2, userId: 'user-b' });

    await h.handler.handlePartCallback(bob as never, rid, tmpId);
    await h.handler.handleNewReceiptCallback(bob as never, fresh.split(':')[1]);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(await h.cache.get(`telegram:scan:${tmpId}`)).not.toBeNull();
  });

  it('a photo sent while the question is unanswered gets its own question; parts join in answer order', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { part } = await scanThenSecond(h, ctx);
    download.mockResolvedValueOnce(Buffer.from('part-three'));
    await h.handler.handlePhoto(ctx as never);
    const part3 = buttons(ctx, 2)[0];
    expect(part3).toMatch(/^receipt_part:/);
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);

    const [, rid, tmp2] = part.split(':');
    const [, , tmp3] = part3.split(':');
    await h.handler.handlePartCallback(ctx as never, rid, tmp2);
    await h.handler.handlePartCallback(ctx as never, rid, tmp3);

    expect(h.ocr.parseReceiptParts).toHaveBeenCalledTimes(2);
    expect(h.ocr.parseReceiptParts.mock.calls[1][0].map((p: { imageBase64: string }) => p.imageBase64)).toEqual([
      b64('part-one'),
      b64('part-two'),
      b64('part-three'),
    ]);
  });

  it('refuses a fifth part, refunds its charge and leaves the receipt as it was', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, fresh } = await scanThenSecond(h, ctx);
    const data = await h.cache.get(`telegram:receipt:${receiptId}`);
    data.parts = [1, 2, 3, 4].map((i) => ({ imageBase64: b64(`p${i}`), mimeType: 'image/jpeg' }));
    await h.cache.set(`telegram:receipt:${receiptId}`, data, 1800);

    await h.handler.handlePartCallback(ctx as never, receiptId, fresh.split(':')[1]);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(ctx.reply).toHaveBeenLastCalledWith(t('receiptPartsFull', 'en', { max: '4' }));
    expect((await h.cache.get(`telegram:receipt:${receiptId}`)).parts).toHaveLength(4);
  });

  it('does not add the part when the AI limit refuses its charge', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    h.subs.trackAiUsage.mockRejectedValueOnce(new ForbiddenException('limit'));
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenLastCalledWith(t('aiLimitReached', 'en'));
    expect((await h.cache.get(`telegram:receipt:${receiptId}`)).parts).toHaveLength(1);
    // Not charged, so the parked photo is kept for "New receipt".
    expect(await h.cache.get(`telegram:scan:${tmpId}`)).not.toBeNull();
  });

  it('rolls the part back when the combined read fails', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new Error('model down'));
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(ctx.reply).toHaveBeenLastCalledWith(t('receiptScanFailed', 'en'));
    const data = await h.cache.get(`telegram:receipt:${receiptId}`);
    expect(data.parts).toHaveLength(1);
    expect(data.amount).toBe(42.5);
  });

  it('answers expired when the pending receipt is gone before the continuation tap', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    await h.handler.handleReceiptCancelCallback(ctx as never, receiptId);
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenLastCalledWith(t('scanRequestExpired', 'en'));
    // Cancelling also cleared the pointer: the next photo scans at once.
    expect(await h.cache.get('telegram:receipt-latest:-100:123')).toBeNull();
  });

  it('continuation leaves item-edit and date-edit modes, since the card is replaced', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    await h.cache.set('telegram:awaiting_item_edit:123', receiptId, 600);
    await h.cache.set('telegram:awaiting_date:123', receiptId, 600);
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(await h.cache.get('telegram:awaiting_item_edit:123')).toBeNull();
    expect(await h.cache.get('telegram:awaiting_date:123')).toBeNull();
  });

  it('viewers are refused before any question is asked', async () => {
    const h = setup();
    const ctx = photoCtx();
    await h.handler.handlePhoto(ctx as never);
    const viewer = photoCtx();
    viewer.userState.accountRole = 'viewer';

    await h.handler.handlePhoto(viewer as never);

    expect(viewer.reply).toHaveBeenCalledTimes(1);
    expect(viewer.reply).toHaveBeenCalledWith(t('viewerRestricted', 'en'));
  });

  it('a PDF scan never becomes part 1 of a multi-photo receipt', async () => {
    const h = setup();
    const pdf = { ...photoCtx(), message: { document: { mime_type: 'application/pdf', file_id: 'F1' } } };
    await h.handler.handleDocument(pdf as never);
    expect(await h.cache.get('telegram:receipt-latest:-100:123')).toBeNull();

    const ctx = photoCtx();
    await h.handler.handlePhoto(ctx as never);
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(buttons(ctx, 0)[0]).toMatch(/^receipt_add:/);
  });

  // ── Fix round 1: concurrency, MIME gate, limits ──────────────────────────

  /** Starts a continuation whose model call waits on the returned deferred. */
  async function startSlowContinuation(h: H, ctx: Ctx) {
    const { receiptId, part, fresh } = await scanThenSecond(h, ctx);
    const read = deferred<unknown>();
    h.ocr.parseReceiptParts.mockImplementationOnce(() => read.promise);
    const [, rid, tmpId] = part.split(':');
    const running = h.handler.handlePartCallback(ctx as never, rid, tmpId);
    await flush();
    expect(h.ocr.parseReceiptParts).toHaveBeenCalledTimes(1);
    return { receiptId, tmpId, fresh, read, running };
  }

  const longShop = () => ({
    ...baseReceipt(),
    amount: 99.9,
    merchant: 'Long Shop',
    description: 'Long Shop',
    receiptItems: [],
    fingerprint: 'fparts',
    scanAttestation: 'attparts',
  });

  it('a save tapped during a continuation read is refused, and works once the read is done', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);

    await h.handler.handleReceiptAddCallback(ctx as never, receiptId);
    expect(h.expenses.create).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenLastCalledWith(t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    expect(ctx.telegram.deleteMessage).toHaveBeenCalledTimes(1);

    await h.handler.handleReceiptAddCallback(ctx as never, receiptId);
    expect(h.expenses.create).toHaveBeenCalledTimes(1);
    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.amount).toBe(99.9);
    expect(dto.receiptImageParts).toHaveLength(1);
  });

  it('a cancel tapped during a continuation read is refused', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);

    await h.handler.handleReceiptCancelCallback(ctx as never, receiptId);
    expect(ctx.editMessageText).not.toHaveBeenCalledWith(t('receiptCancelled', 'en'));
    expect(await h.cache.get(`telegram:receipt:${receiptId}`)).not.toBeNull();

    read.resolve(longShop());
    await running;
    await h.handler.handleReceiptCancelCallback(ctx as never, receiptId);
    expect(await h.cache.get(`telegram:receipt:${receiptId}`)).toBeNull();
  });

  it('a second continuation while the first is reading is refused, uncharged, and its photo kept', async () => {
    const h = setup();
    const ctx = photoCtx();
    download.mockResolvedValueOnce(Buffer.from('part-one'));
    await h.handler.handlePhoto(ctx as never);
    download.mockResolvedValueOnce(Buffer.from('part-two'));
    await h.handler.handlePhoto(ctx as never);
    download.mockResolvedValueOnce(Buffer.from('part-three'));
    await h.handler.handlePhoto(ctx as never);
    const [, rid, tmp2] = buttons(ctx, 1)[0].split(':');
    const [, , tmp3] = buttons(ctx, 2)[0].split(':');
    const read = deferred<unknown>();
    h.ocr.parseReceiptParts.mockImplementationOnce(() => read.promise);

    const first = h.handler.handlePartCallback(ctx as never, rid, tmp2);
    await flush();
    await h.handler.handlePartCallback(ctx as never, rid, tmp3);

    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(2); // part 1 + the first continuation
    expect(ctx.answerCbQuery).toHaveBeenLastCalledWith(t('receiptBusy', 'en'));
    expect(await h.cache.get(`telegram:scan:${tmp3}`)).not.toBeNull();

    read.resolve(longShop());
    await first;
    // Answered again once the first is done: nothing was lost, all three parts read together.
    await h.handler.handlePartCallback(ctx as never, rid, tmp3);
    expect(h.ocr.parseReceiptParts.mock.calls[1][0].map((p: { imageBase64: string }) => p.imageBase64)).toEqual([
      b64('part-one'),
      b64('part-two'),
      b64('part-three'),
    ]);
  });

  it('a receipt gone during the read is neither rewritten nor shown again', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);
    await h.cache.del(`telegram:receipt:${receiptId}`); // expired (or saved elsewhere)

    read.resolve(longShop());
    await running;

    expect(await h.cache.get(`telegram:receipt:${receiptId}`)).toBeNull();
    expect(ctx.telegram.editMessageText).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.some((c) => String(c[0]).includes('Long Shop'))).toBe(false);
  });

  it('a failed read does not resurrect a receipt that is gone', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);
    await h.cache.del(`telegram:receipt:${receiptId}`);

    read.reject(new Error('model down'));
    await running;

    expect(await h.cache.get(`telegram:receipt:${receiptId}`)).toBeNull();
  });

  it('a typed line correction during a continuation read waits, and never drops the new part', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);
    await h.cache.set('telegram:awaiting_item_edit:123', receiptId, 600);
    const typed = { ...photoCtx(), message: { text: '= 5.00' } };

    expect(await h.handler.handleItemEditInput(typed as never)).toBe(true);
    expect(typed.reply).toHaveBeenLastCalledWith(t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    const data = await h.cache.get(`telegram:receipt:${receiptId}`);
    expect(data.parts).toHaveLength(2);
    expect(data.receiptFingerprint).toBe('fparts');
  });

  it('a typed date during a continuation read waits, and never drops the new part', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);
    await h.cache.set('telegram:awaiting_date:123', receiptId, 600);
    const typed = { ...photoCtx(), message: { text: '01.02.2026' } };

    expect(await h.handler.handleDateInput(typed as never)).toBe(true);
    expect(typed.reply).toHaveBeenLastCalledWith(t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    expect((await h.cache.get(`telegram:receipt:${receiptId}`)).parts).toHaveLength(2);
  });

  it('an Edit items tap during a continuation read waits, and never drops the new part', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);

    await h.handler.handleItemsCallback(ctx as never, receiptId);
    expect(ctx.answerCbQuery).toHaveBeenLastCalledWith(t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    expect((await h.cache.get(`telegram:receipt:${receiptId}`)).parts).toHaveLength(2);
  });

  it('releases the lock after a continuation, so the receipt is usable again', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, read, running } = await startSlowContinuation(h, ctx);
    read.resolve(longShop());
    await running;
    expect(await h.cache.get(`telegram:receipt-busy:${receiptId}`)).toBeNull();
  });

  it('a part the reader refuses (BadRequest) is refunded and rolled back', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new BadRequestException('parts_mime'));
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(h.subs.refundAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(ctx.reply).toHaveBeenLastCalledWith(t('receiptScanFailed', 'en'));
    expect((await h.cache.get(`telegram:receipt:${receiptId}`)).parts).toHaveLength(1);
  });

  it('refunds when the receipt disappears right after the part was added', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    const key = `telegram:receipt:${receiptId}`;
    const realSet = h.cache.set.getMockImplementation()!;
    h.cache.set.mockImplementation(async (k: string, v: unknown, ttl?: number) => {
      if (k === key && (v as { parts?: unknown[] } | undefined)?.parts?.length === 2) return h.cache.del(k);
      return realSet(k, v, ttl);
    });
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenLastCalledWith(t('scanRequestExpired', 'en'));
  });

  it('a document of a type the parts reader does not accept never becomes part 1', async () => {
    const h = setup();
    const gif = { ...photoCtx(), message: { document: { mime_type: 'image/gif', file_id: 'G1' } } };
    await h.handler.handleDocument(gif as never);
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(await h.cache.get('telegram:receipt-latest:-100:123')).toBeNull();
  });

  it('a part-1 photo over the part cap sets no pointer', async () => {
    const h = setup();
    const ctx = photoCtx();
    download.mockResolvedValueOnce(Buffer.alloc(1_572_865));
    await h.handler.handlePhoto(ctx as never);
    expect(await h.cache.get('telegram:receipt-latest:-100:123')).toBeNull();
  });

  it('a photo with no size within the cap is scanned as a new receipt, not parked', async () => {
    const h = setup();
    const ctx = photoCtx();
    await h.handler.handlePhoto(ctx as never);
    const big = photoCtx({ photo: [{ file_id: 'XL', file_size: 2_000_000, width: 2560, height: 5120 }] });
    await h.handler.handlePhoto(big as never);
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(buttons(big, 0)[0]).toMatch(/^receipt_add:/);
  });

  it('a pending receipt that already has 4 parts gets no question: the photo is a new receipt', async () => {
    const h = setup();
    const ctx = photoCtx();
    await h.handler.handlePhoto(ctx as never);
    const receiptId = buttons(ctx, 0)[0].split(':')[1];
    const data = await h.cache.get(`telegram:receipt:${receiptId}`);
    data.parts = [1, 2, 3, 4].map((i) => ({ imageBase64: b64(`p${i}`), mimeType: 'image/jpeg' }));
    await h.cache.set(`telegram:receipt:${receiptId}`, data, 1800);

    await h.handler.handlePhoto(ctx as never);

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(buttons(ctx, 1)[0]).toMatch(/^receipt_add:/);
  });

  it('refreshes the pointer TTL when a part is added', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { receiptId, part } = await scanThenSecond(h, ctx);
    h.cache.set.mockClear();
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(h.cache.set).toHaveBeenCalledWith('telegram:receipt-latest:-100:123', receiptId, 1800);
  });

  it('posts exactly one new card per continuation', async () => {
    const h = setup();
    const ctx = photoCtx();
    const { part } = await scanThenSecond(h, ctx);
    const replies = ctx.reply.mock.calls.length;
    const [, rid, tmpId] = part.split(':');

    await h.handler.handlePartCallback(ctx as never, rid, tmpId);

    expect(ctx.reply.mock.calls.length).toBe(replies + 1);
  });

  it('cancel and save leave date-edit mode too', async () => {
    const h = setup();
    const ctx = photoCtx();
    await h.handler.handlePhoto(ctx as never);
    const first = buttons(ctx, 0)[0].split(':')[1];
    await h.cache.set('telegram:awaiting_date:123', first, 600);
    await h.handler.handleReceiptCancelCallback(ctx as never, first);
    expect(await h.cache.get('telegram:awaiting_date:123')).toBeNull();

    await h.handler.handlePhoto(ctx as never);
    const second = buttons(ctx, 1)[0].split(':')[1];
    await h.cache.set('telegram:awaiting_date:123', second, 600);
    await h.handler.handleReceiptAddCallback(ctx as never, second);
    expect(await h.cache.get('telegram:awaiting_date:123')).toBeNull();
  });
});
