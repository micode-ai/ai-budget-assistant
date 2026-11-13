import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PhotoHandler } from './photo.handler';
import type { SlackFile, SlackUserState } from '../types';
import { t } from '../helpers/i18n';

/**
 * One in-memory Redis behind both clients the handler uses: the bot's own
 * ioredis (`slack:receipt:*` as JSON strings) and CacheService (parts, pointer,
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

const TEAM = 'T1';
const CHANNEL = 'D1';
function state(over: Partial<SlackUserState> = {}): SlackUserState {
  return {
    userId: 'user-1',
    accountId: 'acc-1',
    accountRole: 'editor',
    conversationId: null,
    currencyCode: 'PLN',
    language: 'en',
    slackUserId: 'U1',
    slackTeamId: TEAM,
    channel: CHANNEL,
    ...over,
  };
}
let fileSeq = 0;
const file = (mimetype = 'image/jpeg'): SlackFile => ({
  id: `F${++fileSeq}`,
  mimetype,
  url_private_download: 'https://files.slack.example/x',
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
  let ts = 0;
  const client = {
    downloadFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('photo'), mimeType: 'image/jpeg' }),
    sendText: jest.fn().mockResolvedValue(undefined),
    sendButtons: jest.fn().mockResolvedValue(undefined),
    postPlaceholder: jest.fn().mockImplementation(async () => `ts-${++ts}`),
    replyText: jest.fn().mockResolvedValue(undefined),
    replyButtons: jest.fn().mockResolvedValue(undefined),
    updateButtons: jest.fn().mockResolvedValue(undefined),
    updateText: jest.fn().mockResolvedValue(undefined),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
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

type Btn = { id: string; title: string };
/** Ids on the n-th confirm card (posted into the placeholder through replyButtons). */
const cardIds = (h: H, n: number): string[] => (h.client.replyButtons.mock.calls[n][4] as Btn[]).map((b) => b.id);
/** Ids on the n-th plain button message (questions, re-sent cards). */
const msgIds = (h: H, n: number): string[] => (h.client.sendButtons.mock.calls[n][3] as Btn[]).map((b) => b.id);
const pointer = `slack:receipt-latest:${CHANNEL}:U1`;

async function sendPhoto(h: H, content: string, s = state()) {
  h.client.downloadFile.mockResolvedValueOnce({ buffer: Buffer.from(content), mimeType: 'image/jpeg' });
  await h.handler.handleImage(file(), s);
}

/** Scan photo 1, then send photo 2; returns the receipt id and the question's ids. */
async function scanThenSecond(h: H) {
  await sendPhoto(h, 'part-one');
  const receiptId = cardIds(h, 0)[0].split(':')[1];
  await sendPhoto(h, 'part-two');
  const [part, fresh] = msgIds(h, 0);
  const [, rid, tmpId] = part.split(':');
  return { receiptId, part, fresh, rid, tmpId, freshTmp: fresh.split(':')[1] };
}

