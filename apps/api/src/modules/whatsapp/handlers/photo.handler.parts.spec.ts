import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PhotoHandler } from './photo.handler';
import type { WaMediaMessage, WhatsAppUserState } from '../types';
import { t } from '../helpers/i18n';

/**
 * One in-memory Redis behind both clients the handler uses: the bot's own
 * ioredis (`wa:receipt:*` as JSON strings) and CacheService (parts, pointer,
 * parked photos, lock) — the same server and encoding in production.
 */
function makeStores() {
  const store = new Map<string, string>();
  const redis = {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => keys.reduce((n, k) => n + (store.delete(k) ? 1 : 0), 0)),
  };
  const cache = {
    get: jest.fn(async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null)),
    set: jest.fn(async (k: string, v: unknown, _ttl?: number) => {
      store.set(k, JSON.stringify(v));
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
    }),
    setIfAbsent: jest.fn(async (k: string, _ttl?: number) => {
      if (store.has(k)) return false;
      store.set(k, '1');
      return true;
    }),
  };
  return { redis, cache };
}

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
    fingerprint: 'f1',
    scanAttestation: 'att1',
  };
}
const longShop = () => ({
  ...baseReceipt(),
  amount: 99.9,
  merchant: 'Long Shop',
  description: 'Long Shop',
  receiptItems: [{ description: 'Milk', totalPrice: 99.9 }],
  fingerprint: 'fparts',
  scanAttestation: 'attparts',
});

const PHONE = '48123456789';
function state(over: Partial<WhatsAppUserState> = {}): WhatsAppUserState {
  return {
    userId: 'user-1',
    accountId: 'acc-1',
    accountRole: 'editor',
    conversationId: null,
    currencyCode: 'PLN',
    language: 'en',
    waPhoneNumber: PHONE,
    ...over,
  };
}
const image = (): WaMediaMessage => ({ from: PHONE, id: 'm', timestamp: '0', type: 'image', image: { id: 'media', mime_type: 'image/jpeg' } });
const doc = (mime: string): WaMediaMessage => ({
  from: PHONE,
  id: 'm',
  timestamp: '0',
  type: 'document',
  document: { id: 'media', mime_type: mime },
});

