import {
  BotReceiptFuelService,
  awaitingFuelOdometerKey,
  buildFuelOfferButton,
  buildFuelOfferText,
  buildFuelSavedText,
  fuelOfferKey,
  parseOdometer,
  pickFuelVehicle,
  type FuelOffer,
} from './bot-receipt-fuel';
import { createBotT, sharedMessages } from './bot-i18n/shared-messages';

const t = createBotT(sharedMessages, { markup: 'html' });

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
    }),
  };
}

const car = (id: string, fuelType = 'petrol', name = `Car ${id}`) => ({ id, name, fuelType });
const FUEL = { litres: 40.5, pricePerLitre: 6.49, fuelType: 'petrol' as const };

function setup(opts: { vehicles?: ReturnType<typeof car>[]; lastUsed?: string | null; role?: string | null } = {}) {
  const cache = makeCache();
  const vehicles = {
    findAll: jest.fn().mockResolvedValue(opts.vehicles ?? [car('v1')]),
    lastFuelVehicleId: jest.fn().mockResolvedValue(opts.lastUsed ?? null),
    upsertFuelLog: jest.fn().mockResolvedValue({ id: 'fl-1' }),
  };
  const role = opts.role === undefined ? 'editor' : opts.role;
  const prisma = {
    accountMember: { findFirst: jest.fn().mockResolvedValue(role ? { role } : null) },
  };
  const service = new BotReceiptFuelService(vehicles as never, prisma as never, cache as never);
  return { service, cache, vehicles, prisma };
}

const offerParams = { userId: 'u1', accountId: 'a1', expenseId: 'e1', fuel: FUEL, currencyCode: 'PLN' };

describe('pickFuelVehicle — the app\'s rule', () => {
  it('no vehicle → none', () => {
    expect(pickFuelVehicle([], null, FUEL)).toBeNull();
  });
  it('the only vehicle, whatever its fuel type', () => {
    expect(pickFuelVehicle([car('v1', 'diesel')], null, FUEL)?.id).toBe('v1');
  });
  it('the last used one beats a fuel-type match', () => {
    expect(pickFuelVehicle([car('v1'), car('v2', 'diesel')], 'v2', FUEL)?.id).toBe('v2');
  });
  it('a last-used id that is no longer a vehicle falls through to the fuel type', () => {
    expect(pickFuelVehicle([car('v1'), car('v2', 'diesel')], 'gone', FUEL)?.id).toBe('v1');
  });
  it('an ambiguous fuel type → none (a wrong guess corrupts consumption)', () => {
    expect(pickFuelVehicle([car('v1'), car('v2')], null, FUEL)).toBeNull();
    expect(pickFuelVehicle([car('v1', 'lpg'), car('v2', 'diesel')], null, FUEL)).toBeNull();
  });
});

describe('parseOdometer', () => {
  it.each([
    ['123456', 123456],
    [' 123 456 ', 123456],
    ['123.456', 123456],
    ['123,456', 123456],
    ['98765 km', 98765],
    ['98765км', 98765],
    ['1 234', 1234],
  ])('%s → %d', (text, km) => {
    expect(parseOdometer(text)).toBe(km);
  });
  it.each(['0', '-5', '12.5', '123,4', '1 23', 'abc', '', '12345678901', '10000000'])('rejects %s', (text) => {
    expect(parseOdometer(text)).toBeNull();
  });
});

