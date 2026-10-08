import * as fs from 'fs';
import * as path from 'path';
import { CommunityPriceController } from './community-price.controller';
import { CommunityPriceThrottlerGuard } from './community-price-throttler.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';

describe('CommunityPriceController (free reads, ABA-642)', () => {
  const proto = CommunityPriceController.prototype as any;
  const routes = ['getPrices', 'search', 'map'];

  it('keeps the class-level JwtAuthGuard + AccountContextGuard, in that order', () => {
    expect(Reflect.getMetadata('__guards__', CommunityPriceController)).toEqual([JwtAuthGuard, AccountContextGuard]);
  });

  it.each(routes)('%s has no tier gate, so a free-tier user cannot get TIER_REQUIRED', (name) => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', proto[name]) ?? [];
    expect(guards).not.toContain(SubscriptionTierGuard);
    const classGuards: unknown[] = Reflect.getMetadata('__guards__', CommunityPriceController) ?? [];
    expect(classGuards).not.toContain(SubscriptionTierGuard);
    // @RequireTier stores its metadata on the handler; none may remain.
    expect(Reflect.getMetadataKeys(proto[name]).filter((k: string) => /tier/i.test(String(k)))).toEqual([]);
  });

  it.each(routes)('%s is throttled to 60/min with the guard attached (no APP_GUARD exists)', (name) => {
    expect(Reflect.getMetadata('__guards__', proto[name])).toContain(CommunityPriceThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto[name])).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto[name])).toBe(60_000);
  });

  it('the throttler keys on the signed-in user, falling back to the IP', async () => {
    const guard: any = Object.create(CommunityPriceThrottlerGuard.prototype);
    expect(await guard.getTracker({ user: { id: 'u1' }, ip: '1.2.3.4' })).toBe('cp-read:u1');
    expect(await guard.getTracker({ ip: '1.2.3.4' })).toBe('1.2.3.4');
  });

  it('ABA-642 audit: all three community read routes share ONE throttle bucket per user', () => {
    const guard: any = Object.create(CommunityPriceThrottlerGuard.prototype);
    const ctx = (handler: string) => ({ getHandler: () => ({ name: handler }), getClass: () => ({ name: 'CommunityPriceController' }) });
    const keyOf = (handler: string, tracker: string) => guard.generateKey(ctx(handler), tracker, 'default');
    expect(keyOf('getPrices', 'cp-read:u1')).toBe(keyOf('search', 'cp-read:u1'));
    expect(keyOf('getPrices', 'cp-read:u1')).toBe(keyOf('map', 'cp-read:u1'));
    expect(keyOf('map', 'cp-read:u1')).not.toBe(keyOf('map', 'cp-read:u2'));
  });

  it('delegates to the service and defaults the period to 1w for an unknown value', async () => {
    const service: any = {
      getCommunityPrices: jest.fn().mockResolvedValue({}),
      searchProducts: jest.fn().mockResolvedValue([]),
      getCommunityMap: jest.fn().mockResolvedValue([]),
    };
    const c = new CommunityPriceController(service);
    await c.getPrices('Mleko', undefined, '4w');
    await c.getPrices('Mleko', 'warszawa', 'x');
    expect(service.getCommunityPrices).toHaveBeenNthCalledWith(1, 'Mleko', null, '4w');
    expect(service.getCommunityPrices).toHaveBeenNthCalledWith(2, 'Mleko', 'warszawa', '1w');
  });
});

describe('community findings are inline-only', () => {
  it('the persisting detector never passes a community baseline (personal-only)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../anomaly/anomaly-detectors.service.ts'), 'utf8');
    const call = src.slice(src.indexOf('checkReceiptPrices({'));
    expect(call.slice(0, call.indexOf('});'))).not.toMatch(/community/i);
  });

  it('no bot photo handler requests the community baseline', () => {
    for (const bot of ['telegram', 'whatsapp', 'slack']) {
      const src = fs.readFileSync(path.join(__dirname, `../${bot}/handlers/photo.handler.ts`), 'utf8');
      expect(src).not.toMatch(/communityBaseline/);
    }
  });
});
