import type { ExpenseSource } from '@budget/shared-types';
import {
  buildStoreCentres,
  findNearbyStore,
  haversineM,
  isRealPoint,
  NEARBY_STORE_DEFAULTS,
  TRUSTED_VISIT_SOURCES,
  type StoreVisit,
} from '../findNearbyStore';

// Warsaw city centre. ~0.0001 degrees of latitude is ~11 m, which is the unit
// these fixtures use to place points at known distances.
const HERE = { lat: 52.2297, lng: 21.0122 };
// Defaults to `ocr` — a receipt's geocoded store address, the ordinary way a
// real point-of-sale coordinate reaches this matcher.
const visit = (merchant: string, dLat = 0, dLng = 0, source: ExpenseSource = 'ocr'): StoreVisit => ({
  merchant,
  lat: HERE.lat + dLat,
  lng: HERE.lng + dLng,
  source,
});

describe('findNearbyStore', () => {
  it('matches a shop the user has visited twice, right where they are standing', () => {
    const result = findNearbyStore({
      coords: HERE,
      visits: [visit('Biedronka'), visit('Biedronka', 0.0001)],
    });

    expect(result?.merchant).toBe('Biedronka');
    expect(result!.distanceM).toBeLessThan(20);
  });

  it('ignores a merchant seen only once, however close', () => {
    // One stray geotag — a receipt scanned at home, say — must not be able to
    // invent a shop out of nothing.
    expect(findNearbyStore({ coords: HERE, visits: [visit('Biedronka')] })).toBeNull();
  });

  it('ignores a shop beyond the radius', () => {
    // ~0.01 degrees latitude is ~1.1 km, well outside the 150 m default.
    const far = [visit('Lidl', 0.01), visit('Lidl', 0.0101)];
    expect(findNearbyStore({ coords: HERE, visits: far })).toBeNull();
  });

  it('takes the median of a merchant coordinates, so one stray geotag cannot drag the centre', () => {
    // Three visits at the shop, one bogus geotag ~1.1 km away. A mean would sit
    // ~275 m off and miss; the median ignores the outlier entirely.
    const visits = [
      visit('Biedronka'),
      visit('Biedronka', 0.00005),
      visit('Biedronka', 0.0001),
      visit('Biedronka', 0.01),
    ];

    const result = findNearbyStore({ coords: HERE, visits });

    expect(result?.merchant).toBe('Biedronka');
    expect(result!.distanceM).toBeLessThan(20);
  });

  it('at the two-visit floor centres on an observed point, not the midpoint', () => {
    // n = 2 is the default floor, and averaging the two middle values IS the
    // mean there — exactly what the median is supposed to prevent. One real
    // geotag plus one stray ~1.1 km away used to put the centre ~555 m from
    // both, so the card never appeared at the shop the user was standing in.
    // The order statistic returns a coordinate a visit actually occupied.
    const visits = [visit('Biedronka'), visit('Biedronka', 0.01)];

    const atShop = findNearbyStore({ coords: HERE, visits });
    expect(atShop?.merchant).toBe('Biedronka');
    expect(atShop!.distanceM).toBeLessThan(20);

    // And the midpoint between them — where nothing was ever bought — is not a
    // shop. Under the old averaging median it was the only place that matched.
    const midpoint = { lat: HERE.lat + 0.005, lng: HERE.lng };
    expect(findNearbyStore({ coords: midpoint, visits })).toBeNull();
  });

  it('returns the nearer of two shops in range', () => {
    const visits = [
      visit('Lidl', 0.001), visit('Lidl', 0.001),
      visit('Biedronka', 0.0001), visit('Biedronka', 0.0001),
    ];

    expect(findNearbyStore({ coords: HERE, visits })?.merchant).toBe('Biedronka');
  });

  it('breaks an exact tie by merchant name, so the answer is deterministic', () => {
    const visits = [
      visit('Zabka', 0.0001), visit('Zabka', 0.0001),
      visit('Aldi', 0.0001), visit('Aldi', 0.0001),
    ];

    const first = findNearbyStore({ coords: HERE, visits });
    const second = findNearbyStore({ coords: HERE, visits: [...visits].reverse() });

    expect(first?.merchant).toBe('Aldi');
    expect(second?.merchant).toBe(first?.merchant);
  });

  it('skips null island rather than treating it as a real position', () => {
    // (0,0) is what an undecryptable tier-2 row's zeroed plaintext looks like.
    const visits: StoreVisit[] = [
      { merchant: 'Ghost', lat: 0, lng: 0, source: 'ocr' },
      { merchant: 'Ghost', lat: 0, lng: 0, source: 'ocr' },
    ];

    expect(findNearbyStore({ coords: { lat: 0, lng: 0 }, visits })).toBeNull();
  });

  it('returns null for an empty visit list', () => {
    expect(findNearbyStore({ coords: HERE, visits: [] })).toBeNull();
  });

  it('ignores a visit whose coordinates are not finite', () => {
    const visits: StoreVisit[] = [
      { merchant: 'Broken', lat: Number.NaN, lng: 21.0122, source: 'ocr' },
      { merchant: 'Broken', lat: 52.2297, lng: Number.NaN, source: 'ocr' },
    ];

    expect(findNearbyStore({ coords: HERE, visits })).toBeNull();
  });

  it('matches merchants case-insensitively, so BIEDRONKA and Biedronka are one shop', () => {
    const visits = [visit('BIEDRONKA'), visit('biedronka', 0.0001)];

    expect(findNearbyStore({ coords: HERE, visits })?.merchant).toBe('BIEDRONKA');
  });

  it('defaults to a 150 m radius and a 2-visit floor', () => {
    expect(NEARBY_STORE_DEFAULTS).toEqual({ radiusM: 150, minVisits: 2 });
  });

  it('does not use rounded distance in comparisons across iterations', () => {
    // Two shops at a distance that rounds UP (0.000105 degrees ≈ 11.67 m → 12 m).
    // Old bug: Aldi stored as distanceM=12 (rounded), then Zabka's raw 11.67 < 12
    // was true, so Zabka wrongly overwrote Aldi. The tie-breaker should prefer
    // Aldi (alphabetically first). Fix: keep raw distance for comparison, round at return.
    const offset = 0.000105;
    const visits = [
      visit('Aldi', offset), visit('Aldi', offset),
      visit('Zabka', offset), visit('Zabka', offset),
    ];

    expect(findNearbyStore({ coords: HERE, visits })?.merchant).toBe('Aldi');
  });

  it('respects explicit config parameter over defaults', () => {
    // Test that radiusM and minVisits from config are actually used.
    const tooFarShop = [
      visit('Lidl', 0.000135), visit('Lidl', 0.000135),   // ~15 m
    ];
    const twoVisitShop = [
      visit('Biedronka'), visit('Biedronka'),
    ];

    // Tighter radius excludes Lidl at ~15 m
    const tightRadius = findNearbyStore({
      coords: HERE,
      visits: tooFarShop,
      config: { radiusM: 14, minVisits: 2 },
    });
    expect(tightRadius).toBeNull();

    // Higher minVisits floor rejects 2-visit shops
    const highFloor = findNearbyStore({
      coords: HERE,
      visits: twoVisitShop,
      config: { radiusM: 150, minVisits: 3 },
    });
    expect(highFloor).toBeNull();
  });

  describe('trusted sources', () => {
    it('does not let a manually-entered expense turn the user\'s home into a shop', () => {
      // `expense/new.tsx` attaches mount-time device GPS, so an expense typed on
      // the sofa carries the sofa's position under whatever merchant was typed.
      // Two evenings of that must not become a shop centred on the user's home —
      // which, sitting ~0 m away, would outrank every real shop in range.
      const visits = [
        visit('Netflix', 0, 0, 'manual'),
        visit('Netflix', 0, 0, 'manual'),
      ];

      expect(findNearbyStore({ coords: HERE, visits })).toBeNull();
    });

    it('does not count voice-entered expenses toward the visit floor either', () => {
      const visits = [
        visit('Biedronka', 0, 0, 'voice'),
        visit('Biedronka', 0.0001, 0, 'voice'),
      ];

      expect(findNearbyStore({ coords: HERE, visits })).toBeNull();
    });

    it('counts an OCR receipt and a bank-notification capture together', () => {
      // Different trusted sources for one merchant still add up to minVisits:
      // both describe the till, not the sofa.
      const visits = [
        visit('Biedronka', 0, 0, 'ocr'),
        visit('Biedronka', 0.0001, 0, 'notification'),
      ];

      expect(findNearbyStore({ coords: HERE, visits })?.merchant).toBe('Biedronka');
    });

    it('leaves a merchant below the floor once its untrusted visits are dropped', () => {
      // One genuine receipt at the shop plus one expense typed elsewhere is one
      // trusted visit, not two — and one is never enough.
      const visits = [
        visit('Biedronka', 0, 0, 'ocr'),
        visit('Biedronka', 0.00005, 0, 'manual'),
      ];

      expect(findNearbyStore({ coords: HERE, visits })).toBeNull();
    });

    it('trusts receipts and every bot scan, and nothing that reads the device GPS', () => {
      // Pinned so that adding an ExpenseSource is a deliberate decision rather
      // than an accident of whichever list a new value happens to land in.
      expect([...TRUSTED_VISIT_SOURCES].sort()).toEqual(
        ['notification', 'ocr', 'slack', 'telegram', 'whatsapp'],
      );
    });
  });
});

