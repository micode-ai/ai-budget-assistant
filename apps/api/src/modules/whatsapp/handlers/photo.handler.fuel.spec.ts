import { PhotoHandler } from './photo.handler';
import { BotReceiptFuelService } from '../../../common/bot-receipt-fuel';
import type { WaMediaMessage, WhatsAppUserState } from '../types';
import { t } from '../helpers/i18n';

// "Add to fuel log" after a fuel receipt (ABA-830): the real shared core over an
// in-memory Redis, with the vehicles service and the membership lookup stubbed.

function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => keys.filter((k) => store.delete(k)).length),
  };
}

function cacheOver(redis: ReturnType<typeof makeFakeRedis>) {
  const { store } = redis;
  return {
    get: jest.fn(async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null)),
    set: jest.fn(async (k: string, v: unknown) => {
      store.set(k, JSON.stringify(v));
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
    }),
    setIfAbsent: jest.fn(async (k: string) => {
      if (store.has(k)) return false;
      store.set(k, '1');
      return true;
    }),
  };
}

const FUEL = { litres: 40.5, pricePerLitre: 6.49, fuelType: 'diesel' as const };

const userState: WhatsAppUserState = {
  userId: 'user-1',
  accountId: 'acc-1',
  accountRole: 'editor',
  conversationId: null,
  currencyCode: 'PLN',
  language: 'en',
  waPhoneNumber: '48123456789',
};
const PHONE = userState.waPhoneNumber;

function pdfMessage(): WaMediaMessage {
  return { from: PHONE, id: 'msg-1', timestamp: '0', type: 'document', document: { id: 'media-1', mime_type: 'application/pdf' } };
}

function setup(opts: { fuel?: typeof FUEL | null; lastUsed?: string | null } = {}) {
  const redis = makeFakeRedis();
  const cache = cacheOver(redis);
  const ocr = {
    parseReceipt: jest.fn(),
    parseReceiptPdf: jest.fn().mockResolvedValue({
      amount: 262.85,
      discountAmount: null,
      currencyCode: 'PLN',
      description: 'Orlen',
      categoryId: null,
      merchant: 'Orlen',
      date: '2026-11-18',
      confidence: 0.9,
      receiptItems: [{ description: 'ON', totalPrice: 262.85 }],
      location: null,
      fuel: opts.fuel === undefined ? FUEL : opts.fuel,
    }),
  };
  const expenses = { create: jest.fn().mockResolvedValue({ expense: { id: 'exp-1', amount: 262.85 } }) };
  const client = {
    downloadMedia: jest.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
    sendText: jest.fn().mockResolvedValue(undefined),
    sendButtons: jest.fn().mockResolvedValue(undefined),
  };
  const vehicles = {
    findAll: jest.fn().mockResolvedValue([
      { id: 'veh-1', name: 'Octavia', fuelType: 'petrol' },
      { id: 'veh-2', name: 'Transit', fuelType: 'diesel' },
    ]),
    lastFuelVehicleId: jest.fn().mockResolvedValue(opts.lastUsed ?? null),
    upsertFuelLog: jest.fn().mockResolvedValue({ id: 'fl-1' }),
  };
  const prisma = { accountMember: { findFirst: jest.fn().mockResolvedValue({ role: 'editor' }) } };
  const handler = new PhotoHandler(
    ocr as never,
    expenses as never,
    { trackAiUsage: jest.fn().mockResolvedValue(undefined) } as never,
    { create: jest.fn() } as never,
    { reconcileWithReceipt: jest.fn().mockResolvedValue({ checkedLabels: [] }) } as never,
    client as never,
    { recordExternalWrite: jest.fn().mockResolvedValue(null) } as never,
    { updateConversationId: jest.fn() } as never,
    redis as never,
    cache as never,
    undefined,
    new BotReceiptFuelService(vehicles as never, prisma as never, cache as never),
  );
  return { handler, redis, client, vehicles, prisma };
}

/** Scan + "Add expense"; returns the fuel offer button ids (or null). */
async function scanAndSave(handler: PhotoHandler, client: ReturnType<typeof setup>['client']) {
  await handler.handleDocument(pdfMessage(), userState);
  const addId = (client.sendButtons.mock.calls[0][2] as { id: string }[])[0].id; // receipt_add--<id>
  await handler.handleReceiptAddCallback(addId.split('--')[1], userState);
  const call = client.sendButtons.mock.calls.find((c) => (c[2] as { id: string }[])[0].id.startsWith('fuel_log--'));
  return call ? { body: call[1] as string, buttons: call[2] as { id: string; title: string }[] } : null;
}