function setup() {
  const { redis, cache } = makeStores();
  const ocr = {
    parseReceipt: jest.fn().mockResolvedValue(baseReceipt()),
    parseReceiptPdf: jest.fn().mockResolvedValue(baseReceipt()),
    parseReceiptParts: jest.fn().mockResolvedValue(longShop()),
  };
  const expenses = { create: jest.fn().mockResolvedValue({ expense: { id: 'exp-1' } }) };
  const subs = {
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
    refundAiUsage: jest.fn().mockResolvedValue(undefined),
  };
  const client = {
    downloadMedia: jest.fn().mockResolvedValue({ buffer: Buffer.from('photo'), mimeType: 'image/jpeg' }),
    sendText: jest.fn().mockResolvedValue(undefined),
    sendButtons: jest.fn().mockResolvedValue(undefined),
    sendList: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new PhotoHandler(
    ocr as never,
    expenses as never,
    subs as never,
    { create: jest.fn() } as never,
    { reconcileWithReceipt: jest.fn().mockResolvedValue({ checkedLabels: [] }) } as never,
    client as never,
    { recordExternalWrite: jest.fn().mockResolvedValue(null) } as never,
    { updateConversationId: jest.fn().mockResolvedValue(undefined) } as never,
    redis as never,
    cache as never,
  );
  return { handler, ocr, expenses, subs, client, redis, cache };
}
type H = ReturnType<typeof setup>;

const ids = (h: H, call: number): string[] =>
  (h.client.sendButtons.mock.calls[call][2] as Array<{ id: string }>).map((b) => b.id);
const pointer = `wa:receipt-latest:${PHONE}:${PHONE}`;

async function sendPhoto(h: H, content: string, s = state()) {
  h.client.downloadMedia.mockResolvedValueOnce({ buffer: Buffer.from(content), mimeType: 'image/jpeg' });
  await h.handler.handleImage(image(), s);
}

/** Scan photo 1, then send photo 2; returns the receipt id and the question's ids. */
async function scanThenSecond(h: H) {
  await sendPhoto(h, 'part-one');
  const receiptId = ids(h, 0)[0].split('--')[1];
  await sendPhoto(h, 'part-two');
  const [part, fresh] = ids(h, 1);
  const [, rid, tmpId] = part.split('--');
  return { receiptId, part, fresh, rid, tmpId, freshTmp: fresh.split('--')[1] };
}

describe('WhatsApp PhotoHandler — long receipt in several photos', () => {
  it('single photo with no pointer scans immediately (unchanged)', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');

    expect(h.subs.trackAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(h.ocr.parseReceipt).toHaveBeenCalledWith(b64('part-one'), 'user-1', 'acc-1');
    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.client.sendButtons).toHaveBeenCalledTimes(1);
    expect(ids(h, 0)[0]).toMatch(/^receipt_add--/);
    expect(await h.cache.get(pointer)).toBe(ids(h, 0)[0].split('--')[1]);
  });

  it('a single photo saves with no extra parts', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await h.handler.handleReceiptAddCallback(ids(h, 0)[0].split('--')[1], state());

    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.receiptImageBase64).toBe(b64('part-one'));
    expect(dto.receiptMimeType).toBe('image/jpeg');
    expect(dto.receiptImageParts).toBeUndefined();
    expect(dto.receiptFingerprint).toBe('f1');
  });

  it('photo with a live pointer asks the question', async () => {
    const h = setup();
    const { receiptId, part, fresh, tmpId } = await scanThenSecond(h);

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(1);
    expect(h.client.sendButtons.mock.calls[1][1]).toBe(t('receiptContinuationQuestion', 'en'));
    expect(part).toBe(`receipt_part--${receiptId}--${tmpId}`);
    expect(fresh).toBe(`receipt_new--${tmpId}`);
    const titles = (h.client.sendButtons.mock.calls[1][2] as Array<{ title: string }>).map((b) => b.title);
    expect(titles).toEqual([t('receiptContinuationYes', 'en'), t('receiptContinuationNo', 'en')]);
    expect(await h.cache.get(`wa:scan:${tmpId}`)).toMatchObject({ base64: b64('part-two') });
  });

  it('continuation re-reads all parts in one call and replaces the card', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).toHaveBeenCalledTimes(1);
    expect(h.ocr.parseReceiptParts.mock.calls[0][0]).toEqual([
      { imageBase64: b64('part-one'), mimeType: 'image/jpeg' },
      { imageBase64: b64('part-two'), mimeType: 'image/jpeg' },
    ]);
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(2);
    const data = await h.cache.get(`wa:receipt:${receiptId}`);
    expect(data.amount).toBe(99.9);
    expect(data.items).toEqual([{ description: 'Milk', totalPrice: 99.9 }]);
    expect(data.receiptFingerprint).toBe('fparts');
    expect(data.scanAttestation).toBe('attparts');
    expect(data.parts).toHaveLength(2);

    // WhatsApp cannot edit a message: the card is sent again, for the same receipt.
    const last = h.client.sendButtons.mock.calls.length - 1;
    expect(h.client.sendButtons.mock.calls[last][1]).toContain('99.9');
    expect(ids(h, last)).toEqual([
      `receipt_add--${receiptId}`,
      `receipt_edit--${receiptId}`,
      `receipt_cancel--${receiptId}`,
    ]);
    expect(await h.cache.get(`wa:scan:${tmpId}`)).toBeNull();
  });

  it('save passes receiptImageParts', async () => {
    const h = setup();
    const { rid, tmpId } = await scanThenSecond(h);
    await h.handler.handlePartCallback(rid, tmpId, state());

    await h.handler.handleReceiptAddCallback(rid, state());

    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.receiptImageBase64).toBe(b64('part-one'));
    expect(dto.receiptImageParts).toEqual([{ imageBase64: b64('part-two'), mimeType: 'image/jpeg' }]);
    expect(dto.receiptFingerprint).toBe('fparts');
    expect(dto.scanAttestation).toBe('attparts');
    expect(dto.amount).toBe(99.9);
    expect(await h.cache.get(pointer)).toBeNull();
  });

  it('new receipt scans the photo alone', async () => {
    const h = setup();
    const { freshTmp } = await scanThenSecond(h);

    await h.handler.handleNewReceiptCallback(freshTmp, state());

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(h.ocr.parseReceipt.mock.calls[1][0]).toBe(b64('part-two'));
    expect(await h.cache.get(`wa:scan:${freshTmp}`)).toBeNull();
  });

  it("pointer is per chat and user — another number's photo is not offered as continuation", async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await sendPhoto(h, 'other', state({ userId: 'user-b', waPhoneNumber: '48999999999' }));

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(ids(h, 1)[0]).toMatch(/^receipt_add--/);
  });

  it('another user cannot answer the question for the photo owner', async () => {
    const h = setup();
    const { rid, tmpId, freshTmp } = await scanThenSecond(h);
    const bob = state({ userId: 'user-b', waPhoneNumber: '48999999999' });

    await h.handler.handlePartCallback(rid, tmpId, bob);
    await h.handler.handleNewReceiptCallback(freshTmp, bob);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(await h.cache.get(`wa:scan:${tmpId}`)).not.toBeNull();
  });

  it('refuses a fifth part, refunds its charge and leaves the receipt as it was', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    const data = await h.cache.get(`wa:receipt:${receiptId}`);
    data.parts = [1, 2, 3, 4].map((i) => ({ imageBase64: b64(`p${i}`), mimeType: 'image/jpeg' }));
    await h.cache.set(`wa:receipt:${receiptId}`, data, 1800);

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptPartsFull', 'en', { max: '4' }));
    expect((await h.cache.get(`wa:receipt:${receiptId}`)).parts).toHaveLength(4);
  });

  it('does not add the part when the AI limit refuses its charge', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.subs.trackAiUsage.mockRejectedValueOnce(new ForbiddenException('limit'));

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).not.toHaveBeenCalled();
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('aiLimitReached', 'en'));
    expect((await h.cache.get(`wa:receipt:${receiptId}`)).parts).toHaveLength(1);
    expect(await h.cache.get(`wa:scan:${tmpId}`)).not.toBeNull();
  });

  it('rolls the part back when the combined read fails', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new Error('model down'));

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptScanFailed', 'en'));
    const data = await h.cache.get(`wa:receipt:${receiptId}`);
    expect(data.parts).toHaveLength(1);
    expect(data.amount).toBe(42.5);
  });

  it('a part the reader refuses (BadRequest) is refunded and rolled back', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new BadRequestException('parts_mime'));

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.subs.refundAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptScanFailed', 'en'));
    expect((await h.cache.get(`wa:receipt:${receiptId}`)).parts).toHaveLength(1);
  });

  it('answers expired when the pending receipt is gone before the continuation tap', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    await h.handler.handleReceiptCancelCallback(receiptId, state());

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).toHaveBeenCalledTimes(1);
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('scanRequestExpired', 'en'));
    expect(await h.cache.get(pointer)).toBeNull();
  });

  it('continuation leaves item-edit and date-edit modes, since the card is replaced', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.redis.store.set(`wa:awaiting_item_edit:${PHONE}`, receiptId);
    h.redis.store.set(`wa:awaiting_date:${PHONE}`, receiptId);

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.redis.store.has(`wa:awaiting_item_edit:${PHONE}`)).toBe(false);
    expect(h.redis.store.has(`wa:awaiting_date:${PHONE}`)).toBe(false);
  });

  it('viewers are refused before any question is asked', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await sendPhoto(h, 'part-two', state({ accountRole: 'viewer' }));

    expect(h.client.sendButtons).toHaveBeenCalledTimes(1);
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('viewerRestricted', 'en'));
  });

  it('a PDF scan never becomes part 1 of a multi-photo receipt', async () => {
    const h = setup();
    h.client.downloadMedia.mockResolvedValueOnce({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' });
    await h.handler.handleDocument(doc('application/pdf'), state());
    expect(await h.cache.get(pointer)).toBeNull();

    await sendPhoto(h, 'part-one');
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(ids(h, 1)[0]).toMatch(/^receipt_add--/);
  });

  it('a document of a type the parts reader does not accept never becomes part 1', async () => {
    const h = setup();
    await h.handler.handleDocument(doc('image/gif'), state());
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(await h.cache.get(pointer)).toBeNull();
  });

  it('a part-1 photo over the part cap sets no pointer', async () => {
    const h = setup();
    h.client.downloadMedia.mockResolvedValueOnce({ buffer: Buffer.alloc(1_572_865), mimeType: 'image/jpeg' });
    await h.handler.handleImage(image(), state());
    expect(await h.cache.get(pointer)).toBeNull();
  });

  it('while a receipt is pending, a photo that cannot be a part is refused: no new scan, no charge', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    const receiptId = ids(h, 0)[0].split('--')[1];
    h.client.downloadMedia.mockResolvedValueOnce({ buffer: Buffer.alloc(1_572_865), mimeType: 'image/jpeg' });

    await h.handler.handleImage(image(), state());

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(1);
    expect(h.client.sendButtons).toHaveBeenCalledTimes(1);
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptPartTooLarge', 'en'));
    expect((await h.cache.get(`wa:receipt:${receiptId}`)).parts).toHaveLength(1);
    expect(await h.cache.get(pointer)).toBe(receiptId);
  });

  it('a pending receipt that already has 4 parts gets no question: the photo is a new receipt', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    const receiptId = ids(h, 0)[0].split('--')[1];
    const data = await h.cache.get(`wa:receipt:${receiptId}`);
    data.parts = [1, 2, 3, 4].map((i) => ({ imageBase64: b64(`p${i}`), mimeType: 'image/jpeg' }));
    await h.cache.set(`wa:receipt:${receiptId}`, data, 1800);

    await sendPhoto(h, 'part-five');

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(ids(h, 1)[0]).toMatch(/^receipt_add--/);
  });

  it('refreshes the pointer TTL when a part is added', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.cache.set.mockClear();

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.cache.set).toHaveBeenCalledWith(pointer, receiptId, 1800);
  });

  // ── Interleaving: one action at a time owns the receipt ──────────────────

  async function startSlowContinuation(h: H) {
    const q = await scanThenSecond(h);
    const read = deferred<unknown>();
    h.ocr.parseReceiptParts.mockImplementationOnce(() => read.promise);
    const running = h.handler.handlePartCallback(q.rid, q.tmpId, state());
    await flush();
    expect(h.ocr.parseReceiptParts).toHaveBeenCalledTimes(1);
    return { ...q, read, running };
  }

  it('a save tapped during a continuation read is refused, and works once the read is done', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);

    await h.handler.handleReceiptAddCallback(receiptId, state());
    expect(h.expenses.create).not.toHaveBeenCalled();
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    await h.handler.handleReceiptAddCallback(receiptId, state());
    expect(h.expenses.create).toHaveBeenCalledTimes(1);
    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.amount).toBe(99.9);
    expect(dto.receiptImageParts).toHaveLength(1);
  });

  it('a cancel tapped during a continuation read is refused', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);

    await h.handler.handleReceiptCancelCallback(receiptId, state());
    expect(await h.cache.get(`wa:receipt:${receiptId}`)).not.toBeNull();
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    await h.handler.handleReceiptCancelCallback(receiptId, state());
    expect(await h.cache.get(`wa:receipt:${receiptId}`)).toBeNull();
  });

  it('a second continuation while the first is reading is refused, uncharged, and its photo kept', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await sendPhoto(h, 'part-two');
    await sendPhoto(h, 'part-three');
    const [, rid, tmp2] = ids(h, 1)[0].split('--');
    const [, , tmp3] = ids(h, 2)[0].split('--');
    const read = deferred<unknown>();
    h.ocr.parseReceiptParts.mockImplementationOnce(() => read.promise);

    const first = h.handler.handlePartCallback(rid, tmp2, state());
    await flush();
    await h.handler.handlePartCallback(rid, tmp3, state());

    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(2);
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptBusy', 'en'));
    expect(await h.cache.get(`wa:scan:${tmp3}`)).not.toBeNull();

    read.resolve(longShop());
    await first;
    await h.handler.handlePartCallback(rid, tmp3, state());
    expect(h.ocr.parseReceiptParts.mock.calls[1][0].map((p: { imageBase64: string }) => p.imageBase64)).toEqual([
      b64('part-one'),
      b64('part-two'),
      b64('part-three'),
    ]);
  });

  it('a receipt gone during the read is neither rewritten nor shown again', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);
    const cards = h.client.sendButtons.mock.calls.length;
    h.redis.store.delete(`wa:receipt:${receiptId}`);

    read.resolve(longShop());
    await running;

    expect(await h.cache.get(`wa:receipt:${receiptId}`)).toBeNull();
    expect(h.client.sendButtons.mock.calls.length).toBe(cards);
  });

  it('a typed line correction during a continuation read waits, and never drops the new part', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);
    h.redis.store.set(`wa:awaiting_item_edit:${PHONE}`, receiptId);

    expect(await h.handler.handleItemEditInput('= 5.00', state())).toBe(true);
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    const data = await h.cache.get(`wa:receipt:${receiptId}`);
    expect(data.parts).toHaveLength(2);
    expect(data.receiptFingerprint).toBe('fparts');
  });

  it('a typed date during a continuation read waits, and never drops the new part', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);
    h.redis.store.set(`wa:awaiting_date:${PHONE}`, receiptId);

    expect(await h.handler.handleDateInput('01.02.2026', state())).toBe(true);
    expect(h.client.sendText).toHaveBeenLastCalledWith(PHONE, t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    expect((await h.cache.get(`wa:receipt:${receiptId}`)).parts).toHaveLength(2);
  });

  it('a date typed after a continuation lands on the fresh receipt, parts kept', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    await h.handler.handlePartCallback(rid, tmpId, state());
    h.redis.store.set(`wa:awaiting_date:${PHONE}`, receiptId);

    expect(await h.handler.handleDateInput('01.02.2026', state())).toBe(true);

    const data = await h.cache.get(`wa:receipt:${receiptId}`);
    expect(data.date).toBe('2026-02-01');
    expect(data.parts).toHaveLength(2);
    expect(data.amount).toBe(99.9);
  });

  it('releases the lock after a continuation, so the receipt is usable again', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);
    read.resolve(longShop());
    await running;
    expect(await h.cache.get(`wa:receipt-busy:${receiptId}`)).toBeNull();
  });
});