describe('BotReceiptFuelService.createOffer', () => {
  it('stores an offer for the picked vehicle', async () => {
    const { service, cache } = setup();
    const created = await service.createOffer('telegram', offerParams);
    expect(created).not.toBeNull();
    expect(created!.offer).toMatchObject({ vehicleId: 'v1', vehicleName: 'Car v1', litres: 40.5, expenseId: 'e1' });
    expect(cache.store.get(fuelOfferKey('telegram', created!.offerId))).toEqual(created!.offer);
  });

  it('uses the vehicle of the account\'s most recent fill-up as "last used"', async () => {
    const { service, vehicles } = setup({ vehicles: [car('v1'), car('v2')], lastUsed: 'v2' });
    const created = await service.createOffer('wa', offerParams);
    expect(vehicles.lastFuelVehicleId).toHaveBeenCalledWith('a1');
    expect(created!.offer.vehicleId).toBe('v2');
  });

  it('no fuel block or no resolvable vehicle → no offer and nothing stored', async () => {
    const { service, cache } = setup({ vehicles: [car('v1'), car('v2')] });
    expect(await service.createOffer('slack', { ...offerParams, fuel: null })).toBeNull();
    expect(await service.createOffer('slack', offerParams)).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('never throws: a lookup failure is no offer', async () => {
    const { service, vehicles } = setup();
    vehicles.findAll.mockRejectedValue(new Error('db down'));
    await expect(service.createOffer('telegram', offerParams)).resolves.toBeNull();
  });
});

describe('BotReceiptFuelService — arm / skip / consumeOdometer', () => {
  async function armed(opts: Parameters<typeof setup>[0] = {}) {
    const ctx = setup(opts);
    const created = await ctx.service.createOffer('telegram', offerParams);
    return { ...ctx, offerId: created!.offerId };
  }

  it('arming clears the other typed-input modes and sets the odometer mode', async () => {
    const { service, cache, offerId } = await armed();
    cache.store.set('telegram:awaiting_item_edit:42', 'r1');
    cache.store.set('telegram:awaiting_date:42', 'r1');
    const result = await service.arm('telegram', '42', offerId, 'u1', [
      'telegram:awaiting_item_edit:42',
      'telegram:awaiting_date:42',
    ]);
    expect(result.status).toBe('armed');
    expect(cache.store.has('telegram:awaiting_item_edit:42')).toBe(false);
    expect(cache.store.has('telegram:awaiting_date:42')).toBe(false);
    expect(cache.store.get(awaitingFuelOdometerKey('telegram', '42'))).toBe(offerId);
  });

  it('someone else\'s button is ignored; an expired offer says so; a viewer is refused', async () => {
    const { service, offerId, prisma, cache } = await armed();
    expect((await service.arm('telegram', '7', offerId, 'other-user', [])).status).toBe('not_owner');
    expect((await service.arm('telegram', '42', 'nope', 'u1', [])).status).toBe('expired');
    prisma.accountMember.findFirst.mockResolvedValue({ role: 'viewer' });
    expect((await service.arm('telegram', '42', offerId, 'u1', [])).status).toBe('viewer');
    expect(cache.store.has(awaitingFuelOdometerKey('telegram', '42'))).toBe(false);
  });

  it('a valid reading writes the full-tank fuel log through upsertFuelLog and ends the mode', async () => {
    const { service, vehicles, cache, offerId } = await armed();
    await service.arm('telegram', '42', offerId, 'u1', []);
    const result = await service.consumeOdometer('telegram', '42', '123 456 km');
    expect(result).toMatchObject({ status: 'saved', odometerKm: 123456 });
    expect(vehicles.upsertFuelLog).toHaveBeenCalledWith('a1', 'v1', 'e1', {
      liters: 40.5,
      odometerKm: 123456,
      isFullTank: true,
    });
    expect(cache.store.has(awaitingFuelOdometerKey('telegram', '42'))).toBe(false);
    expect(cache.store.has(fuelOfferKey('telegram', offerId))).toBe(false);
  });

  it('a number that is not a reading keeps the mode for a retry', async () => {
    const { service, vehicles, cache, offerId } = await armed();
    await service.arm('telegram', '42', offerId, 'u1', []);
    expect((await service.consumeOdometer('telegram', '42', '12.5')).status).toBe('invalid');
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
    expect(cache.store.get(awaitingFuelOdometerKey('telegram', '42'))).toBe(offerId);
  });

  it('a message with no digit leaves the mode and is NOT swallowed', async () => {
    const { service, cache, offerId } = await armed();
    await service.arm('telegram', '42', offerId, 'u1', []);
    expect((await service.consumeOdometer('telegram', '42', 'how much did I spend on fuel?')).status).toBe('idle');
    expect(cache.store.has(awaitingFuelOdometerKey('telegram', '42'))).toBe(false);
  });

  it('not armed, or the offer expired → idle (and a stale mode is cleared)', async () => {
    const { service, cache } = setup();
    expect((await service.consumeOdometer('telegram', '42', '123456')).status).toBe('idle');
    cache.store.set(awaitingFuelOdometerKey('telegram', '42'), 'gone');
    expect((await service.consumeOdometer('telegram', '42', '123456')).status).toBe('idle');
    expect(cache.store.has(awaitingFuelOdometerKey('telegram', '42'))).toBe(false);
  });

  it('re-checks the role at write time: a user demoted to viewer writes nothing', async () => {
    const { service, vehicles, prisma, cache, offerId } = await armed();
    await service.arm('telegram', '42', offerId, 'u1', []);
    prisma.accountMember.findFirst.mockResolvedValue({ role: 'viewer' });
    expect((await service.consumeOdometer('telegram', '42', '123456')).status).toBe('viewer');
    expect(vehicles.upsertFuelLog).not.toHaveBeenCalled();
    expect(cache.store.has(awaitingFuelOdometerKey('telegram', '42'))).toBe(false);
  });

  it('a failed write is reported and still ends the mode', async () => {
    const { service, vehicles, cache, offerId } = await armed();
    await service.arm('telegram', '42', offerId, 'u1', []);
    vehicles.upsertFuelLog.mockRejectedValue(new Error('Expense not found'));
    expect((await service.consumeOdometer('telegram', '42', '123456')).status).toBe('failed');
    expect(cache.store.has(awaitingFuelOdometerKey('telegram', '42'))).toBe(false);
  });

  it('skip drops the offer and the armed prompt; another user cannot skip it', async () => {
    const { service, cache, offerId } = await armed();
    await service.arm('telegram', '42', offerId, 'u1', []);
    expect(await service.skip('telegram', '7', offerId, 'other-user')).toBe(false);
    expect(cache.store.has(fuelOfferKey('telegram', offerId))).toBe(true);
    expect(await service.skip('telegram', '42', offerId, 'u1')).toBe(true);
    expect(cache.store.has(fuelOfferKey('telegram', offerId))).toBe(false);
    expect(cache.store.has(awaitingFuelOdometerKey('telegram', '42'))).toBe(false);
  });
});

describe('fuel-log message builders', () => {
  const offer: FuelOffer = {
    userId: 'u1',
    accountId: 'a1',
    expenseId: 'e1',
    vehicleId: 'v1',
    vehicleName: 'Škoda <Octavia> & co',
    litres: 40.5,
    pricePerLitre: 6.49,
    fuelType: 'petrol',
    currencyCode: 'PLN',
  };
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  it('names the vehicle, litres and price, escaping the user-typed name when asked', () => {
    const text = buildFuelOfferText(offer, t, 'en', escapeHtml);
    expect(text).toContain('40.5 l');
    expect(text).toContain('6.49 PLN');
    expect(text).toContain('Škoda &lt;Octavia&gt; &amp; co');
  });

  it('the full button carries the vehicle; the WhatsApp one fits 20 characters', () => {
    expect(buildFuelOfferButton(offer, t, 'en')).toBe('⛽ Add to fuel log (Škoda <Octavia> & co)');
    expect(buildFuelOfferButton(offer, t, 'en', true).length).toBeLessThanOrEqual(20);
  });

  it('a long vehicle name is shortened', () => {
    const long = { ...offer, vehicleName: 'A'.repeat(60) };
    expect(buildFuelOfferButton(long, t, 'en').length).toBeLessThan(60);
  });

  it('the saved message carries the odometer', () => {
    expect(buildFuelSavedText(offer, 123456, t, 'pl')).toContain('123456 km');
  });
});
