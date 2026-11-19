import { PhotoHandler } from './photo.handler';
import { BotReceiptFuelService } from '../../../common/bot-receipt-fuel';
import type { SlackFile, SlackUserState } from '../types';
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

const FUEL = { litres: 40.5, pricePerLitre: 6.49, fuelType: 'petrol' as const };

const userState: SlackUserState = {
  userId: 'user-1',
  accountId: 'acc-1',
  accountRole: 'editor',
  conversationId: null,
  currencyCode: 'PLN',
  language: 'en',
  slackUserId: 'U1',
  slackTeamId: 'T1',
  channel: 'D1',
};

function pdfFile(): SlackFile {
  return { id: 'file-1', mimetype: 'application/pdf', url_private_download: 'https://files.slack.com/receipt.pdf' };
}

function setup(opts: { fuel?: typeof FUEL | null } = {}) {
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
      receiptItems: [{ description: 'PB95', totalPrice: 262.85 }],
      location: null,
      fuel: opts.fuel === undefined ? FUEL : opts.fuel,
    }),
  };
  const expenses = { create: jest.fn().mockResolvedValue({ expense: { id: 'exp-1', amount: 262.85 } }) };
  const client = {
    postPlaceholder: jest.fn().mockResolvedValue('1700000000.000100'),
    downloadFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
    replyText: jest.fn().mockResolvedValue(undefined),
    replyButtons: jest.fn().mockResolvedValue(undefined),
    updateText: jest.fn().mockResolvedValue(undefined),
    sendText: jest.fn().mockResolvedValue(undefined),
    sendButtons: jest.fn().mockResolvedValue(undefined),
  };
  const vehicles = {
    findAll: jest.fn().mockResolvedValue([{ id: 'veh-1', name: 'Octavia', fuelType: 'diesel' }]),
    lastFuelVehicleId: jest.fn().mockResolvedValue(null),
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

/** Scan + "Add expense"; returns the fuel offer message (or null). */
async function scanAndSave(handler: PhotoHandler, client: ReturnType<typeof setup>['client']) {
  await handler.handleDocument(pdfFile(), userState);
  const addId = (client.replyButtons.mock.calls[0][4] as { id: string }[])[0].id; // receipt_add:<id>
  await handler.handleReceiptAddCallback(addId.split(':')[1], userState);
  const call = client.sendButtons.mock.calls.find((c) => (c[3] as { id: string }[])[0].id.startsWith('fuel_log:'));
  return call ? { body: call[2] as string, buttons: call[3] as { id: string; title: string }[] } : null;
}

describe('Slack PhotoHandler — "Add to fuel log" (ABA-830)', () => {
  it('offers the button with the vehicle name — the only vehicle, whatever its fuel type', async () => {
    const { handler, client } = setup();
    const offer = (await scanAndSave(handler, client))!;
    expect(offer.buttons[0].title).toBe('⛽ Add to fuel log (Octavia)');
    expect(offer.buttons[1].id).toMatch(/^fuel_skip:/);
    // A new post, never a placeholder update.
    expect(client.updateText).not.toHaveBeenCalled();
  });

  it('shows no button without a fuel block', async () => {
    const { handler, client } = setup({ fuel: null });
    expect(await scanAndSave(handler, client)).toBeNull();
  });

  it('button → typed odometer → fuel log for the saved expense; then chat is free', async () => {
    const { handler, client, redis, vehicles } = setup();
    const offer = (await scanAndSave(handler, client))!;
    redis.store.set('slack:awaiting_date:U1', 'r1');
    await handler.handleFuelLogCallback(offer.buttons[0].id.split(':')[1], userState);
    expect(redis.store.has('slack:awaiting_date:U1')).toBe(false);
    expect(client.sendButtons).toHaveBeenLastCalledWith(
      'T1',
      'D1',
      t('fuelLogAskOdometer', 'en', { vehicle: 'Octavia', litres: '40.5', price: '6.49 PLN' }),
      [{ id: offer.buttons[1].id, title: t('fuelLogSkip', 'en') }],
    );

    expect(await handler.handleFuelOdometerInput('77000km', userState)).toBe(true);
    expect(vehicles.upsertFuelLog).toHaveBeenCalledWith('acc-1', 'veh-1', 'exp-1', {
      liters: 40.5,
      odometerKm: 77000,
      isFullTank: true,
    });
    expect(redis.store.has('slack:awaiting_fuel_odo:U1')).toBe(false);
    expect(await handler.handleFuelOdometerInput('77000', userState)).toBe(false);
  });

  it('an invalid reading keeps the prompt; a word passes through', async () => {
    const { handler, client, vehicles } = setup();
    const offer = (await scanAndSave(handler, client))!;
    await handler.handleFuelLogCallback(offer.buttons[0].id.split(':')[1], userState);
    expect(await handler.handleFuelOdometerInput('0', userState)).toBe(true);
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('fuelLogInvalidOdometer', 'en'));
    expect(await handler.handleFuelOdometerInput('thanks', userState)).toBe(false);
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
  });

  it('a failed write is reported, never thrown', async () => {
    const { handler, client, vehicles } = setup();
    const offer = (await scanAndSave(handler, client))!;
    await handler.handleFuelLogCallback(offer.buttons[0].id.split(':')[1], userState);
    vehicles.upsertFuelLog.mockRejectedValue(new Error('Vehicle not found'));
    expect(await handler.handleFuelOdometerInput('123456', userState)).toBe(true);
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('fuelLogFailed', 'en'));
  });

  it('another channel member cannot arm someone else\'s offer', async () => {
    const { handler, client, redis } = setup();
    const offer = (await scanAndSave(handler, client))!;
    await handler.handleFuelLogCallback(offer.buttons[0].id.split(':')[1], { ...userState, userId: 'user-2', slackUserId: 'U2' });
    expect(redis.store.has('slack:awaiting_fuel_odo:U2')).toBe(false);
  });

  it('a viewer is refused when typing the reading', async () => {
    const { handler, client, prisma, vehicles } = setup();
    const offer = (await scanAndSave(handler, client))!;
    await handler.handleFuelLogCallback(offer.buttons[0].id.split(':')[1], userState);
    prisma.accountMember.findFirst.mockResolvedValue({ role: 'viewer' });
    expect(await handler.handleFuelOdometerInput('123456', userState)).toBe(true);
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('viewerRestricted', 'en'));
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
  });
});