describe('WhatsApp PhotoHandler — "Add to fuel log" (ABA-830)', () => {
  it('offers a short button (20-char cap) with the vehicle in the body and `--` callback ids', async () => {
    const { handler, client } = setup();
    const offer = await scanAndSave(handler, client);
    expect(offer).not.toBeNull();
    // Two vehicles, no last used: the receipt's diesel picks the only diesel one.
    expect(offer!.body).toContain('Transit');
    expect(offer!.buttons[0].title).toBe(t('fuelLogButtonShort', 'en'));
    expect(offer!.buttons[0].title.length).toBeLessThanOrEqual(20);
    expect(offer!.buttons[0].id).toMatch(/^fuel_log--[0-9a-f]{8}$/);
    expect(offer!.buttons[1].id).toMatch(/^fuel_skip--[0-9a-f]{8}$/);
  });

  it('shows no button without a fuel block', async () => {
    const { handler, client } = setup({ fuel: null });
    expect(await scanAndSave(handler, client)).toBeNull();
  });

  it('button → typed odometer → fuel log for the saved expense; modes cleared', async () => {
    const { handler, client, redis, vehicles } = setup({ lastUsed: 'veh-1' });
    const offer = (await scanAndSave(handler, client))!;
    redis.store.set(`wa:awaiting_item_edit:${PHONE}`, 'r1');
    await handler.handleFuelLogCallback(offer.buttons[0].id.split('--')[1], userState);
    expect(redis.store.has(`wa:awaiting_item_edit:${PHONE}`)).toBe(false);

    expect(await handler.handleFuelOdometerInput('123 456', userState)).toBe(true);
    // Last used beats the fuel-type match.
    expect(vehicles.upsertFuelLog).toHaveBeenCalledWith('acc-1', 'veh-1', 'exp-1', {
      liters: 40.5,
      odometerKm: 123456,
      isFullTank: true,
    });
    expect(client.sendText).toHaveBeenLastCalledWith(PHONE, expect.stringContaining('123456 km'));
    expect(redis.store.has(`wa:awaiting_fuel_odo:${PHONE}`)).toBe(false);
    expect(await handler.handleFuelOdometerInput('5', userState)).toBe(false);
  });

  it('a chat message with no digit passes through to the chat', async () => {
    const { handler, client } = setup();
    const offer = (await scanAndSave(handler, client))!;
    await handler.handleFuelLogCallback(offer.buttons[0].id.split('--')[1], userState);
    expect(await handler.handleFuelOdometerInput('hello', userState)).toBe(false);
  });

  it('entering date edit clears an armed odometer prompt', async () => {
    const { handler, client, redis } = setup();
    const offer = (await scanAndSave(handler, client))!;
    await handler.handleFuelLogCallback(offer.buttons[0].id.split('--')[1], userState);
    await handler.handleDocument(pdfMessage(), userState);
    const latest = client.sendButtons.mock.calls.at(-1)![2] as { id: string }[];
    await handler.handleDateCallback(latest[0].id.split('--')[1], userState);
    expect(redis.store.has(`wa:awaiting_fuel_odo:${PHONE}`)).toBe(false);
  });

  it('a viewer is refused at the button', async () => {
    const { handler, client, prisma, vehicles } = setup();
    const offer = (await scanAndSave(handler, client))!;
    prisma.accountMember.findFirst.mockResolvedValue({ role: 'viewer' });
    await handler.handleFuelLogCallback(offer.buttons[0].id.split('--')[1], userState);
    expect(client.sendText).toHaveBeenLastCalledWith(PHONE, t('viewerRestricted', 'en'));
    expect(await handler.handleFuelOdometerInput('123456', userState)).toBe(false);
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
  });

  it('skip says so and the button then reports the offer as expired', async () => {
    const { handler, client } = setup();
    const offer = (await scanAndSave(handler, client))!;
    const offerId = offer.buttons[1].id.split('--')[1];
    await handler.handleFuelSkipCallback(offerId, userState);
    expect(client.sendText).toHaveBeenLastCalledWith(PHONE, t('fuelLogSkipped', 'en'));
    await handler.handleFuelLogCallback(offerId, userState);
    expect(client.sendText).toHaveBeenLastCalledWith(PHONE, t('fuelLogExpired', 'en'));
  });
});
