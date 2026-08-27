import type { StoreCentre } from '@/features/stores/findNearbyStore';
import {
  reduceShoppingSession,
  SHOPPING_MODE_DEFAULTS,
  type ShoppingSession,
  type ShoppingSessionConfig,
} from '../session';

const SHOP: StoreCentre = { merchant: 'Biedronka', lat: 52.0, lng: 21.0 };
const OTHER: StoreCentre = { merchant: 'Lidl', lat: 52.01, lng: 21.0 };
const START = 1_000_000;

/** Roughly `metres` north of `SHOP` — 1 degree of latitude is ~111 km. */
const northOf = (metres: number) => ({ lat: SHOP.lat + metres / 111_000, lng: SHOP.lng });

const approaching: ShoppingSession = { startedAt: START, insideMerchant: null };
const inside: ShoppingSession = { startedAt: START, insideMerchant: 'Biedronka' };

const run = (
  session: ShoppingSession,
  coords: { lat: number; lng: number },
  over: Partial<{
    now: number;
    hasUncheckedItems: boolean;
    centres: StoreCentre[];
    config: ShoppingSessionConfig;
  }> = {}
) =>
  reduceShoppingSession({
    session,
    centres: over.centres ?? [SHOP, OTHER],
    coords,
    now: over.now ?? START + 60_000,
    hasUncheckedItems: over.hasUncheckedItems ?? true,
    config: over.config,
  });