describe('buildStoreCentres', () => {
  const at = (merchant: string, lat: number, lng: number): StoreVisit => ({
    merchant,
    lat,
    lng,
    source: 'ocr',
  });

  it('returns one centre per merchant that clears the visit floor', () => {
    const centres = buildStoreCentres(
      [at('Biedronka', 52.0, 21.0), at('Biedronka', 52.0001, 21.0001), at('Lidl', 52.5, 21.5)],
      2,
    );

    expect(centres.map((c) => c.merchant)).toEqual(['Biedronka']);
  });

  it('groups case-insensitively but keeps the first spelling seen', () => {
    const centres = buildStoreCentres([at('Biedronka', 52.0, 21.0), at('BIEDRONKA', 52.0, 21.0)], 2);

    expect(centres).toHaveLength(1);
    expect(centres[0].merchant).toBe('Biedronka');
  });

  it('excludes untrusted sources, exactly as the matcher does', () => {
    const sofa: StoreVisit[] = [
      { merchant: 'Netflix', lat: 52.0, lng: 21.0, source: 'manual' },
      { merchant: 'Netflix', lat: 52.0, lng: 21.0, source: 'voice' },
    ];

    expect(buildStoreCentres(sofa, 2)).toEqual([]);
  });

  it('returns centres sorted by name so the order is deterministic', () => {
    const centres = buildStoreCentres(
      [
        at('Zabka', 52.0, 21.0),
        at('Zabka', 52.0, 21.0),
        at('Aldi', 52.1, 21.1),
        at('Aldi', 52.1, 21.1),
      ],
      2,
    );

    expect(centres.map((c) => c.merchant)).toEqual(['Aldi', 'Zabka']);
  });

  it('skips null island', () => {
    expect(buildStoreCentres([at('Ghost', 0, 0), at('Ghost', 0, 0)], 2)).toEqual([]);
  });
});

describe('haversineM', () => {
  it('measures roughly 111 km per degree of latitude', () => {
    const d = haversineM({ lat: 52.0, lng: 21.0 }, { lat: 53.0, lng: 21.0 });

    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('is zero for the same point', () => {
    expect(haversineM({ lat: 52.0, lng: 21.0 }, { lat: 52.0, lng: 21.0 })).toBe(0);
  });
});

describe('isRealPoint', () => {
  it('rejects null island and non-finite values', () => {
    expect(isRealPoint({ lat: 0, lng: 0 })).toBe(false);
    expect(isRealPoint({ lat: Number.NaN, lng: 21.0 })).toBe(false);
    expect(isRealPoint({ lat: 52.0, lng: 21.0 })).toBe(true);
  });
});
