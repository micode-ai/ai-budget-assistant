import { PhotoHandler } from './photo.handler';
import { BotReceiptFuelService } from '../../../common/bot-receipt-fuel';
import { t } from '../helpers/i18n';

// "Add to fuel log" after a fuel receipt (ABA-830): the real shared core over an
// in-memory cache, with the vehicles service and the membership lookup stubbed.

jest.mock('../helpers/download-file', () => ({
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
    setIfAbsent: jest.fn(async (key: string) => {
      if (store.has(key)) return false;
      store.set(key, 1);
      return true;
    }),
  };
}

const FUEL = { litres: 40.5, pricePerLitre: 6.49, fuelType: 'petrol' as const };

function receipt(fuel: typeof FUEL | null) {
  return {
    amount: 262.85,
    discountAmount: null,
    currencyCode: 'PLN',
    description: 'Orlen',
    categoryId: null,
    merchant: 'Orlen',
    date: '2026-11-18',
    confidence: 0.9,
    receiptItems: [{ description: 'PB95', totalPrice: 262.85 }],
    location: null,
    fuel,
  };
}

function makeCtx(text?: string) {
  return {
    userState: { userId: 'user-1', accountId: 'acc-1', accountRole: 'editor', language: 'en' },
    from: { id: 123, language_code: 'en' },
    chat: { id: 123 },
    message: text !== undefined ? { text } : { document: { mime_type: 'application/pdf', file_id: 'F1' } },
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    telegram: {
      getFileLink: jest.fn().mockResolvedValue({ href: 'https://t.example/file.pdf' }),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
    },
    reply: jest.fn().mockResolvedValue({ message_id: 1 }),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
  };
}

type Ctx = ReturnType<typeof makeCtx>;

function setup(opts: { fuel?: typeof FUEL | null; vehicles?: { id: string; name: string; fuelType: string }[]; role?: string } = {}) {
  const cache = makeCache();
  const ocr = { parseReceipt: jest.fn(), parseReceiptPdf: jest.fn().mockResolvedValue(receipt(opts.fuel === undefined ? FUEL : opts.fuel)) };
  const expenses = {
    create: jest.fn().mockResolvedValue({ expense: { id: 'exp-1', amount: 262.85, currencyCode: 'PLN', description: 'Orlen' } }),
  };
  const vehicles = {
    findAll: jest.fn().mockResolvedValue(opts.vehicles ?? [{ id: 'veh-1', name: 'Octavia', fuelType: 'petrol' }]),
    lastFuelVehicleId: jest.fn().mockResolvedValue(null),
    upsertFuelLog: jest.fn().mockResolvedValue({ id: 'fl-1' }),
  };
  const prisma = { accountMember: { findFirst: jest.fn().mockResolvedValue({ role: opts.role ?? 'editor' }) } };
  const fuel = new BotReceiptFuelService(vehicles as never, prisma as never, cache as never);
  const handler = new PhotoHandler(
    ocr as never,
    expenses as never,
    { trackAiUsage: jest.fn().mockResolvedValue(undefined) } as never,
    { create: jest.fn() } as never,
    { reconcileWithReceipt: jest.fn().mockResolvedValue({ checkedLabels: [] }) } as never,
    cache as never,
    { recordExternalWrite: jest.fn().mockResolvedValue(null) } as never,
    { updateConversationId: jest.fn() } as never,
    undefined,
    fuel,
  );
  return { handler, cache, vehicles, prisma };
}

/** Scan + "Add expense"; returns the fuel offer id from the button's callback data (or null). */
async function scanAndSave(handler: PhotoHandler, ctx: Ctx): Promise<string | null> {
  await handler.handleDocument(ctx as never);
  const cardKb = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
  const receiptId = (cardKb[0][0].callback_data as string).split(':')[1];
  await handler.handleReceiptAddCallback(ctx as never, receiptId);
  const offerCall = ctx.reply.mock.calls.find((c) => c[1]?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('fuel_log:'));
  if (!offerCall) return null;
  return (offerCall[1].reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[1];
}

describe('Telegram PhotoHandler — "Add to fuel log" (ABA-830)', () => {
  it('offers the button with the vehicle name after a fuel receipt is saved', async () => {
    const { handler } = setup();
    const ctx = makeCtx();
    const offerId = await scanAndSave(handler, ctx);
    expect(offerId).toBeTruthy();
    const offerCall = ctx.reply.mock.calls.find((c) => String(c[0]).startsWith('⛽'))!;
    expect(offerCall[1].reply_markup.inline_keyboard[0][0].text).toBe('⛽ Add to fuel log (Octavia)');
    expect(offerCall[1].reply_markup.inline_keyboard[1][0].callback_data).toBe(`fuel_skip:${offerId}`);
  });

  it('shows no button without a fuel block, or when no vehicle resolves', async () => {
    for (const opts of [{ fuel: null }, { vehicles: [] }, {
      vehicles: [
        { id: 'a', name: 'A', fuelType: 'petrol' },
        { id: 'b', name: 'B', fuelType: 'petrol' },
      ],
    }]) {
      const { handler } = setup(opts);
      expect(await scanAndSave(handler, makeCtx())).toBeNull();
    }
  });

  it('button → typed odometer → fuel log written, then chat is free again', async () => {
    const { handler, vehicles, cache } = setup();
    const ctx = makeCtx();
    const offerId = (await scanAndSave(handler, ctx))!;

    await handler.handleFuelLogCallback(ctx as never, offerId);
    expect(ctx.reply).toHaveBeenLastCalledWith(
      t('fuelLogAskOdometer', 'en', { vehicle: 'Octavia', litres: '40.5', price: '6.49 PLN' }),
      expect.anything(),
    );

    const input = makeCtx('123456');
    expect(await handler.handleFuelOdometerInput(input as never)).toBe(true);
    expect(vehicles.upsertFuelLog).toHaveBeenCalledWith('acc-1', 'veh-1', 'exp-1', {
      liters: 40.5,
      odometerKm: 123456,
      isFullTank: true,
    });
    expect(input.reply.mock.calls[0][0]).toContain('123456 km');
    expect([...cache.store.keys()].some((k) => k.startsWith('telegram:awaiting_fuel_odo:'))).toBe(false);

    // The next message reaches the chat.
    expect(await handler.handleFuelOdometerInput(makeCtx('7') as never)).toBe(false);
  });

  it('arming the odometer prompt clears the item-edit and date modes (mutually exclusive)', async () => {
    const { handler, cache } = setup();
    const ctx = makeCtx();
    const offerId = (await scanAndSave(handler, ctx))!;
    cache.store.set('telegram:awaiting_item_edit:123', 'r1');
    cache.store.set('telegram:awaiting_date:123', 'r1');
    await handler.handleFuelLogCallback(ctx as never, offerId);
    expect(cache.store.has('telegram:awaiting_item_edit:123')).toBe(false);
    expect(cache.store.has('telegram:awaiting_date:123')).toBe(false);
    expect(cache.store.get('telegram:awaiting_fuel_odo:123')).toBe(offerId);
  });

  it('entering item-edit on a new receipt clears an armed odometer prompt', async () => {
    const { handler, cache } = setup();
    const ctx = makeCtx();
    const offerId = (await scanAndSave(handler, ctx))!;
    await handler.handleFuelLogCallback(ctx as never, offerId);

    const ctx2 = makeCtx();
    await handler.handleDocument(ctx2 as never);
    const receiptId = (ctx2.reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[1];
    await handler.handleItemsCallback(ctx2 as never, receiptId);
    expect(cache.store.has('telegram:awaiting_fuel_odo:123')).toBe(false);
  });

  it('a chat message with no digit is not swallowed by the prompt', async () => {
    const { handler, vehicles } = setup();
    const ctx = makeCtx();
    await handler.handleFuelLogCallback(ctx as never, (await scanAndSave(handler, ctx))!);
    expect(await handler.handleFuelOdometerInput(makeCtx('what did I spend on fuel?') as never)).toBe(false);
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
  });

  it('an invalid number asks again and keeps the prompt', async () => {
    const { handler, vehicles } = setup();
    const ctx = makeCtx();
    await handler.handleFuelLogCallback(ctx as never, (await scanAndSave(handler, ctx))!);
    const bad = makeCtx('12.5');
    expect(await handler.handleFuelOdometerInput(bad as never)).toBe(true);
    expect(bad.reply).toHaveBeenCalledWith(t('fuelLogInvalidOdometer', 'en'));
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
    expect(await handler.handleFuelOdometerInput(makeCtx('98765') as never)).toBe(true);
    expect(vehicles.upsertFuelLog).toHaveBeenCalledTimes(1);
  });

  it('a viewer cannot log a fill-up', async () => {
    const { handler, vehicles, prisma, cache } = setup();
    const ctx = makeCtx();
    const offerId = (await scanAndSave(handler, ctx))!;
    prisma.accountMember.findFirst.mockResolvedValue({ role: 'viewer' });
    await handler.handleFuelLogCallback(ctx as never, offerId);
    expect(ctx.reply).toHaveBeenLastCalledWith(t('viewerRestricted', 'en'));
    expect(cache.store.has('telegram:awaiting_fuel_odo:123')).toBe(false);
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
  });

  it('skip drops the offer and says so', async () => {
    const { handler, cache } = setup();
    const ctx = makeCtx();
    const offerId = (await scanAndSave(handler, ctx))!;
    await handler.handleFuelSkipCallback(ctx as never, offerId);
    expect(ctx.editMessageText).toHaveBeenLastCalledWith(t('fuelLogSkipped', 'en'));
    expect([...cache.store.keys()].some((k) => k.startsWith('telegram:fuel_offer:'))).toBe(false);
    await handler.handleFuelLogCallback(ctx as never, offerId);
    expect(ctx.reply).toHaveBeenLastCalledWith(t('fuelLogExpired', 'en'));
  });
});