describe('reduceShoppingSession', () => {
  it('pins the default radii, cap and visit threshold', () => {
    expect(SHOPPING_MODE_DEFAULTS).toEqual({
      arriveRadiusM: 150,
      leaveRadiusM: 250,
      sessionMaxMs: 7_200_000,
      minVisits: 2,
    });
  });

  it('notifies on arrival inside the arrive radius and records the merchant', () => {
    const r = run(approaching, northOf(100));

    expect(r.notify).toEqual({ kind: 'arrival', merchant: 'Biedronka' });
    expect(r.session.insideMerchant).toBe('Biedronka');
    expect(r.stop).toBe(false);
  });

  // 200 m sits BETWEEN the two radii. Outside the arrive radius (150 m) is
  // not enough on its own to discriminate a correct implementation from one
  // that collapsed both radii to one shared threshold, or that reads
  // `leaveRadiusM` in the arrival branch — either mutant would still be
  // inside 250 m here and wrongly arrive. A position past BOTH radii (e.g.
  // 400 m) would pass against either version and prove nothing.
  it('does nothing while still outside the arrive radius', () => {
    const r = run(approaching, northOf(200));

    expect(r.notify).toBeNull();
    expect(r.session.insideMerchant).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('arrives at the nearest in-range shop, not the first one in the array', () => {
    // Both are within the 150 m arrive radius of this position; Alpha is the
    // nearer one but is listed SECOND. An implementation that just takes the
    // first in-range match (rather than scanning for the closest) would
    // arrive at Zeta instead.
    const far: StoreCentre = { merchant: 'Zeta', lat: SHOP.lat + 140 / 111_000, lng: SHOP.lng };
    const near: StoreCentre = { merchant: 'Alpha', lat: SHOP.lat + 30 / 111_000, lng: SHOP.lng };
    const r = run(approaching, { lat: SHOP.lat, lng: SHOP.lng }, { centres: [far, near] });

    expect(r.notify).toEqual({ kind: 'arrival', merchant: 'Alpha' });
  });

  it('arrives immediately when the session starts at the shop', () => {
    const r = run(approaching, { lat: SHOP.lat, lng: SHOP.lng }, { now: START });

    expect(r.notify).toEqual({ kind: 'arrival', merchant: 'Biedronka' });
  });

  it('honours an explicit config override rather than always falling back to the defaults', () => {
    // 400 m is past the DEFAULT arrive radius (150 m) but within this custom
    // one (500 m). Arriving here proves `params.config` is actually read —
    // deleting the `params.config ?? SHOPPING_MODE_DEFAULTS` fallback (or
    // ignoring the parameter entirely) would fall back to the tighter
    // default and fail to arrive.
    const config: ShoppingSessionConfig = {
      arriveRadiusM: 500,
      leaveRadiusM: 600,
      sessionMaxMs: SHOPPING_MODE_DEFAULTS.sessionMaxMs,
      minVisits: 2,
    };
    const r = run(approaching, northOf(400), { config });

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
  // otherwise walking past a second shop would end the session. Standing at
  // OTHER's own coordinates while the session is inside SHOP is ~1.1 km past
  // SHOP's leave radius, so the session correctly ends here; what this test
  // pins is that the exit is attributed to SHOP (Biedronka), the shop the
  // session was in, and not to OTHER (Lidl), the shop the user is standing at.
  it('attributes the exit to the shop the session was in, not the shop the user is standing at', () => {
    const r = run(inside, { lat: OTHER.lat, lng: OTHER.lng });

    expect(r.notify).toEqual({ kind: 'exit', merchant: 'Biedronka' });
    expect(r.stop).toBe(true);
  });

  it('stays inside its own shop even when another shop is closer', () => {
    // Standing 120 m from Biedronka, with Lidl's centre moved to 10 m away:
    // the nearest shop is Lidl, not the shop the session is in. This pins
    // that a nearer shop does not steal an already-active session — the
    // reducer keeps measuring against Biedronka (120 m, inside its leave
    // radius) rather than switching to whichever centre happens to be
    // closest right now.
    const near: StoreCentre = { merchant: 'Lidl', lat: SHOP.lat + 130 / 111_000, lng: SHOP.lng };
    const r = run(inside, northOf(120), { centres: [SHOP, near] });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('matches the shop it is inside case-insensitively', () => {
    // `buildStoreCentres` groups merchants case-insensitively, so the
    // snapshot's spelling need not match `insideMerchant` byte-for-byte.
    const centres: StoreCentre[] = [{ merchant: 'BIEDRONKA', lat: SHOP.lat, lng: SHOP.lng }];
    const r = run(inside, northOf(10), { centres });

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

  // The case that actually matters: a session receiving nothing but unusable
  // fixes must still be able to time out. Moving the cap check below the
  // null-island guard (or below the arrival/exit logic entirely) would let
  // `{0, 0}` short-circuit with `stop: false` before the cap is ever
  // consulted, and the foreground service would outlive its cap for as long
  // as the app stayed closed.
  it('times out even when the only available position is unusable', () => {
    const r = run(inside, { lat: 0, lng: 0 }, {
      now: START + SHOPPING_MODE_DEFAULTS.sessionMaxMs + 1,
    });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });

  it('ignores null island rather than treating it as a position', () => {
    const r = run(approaching, { lat: 0, lng: 0 });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  // The case that actually matters: an APPROACHING session at null island
  // arrives nowhere either way, since null island is thousands of kilometres
  // from any fixture shop — that test alone would pass even with the guard
  // deleted. An INSIDE session is where a missing guard is harmful: without
  // it, the huge distance to null island exceeds the leave radius and fires
  // a spurious exit notification for a shop the user never left.
  it('does not fire a spurious exit when the position is null island', () => {
    const r = run(inside, { lat: 0, lng: 0 });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  // A NaN coordinate must be rejected the same way — `NaN <= leaveRadiusM` is
  // always false, so without a guard that treats non-finite input as
  // unusable, this would fall through to the same spurious-exit branch as
  // null island above.
  it('treats a NaN coordinate as unusable too, not as a real position', () => {
    const r = run(inside, { lat: NaN, lng: 21.0 });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('stops when the snapshot no longer holds the shop it is inside', () => {
    const r = run(inside, northOf(10), { centres: [OTHER] });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });

  describe('two branches of the chain you are inside', () => {
    // `buildStoreCentres` now emits one centre per branch, so several centres
    // can share a merchant name. Resolving the shop we are inside by name
    // alone picks whichever happens to sit first in the array — and if that is
    // a branch across town, the very first fix after arrival reads as "far
    // away", ending the trip with a spurious exit notification while the user
    // is still standing in the aisle.
    const NEAR: StoreCentre = { merchant: 'Biedronka', lat: SHOP.lat, lng: SHOP.lng };
    const FAR: StoreCentre = { merchant: 'Biedronka', lat: SHOP.lat + 0.02, lng: SHOP.lng };

    it('measures against the branch you are in, not the first one with that name', () => {
      const result = run(inside, northOf(30), { centres: [FAR, NEAR] });

      expect(result.stop).toBe(false);
      expect(result.notify).toBeNull();
    });

    it('still ends the trip once every branch of that chain is out of range', () => {
      const result = run(inside, northOf(400), { centres: [FAR, NEAR] });

      expect(result.stop).toBe(true);
      expect(result.notify).toEqual({ kind: 'exit', merchant: 'Biedronka' });
    });
  });
});
