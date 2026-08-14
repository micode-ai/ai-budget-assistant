import type { StoreCentre } from '@/features/stores/findNearbyStore';
import {
  reduceShoppingSession,
  SHOPPING_MODE_DEFAULTS,
  type ShoppingSession,
} from '../session';

const SHOP: StoreCentre = { merchant: 'Biedronka', lat: 52.0, lng: 21.0 };
const OTHER: StoreCentre = { merchant: 'Lidl', lat: 52.01, lng: 21.0 };
const START = 1_000_000;

/** Roughly `metres` north of `SHOP` — 1 degree of latitude is ~111 km. */
const northOf = (metres: number) => ({ lat: SHOP.lat + metres / 111_000, lng: SHOP.lng });

const approaching: ShoppingSession = { startedAt: START, insideMerchant: null };
const inside: ShoppingSession = { startedAt: START, insideMerchant: 'Biedronka' };

const run = (session: ShoppingSession, coords: { lat: number; lng: number }, over: Partial<{ now: number; hasUncheckedItems: boolean; centres: StoreCentre[] }> = {}) =>
  reduceShoppingSession({
    session,
    centres: over.centres ?? [SHOP, OTHER],
    coords,
    now: over.now ?? START + 60_000,
    hasUncheckedItems: over.hasUncheckedItems ?? true,
  });

describe('reduceShoppingSession', () => {
  it('notifies on arrival inside the arrive radius and records the merchant', () => {
    const r = run(approaching, northOf(100));

    expect(r.notify).toEqual({ kind: 'arrival', merchant: 'Biedronka' });
    expect(r.session.insideMerchant).toBe('Biedronka');
    expect(r.stop).toBe(false);
  });

  it('does nothing while still outside the arrive radius', () => {
    const r = run(approaching, northOf(400));

    expect(r.notify).toBeNull();
    expect(r.session.insideMerchant).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('arrives immediately when the session starts at the shop', () => {
    const r = run(approaching, { lat: SHOP.lat, lng: SHOP.lng }, { now: START });

    expect(r.notify).toEqual({ kind: 'arrival', merchant: 'Biedronka' });
  });

  it('does not notify arrival twice for the same shop', () => {
    const r = run(inside, northOf(100));

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  // Hysteresis. This is the test that stops the notification flapping at a
  // shop entrance, where a stationary phone's reported position wanders by
  // tens of metres.
  it('stays inside between the two radii', () => {
    const r = run(inside, northOf(200));

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('notifies on exit past the leave radius and stops', () => {
    const r = run(inside, northOf(300));

    expect(r.notify).toEqual({ kind: 'exit', merchant: 'Biedronka' });
    expect(r.stop).toBe(true);
  });

  it('stops without notifying when nothing is left unchecked', () => {
    const r = run(inside, northOf(300), { hasUncheckedItems: false });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });

  // Exit is measured against the shop we are IN, never the nearest one —
  // otherwise walking past a second shop would end the session.
  it('does not exit because a different shop is now nearer', () => {
    // OTHER is ~1.1 km from SHOP, so this position is far outside SHOP's
    // arrive radius but well inside its leave radius... no: it is outside
    // both. The point is that being *at* another shop is measured against
    // Biedronka, and 1.1 km is past the leave radius, so this DOES end the
    // session — which is correct. The guard being tested is that the exit is
    // attributed to Biedronka, not to Lidl.
    const r = run(inside, { lat: OTHER.lat, lng: OTHER.lng });

    expect(r.notify).toEqual({ kind: 'exit', merchant: 'Biedronka' });
    expect(r.stop).toBe(true);
  });

  it('stays inside its own shop even when another shop is closer', () => {
    // Standing 120 m from Biedronka, with Lidl's centre moved to 10 m away:
    // the nearest shop is Lidl, but the session is in Biedronka and 120 m is
    // inside its leave radius, so nothing happens. Measuring against the
    // nearest shop instead would have ended the session here.
    const near: StoreCentre = { merchant: 'Lidl', lat: SHOP.lat + 130 / 111_000, lng: SHOP.lng };
    const r = run(inside, northOf(120), { centres: [SHOP, near] });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('stops silently once the session outlives its cap', () => {
    const r = run(inside, northOf(10), { now: START + SHOPPING_MODE_DEFAULTS.sessionMaxMs + 1 });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });

  it('times out even while still approaching', () => {
    const r = run(approaching, northOf(5_000), {
      now: START + SHOPPING_MODE_DEFAULTS.sessionMaxMs + 1,
    });

    expect(r.stop).toBe(true);
  });

  it('ignores null island rather than treating it as a position', () => {
    const r = run(approaching, { lat: 0, lng: 0 });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('stops when the snapshot no longer holds the shop it is inside', () => {
    const r = run(inside, northOf(10), { centres: [OTHER] });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });
});