describe('Slack PhotoHandler — long receipt in several photos', () => {
  it('single photo with no pointer scans immediately (unchanged)', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');

    expect(h.subs.trackAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(h.ocr.parseReceipt).toHaveBeenCalledWith(b64('part-one'), 'user-1', 'acc-1');
    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.client.replyButtons).toHaveBeenCalledTimes(1);
    expect(h.client.sendButtons).not.toHaveBeenCalled();
    expect(cardIds(h, 0)[0]).toMatch(/^receipt_add:/);
    expect(await h.cache.get(pointer)).toBe(cardIds(h, 0)[0].split(':')[1]);
  });

  it('a single photo saves with no extra parts', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await h.handler.handleReceiptAddCallback(cardIds(h, 0)[0].split(':')[1], state());

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
    expect(h.client.sendButtons.mock.calls[0][2]).toBe(t('receiptContinuationQuestion', 'en'));
    expect(part).toBe(`receipt_part:${receiptId}:${tmpId}`);
    expect(fresh).toBe(`receipt_new:${tmpId}`);
    expect(await h.cache.get(`slack:scan:${tmpId}`)).toMatchObject({ base64: b64('part-two') });
  });

  it('slack message with 2 images: first scans, second asks continuation', async () => {
    const h = setup();
    h.client.downloadFile
      .mockResolvedValueOnce({ buffer: Buffer.from('part-one'), mimeType: 'image/jpeg' })
      .mockResolvedValueOnce({ buffer: Buffer.from('part-two'), mimeType: 'image/jpeg' });

    await h.handler.handleImages([file(), file()], state());

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(h.ocr.parseReceipt.mock.calls[0][0]).toBe(b64('part-one'));
    const receiptId = cardIds(h, 0)[0].split(':')[1];
    expect(msgIds(h, 0)[0]).toMatch(new RegExp(`^receipt_part:${receiptId}:`));
    const tmpId = msgIds(h, 0)[1].split(':')[1];
    expect(await h.cache.get(`slack:scan:${tmpId}`)).toMatchObject({ base64: b64('part-two') });
  });

  it('continuation re-reads all parts in one call and posts the new card at the bottom', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).toHaveBeenCalledTimes(1);
    expect(h.ocr.parseReceiptParts.mock.calls[0][0]).toEqual([
      { imageBase64: b64('part-one'), mimeType: 'image/jpeg' },
      { imageBase64: b64('part-two'), mimeType: 'image/jpeg' },
    ]);
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(2);
    const data = await h.cache.get(`slack:receipt:${receiptId}`);
    expect(data.amount).toBe(99.9);
    expect(data.items).toEqual([{ description: 'Milk', totalPrice: 99.9 }]);
    expect(data.receiptFingerprint).toBe('fparts');
    expect(data.scanAttestation).toBe('attparts');
    expect(data.parts).toHaveLength(2);

    // Not an in-place update: the old card (above the question) is deleted and the
    // new one posted below, where the user is looking.
    expect(h.client.updateButtons).not.toHaveBeenCalled();
    expect(h.client.deleteMessage).toHaveBeenCalledWith(TEAM, CHANNEL, 'ts-1'); // the first card's message
    const last = h.client.sendButtons.mock.calls.length - 1;
    expect(h.client.sendButtons.mock.calls[last][2]).toContain('99.9');
    expect((h.client.sendButtons.mock.calls[last][3] as Btn[])[0].id).toBe(`receipt_add:${receiptId}`);
    expect(await h.cache.get(`slack:scan:${tmpId}`)).toBeNull();
  });

  it('the tapped question turns into a "reading" note at once and is deleted when the card is posted', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    h.client.sendButtons.mockResolvedValueOnce('ts-q'); // the continuation question
    await sendPhoto(h, 'part-two');
    const [, rid, tmpId] = msgIds(h, h.client.sendButtons.mock.calls.length - 1)[0].split(':');

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.client.updateText).toHaveBeenCalledWith(TEAM, CHANNEL, 'ts-q', t('receiptPartsReading', 'en'));
    expect(h.client.deleteMessage).toHaveBeenCalledWith(TEAM, CHANNEL, 'ts-q');
  });

  it('still posts the new card when the old one cannot be deleted', async () => {
    const h = setup();
    const { rid, tmpId } = await scanThenSecond(h);
    h.client.deleteMessage.mockRejectedValueOnce(new Error('message_not_found'));

    await h.handler.handlePartCallback(rid, tmpId, state());

    const last = h.client.sendButtons.mock.calls.length - 1;
    expect(h.client.sendButtons.mock.calls[last][2]).toContain('99.9');
    expect(msgIds(h, last)[0]).toBe(`receipt_add:${rid}`);
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
    expect(await h.cache.get(`slack:scan:${freshTmp}`)).toBeNull();
  });

  it("pointer is per chat and user — another user's photo is not offered as continuation", async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await sendPhoto(h, 'other', state({ userId: 'user-b', slackUserId: 'U2' }));
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);

    // The same user in another channel starts fresh too.
    await sendPhoto(h, 'elsewhere', state({ channel: 'C9' }));
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(3);
    expect(h.client.sendButtons).not.toHaveBeenCalled();
  });

  it('another user cannot answer the question for the photo owner', async () => {
    const h = setup();
    const { rid, tmpId, freshTmp } = await scanThenSecond(h);
    const bob = state({ userId: 'user-b', slackUserId: 'U2' });

    await h.handler.handlePartCallback(rid, tmpId, bob);
    await h.handler.handleNewReceiptCallback(freshTmp, bob);

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(await h.cache.get(`slack:scan:${tmpId}`)).not.toBeNull();
  });

  it('refuses a fifth part, refunds its charge and leaves the receipt as it was', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    const data = await h.cache.get(`slack:receipt:${receiptId}`);
    data.parts = [1, 2, 3, 4].map((i) => ({ imageBase64: b64(`p${i}`), mimeType: 'image/jpeg' }));
    await h.cache.set(`slack:receipt:${receiptId}`, data, 1800);

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptPartsFull', 'en', { max: '4' }));
    expect((await h.cache.get(`slack:receipt:${receiptId}`)).parts).toHaveLength(4);
  });

  it('does not add the part when the AI limit refuses its charge', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.subs.trackAiUsage.mockRejectedValueOnce(new ForbiddenException('limit'));

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).not.toHaveBeenCalled();
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('aiLimitReached', 'en'));
    expect((await h.cache.get(`slack:receipt:${receiptId}`)).parts).toHaveLength(1);
    expect(await h.cache.get(`slack:scan:${tmpId}`)).not.toBeNull();
  });

  it('rolls the part back when the combined read fails', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new Error('model down'));

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptScanFailed', 'en'));
    const data = await h.cache.get(`slack:receipt:${receiptId}`);
    expect(data.parts).toHaveLength(1);
    expect(data.amount).toBe(42.5);
  });

  it('a part the reader refuses (BadRequest) is refunded and rolled back', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.ocr.parseReceiptParts.mockRejectedValueOnce(new BadRequestException('parts_mime'));

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.subs.refundAiUsage).toHaveBeenCalledWith('user-1', 'ocr', 2.0, 'acc-1');
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptScanFailed', 'en'));
    expect((await h.cache.get(`slack:receipt:${receiptId}`)).parts).toHaveLength(1);
  });

  it('answers expired when the pending receipt is gone before the continuation tap', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    await h.handler.handleReceiptCancelCallback(receiptId, state());

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(h.subs.refundAiUsage).toHaveBeenCalledTimes(1);
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('scanRequestExpired', 'en'));
    expect(await h.cache.get(pointer)).toBeNull();
  });

  it('continuation leaves item-edit and date-edit modes, since the card is replaced', async () => {
    const h = setup();
    const { receiptId, rid, tmpId } = await scanThenSecond(h);
    h.redis.store.set('slack:awaiting_item_edit:U1', receiptId);
    h.redis.store.set('slack:awaiting_date:U1', receiptId);

    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.redis.store.has('slack:awaiting_item_edit:U1')).toBe(false);
    expect(h.redis.store.has('slack:awaiting_date:U1')).toBe(false);
  });

  it('viewers are refused before any question is asked', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await sendPhoto(h, 'part-two', state({ accountRole: 'viewer' }));

    expect(h.client.sendButtons).not.toHaveBeenCalled();
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('viewerRestricted', 'en'));
  });

  it('a PDF scan never becomes part 1 of a multi-photo receipt', async () => {
    const h = setup();
    h.client.downloadFile.mockResolvedValueOnce({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' });
    await h.handler.handleDocument(file('application/pdf'), state());
    expect(await h.cache.get(pointer)).toBeNull();

    await sendPhoto(h, 'part-one');
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(h.client.sendButtons).not.toHaveBeenCalled();
  });

  it('an image type the parts reader does not accept never becomes part 1', async () => {
    const h = setup();
    h.client.downloadFile.mockResolvedValueOnce({ buffer: Buffer.from('gif'), mimeType: 'image/gif' });
    await h.handler.handleImage(file('image/gif'), state());
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(await h.cache.get(pointer)).toBeNull();
  });

  it('a part-1 photo over the part cap sets no pointer', async () => {
    const h = setup();
    h.client.downloadFile.mockResolvedValueOnce({ buffer: Buffer.alloc(1_572_865), mimeType: 'image/jpeg' });
    await h.handler.handleImage(file(), state());
    expect(await h.cache.get(pointer)).toBeNull();
  });

  it('while a receipt is pending, an over-cap image with no thumbnail is refused: no new scan, no charge', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    const receiptId = cardIds(h, 0)[0].split(':')[1];
    h.client.downloadFile.mockResolvedValueOnce({ buffer: Buffer.alloc(1_572_865), mimeType: 'image/jpeg' });

    await h.handler.handleImage(file(), state());

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(1);
    expect(h.client.sendButtons).not.toHaveBeenCalled();
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptPartTooLarge', 'en'));
    expect((await h.cache.get(`slack:receipt:${receiptId}`)).parts).toHaveLength(1);
    expect(await h.cache.get(pointer)).toBe(receiptId);
  });

  // ── Phone originals over the cap: the Slack thumbnail is the part ──────────

  const BIG = 3 * 1024 * 1024;
  const jpeg = (tag: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(tag)]);
  /** A 3 MB phone photo with Slack thumbnails; downloads are served by URL. */
  function bigPhoto(n: number, thumbs: { t1024?: boolean; t720?: boolean } = { t1024: true }): SlackFile {
    return {
      id: `F-big-${n}`,
      mimetype: 'image/jpeg',
      url_private_download: `https://files.slack.com/orig-${n}`,
      thumb_1024: thumbs.t1024 ? `https://files.slack.com/t1024-${n}` : undefined,
      thumb_720: thumbs.t720 ? `https://files.slack.com/t720-${n}` : undefined,
    };
  }
  function serve(h: H, bodies: Record<string, Buffer>) {
    h.client.downloadFile.mockImplementation(async (_team: string, url: string) => ({
      buffer: bodies[url.split('/').pop()!],
      mimeType: 'image/jpeg',
    }));
  }
  const orig = (n: number) => Buffer.alloc(BIG, n);

  it('slack message with 2 photos of 3 MB: parts via thumbnails, then the continuation question', async () => {
    const h = setup();
    serve(h, { 'orig-1': orig(1), 'orig-2': orig(2), 't1024-1': jpeg('thumb-1'), 't1024-2': jpeg('thumb-2') });

    await h.handler.handleImages([bigPhoto(1), bigPhoto(2)], state());

    // The scan reads the original, exactly as before.
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(h.ocr.parseReceipt.mock.calls[0][0]).toBe(orig(1).toString('base64'));
    const receiptId = cardIds(h, 0)[0].split(':')[1];
    expect(await h.cache.get(pointer)).toBe(receiptId);
    const [part] = msgIds(h, 0);
    const [, rid, tmpId] = part.split(':');
    expect(rid).toBe(receiptId);

    await h.handler.handlePartCallback(rid, tmpId, state());
    expect(h.ocr.parseReceiptParts.mock.calls[0][0]).toEqual([
      { imageBase64: jpeg('thumb-1').toString('base64'), mimeType: 'image/jpeg' },
      { imageBase64: jpeg('thumb-2').toString('base64'), mimeType: 'image/jpeg' },
    ]);

    // A multi-part receipt saves the parts it read (so its fingerprint matches).
    await h.handler.handleReceiptAddCallback(rid, state());
    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.receiptImageBase64).toBe(jpeg('thumb-1').toString('base64'));
    expect(dto.receiptImageParts).toEqual([{ imageBase64: jpeg('thumb-2').toString('base64'), mimeType: 'image/jpeg' }]);
  });

  it('a lone 3 MB photo fetches its thumbnail (pointer set); a second 3 MB photo in a separate message asks the continuation question', async () => {
    const h = setup();
    serve(h, { 'orig-1': orig(1), 'orig-2': orig(2), 't1024-1': jpeg('thumb-1'), 't1024-2': jpeg('thumb-2') });
    await h.handler.handleImage(bigPhoto(1), state());
    const receiptId = cardIds(h, 0)[0].split(':')[1];
    expect(h.client.downloadFile).toHaveBeenCalledTimes(2);
    expect(await h.cache.get(pointer)).toBe(receiptId);
    expect((await h.cache.get(`slack:receipt:${receiptId}`)).parts[0].imageBase64).toBe(jpeg('thumb-1').toString('base64'));

    await h.handler.handleImage(bigPhoto(2), state());
    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(1);
    expect(msgIds(h, 0)[0].split(':')[1]).toBe(receiptId);
  });

  it('a single 3 MB photo still saves its original', async () => {
    const h = setup();
    serve(h, { 'orig-1': orig(1), 't1024-1': jpeg('thumb-1') });
    await h.handler.handleImage(bigPhoto(1), state());
    await h.handler.handleReceiptAddCallback(cardIds(h, 0)[0].split(':')[1], state());

    const dto = h.expenses.create.mock.calls[0][2];
    expect(dto.receiptImageBase64).toBe(orig(1).toString('base64'));
    expect(dto.receiptImageParts).toBeUndefined();
    expect(dto.receiptMimeType).toBe('image/jpeg');
  });

  it('falls back to the 720 thumbnail when the 1024 one is still over the cap', async () => {
    const h = setup();
    serve(h, { 'orig-1': orig(1), 't1024-1': Buffer.alloc(1_572_865), 't720-1': jpeg('thumb-720') });
    await h.handler.handleImage(bigPhoto(1, { t1024: true, t720: true }), state());
    const receiptId = cardIds(h, 0)[0].split(':')[1];
    expect((await h.cache.get(`slack:receipt:${receiptId}`)).parts[0].imageBase64).toBe(
      jpeg('thumb-720').toString('base64'),
    );
  });

  // ── The newest card is the one a continuation updates ────────────────────

  it('a card posted by a continuation becomes the one the next continuation replaces', async () => {
    const h = setup();
    const { rid, tmpId } = await scanThenSecond(h);
    h.client.sendButtons.mockResolvedValueOnce('ts-new'); // the new card
    await h.handler.handlePartCallback(rid, tmpId, state());

    await sendPhoto(h, 'part-three');
    const [, , tmp3] = msgIds(h, h.client.sendButtons.mock.calls.length - 1)[0].split(':');
    await h.handler.handlePartCallback(rid, tmp3, state());

    expect(h.client.deleteMessage).toHaveBeenLastCalledWith(TEAM, CHANNEL, 'ts-new');
  });

  it('a card re-posted after a date change becomes the one a continuation replaces', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    const receiptId = cardIds(h, 0)[0].split(':')[1];
    h.redis.store.set('slack:awaiting_date:U1', receiptId);
    h.client.sendButtons.mockResolvedValueOnce('ts-date');
    expect(await h.handler.handleDateInput('01.02.2026', state())).toBe(true);

    await sendPhoto(h, 'part-two');
    const [, rid, tmpId] = msgIds(h, 1)[0].split(':');
    await h.handler.handlePartCallback(rid, tmpId, state());

    expect(h.client.deleteMessage).toHaveBeenLastCalledWith(TEAM, CHANNEL, 'ts-date');
  });

  it('a pending receipt that already has 4 parts gets no question: the photo is a new receipt', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    const receiptId = cardIds(h, 0)[0].split(':')[1];
    const data = await h.cache.get(`slack:receipt:${receiptId}`);
    data.parts = [1, 2, 3, 4].map((i) => ({ imageBase64: b64(`p${i}`), mimeType: 'image/jpeg' }));
    await h.cache.set(`slack:receipt:${receiptId}`, data, 1800);

    await sendPhoto(h, 'part-five');

    expect(h.ocr.parseReceipt).toHaveBeenCalledTimes(2);
    expect(h.client.sendButtons).not.toHaveBeenCalled();
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
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptBusy', 'en'));

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
    expect(await h.cache.get(`slack:receipt:${receiptId}`)).not.toBeNull();
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    await h.handler.handleReceiptCancelCallback(receiptId, state());
    expect(await h.cache.get(`slack:receipt:${receiptId}`)).toBeNull();
  });

  it('a second continuation while the first is reading is refused, uncharged, and its photo kept', async () => {
    const h = setup();
    await sendPhoto(h, 'part-one');
    await sendPhoto(h, 'part-two');
    await sendPhoto(h, 'part-three');
    const [, rid, tmp2] = msgIds(h, 0)[0].split(':');
    const [, , tmp3] = msgIds(h, 1)[0].split(':');
    const read = deferred<unknown>();
    h.ocr.parseReceiptParts.mockImplementationOnce(() => read.promise);

    const first = h.handler.handlePartCallback(rid, tmp2, state());
    await flush();
    await h.handler.handlePartCallback(rid, tmp3, state());

    expect(h.subs.trackAiUsage).toHaveBeenCalledTimes(2);
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptBusy', 'en'));
    expect(await h.cache.get(`slack:scan:${tmp3}`)).not.toBeNull();

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
    h.redis.store.delete(`slack:receipt:${receiptId}`);

    read.resolve(longShop());
    await running;

    expect(await h.cache.get(`slack:receipt:${receiptId}`)).toBeNull();
    expect(h.client.deleteMessage).not.toHaveBeenCalled();
    expect(h.client.sendButtons).toHaveBeenCalledTimes(1); // only the question
  });

  it('a typed line correction during a continuation read waits, and never drops the new part', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);
    h.redis.store.set('slack:awaiting_item_edit:U1', receiptId);

    expect(await h.handler.handleItemEditInput('= 5.00', state())).toBe(true);
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    const data = await h.cache.get(`slack:receipt:${receiptId}`);
    expect(data.parts).toHaveLength(2);
    expect(data.receiptFingerprint).toBe('fparts');
  });

  it('an Edit items tap during a continuation read waits, and never drops the new part', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);

    await h.handler.handleItemsCallback(receiptId, state());
    expect(h.client.sendText).toHaveBeenLastCalledWith(TEAM, CHANNEL, t('receiptBusy', 'en'));

    read.resolve(longShop());
    await running;
    expect((await h.cache.get(`slack:receipt:${receiptId}`)).parts).toHaveLength(2);
  });

  it('releases the lock after a continuation, so the receipt is usable again', async () => {
    const h = setup();
    const { receiptId, read, running } = await startSlowContinuation(h);
    read.resolve(longShop());
    await running;
    expect(await h.cache.get(`slack:receipt-busy:${receiptId}`)).toBeNull();
  });
});
