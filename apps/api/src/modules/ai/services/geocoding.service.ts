import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string | null;
}

export interface GeocodeSearchResult {
  lat: number;
  lng: number;
  name: string;
}

const SEARCH_CACHE_TTL_S = 3600;

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim usage policy requires an identifying User-Agent.
const USER_AGENT = 'ai-budget-assistant/1.0 (https://ai-budget.pl)';
const REQUEST_TIMEOUT_MS = 5000;
// Usage policy: max 1 request/second. Single API container → in-process limiter suffices.
const MIN_REQUEST_GAP_MS = 1100;

export interface StructuredAddress {
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/** Trim, collapse whitespace, lowercase. Null for unusably short input. */
export function normalizeGeocodeQuery(address: string | null | undefined): string | null {
  if (!address) return null;
  const q = address.replace(/\s+/g, ' ').trim().toLowerCase();
  return q.length >= 5 ? q : null;
}

/** Trim + collapse whitespace on one structured component. Null when empty. */
function cleanPart(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

// Leading street-type words/abbreviations (PL + UA/RU/BY). Nominatim's structured
// `street` param expects "<number> <name>" WITHOUT the type prefix — e.g.
// "ul. Wojska Polskiego 1" fails, "Wojska Polskiego 1" hits the exact building.
const STREET_PREFIX_RE =
  /^(?:ul|ulica|al|aleja|pl|plac|os|osiedle|вул|вулиця|ул|улица|пр|просп|проспект|пер|переулок|пров|провулок)\.?\s+/iu;

/** Clean a street line and strip a leading street-type prefix for geocoding. */
export function normalizeStreetForGeocode(s: string | null | undefined): string | null {
  const base = cleanPart(s);
  if (!base) return null;
  const stripped = base.replace(STREET_PREFIX_RE, '').trim();
  return stripped.length > 0 ? stripped : base;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastRequestAt = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  /**
   * Forward-geocode a free-text query into up to 5 candidate places (for the
   * expense location-picker search box). Fail-silent: any failure / too-short
   * query returns []. Results (incl. an empty "no matches" answer) are cached in
   * Redis (the geocode_cache table holds one result per key, so it can't store a
   * list); transient errors are NOT cached.
   */
  async search(query: string): Promise<GeocodeSearchResult[]> {
    const q = (query || '').replace(/\s+/g, ' ').trim();
    if (q.length < 3) return [];
    const key = `geo:search:${q.toLowerCase()}`;
    try {
      if (this.cache) {
        const cached = await this.cache.get<GeocodeSearchResult[]>(key);
        if (cached) return cached;
      }
      const url = `${NOMINATIM_URL}?format=json&limit=5&q=${encodeURIComponent(q)}`;
      const results = await this.throttled(() => this.fetchNominatimList(url, q));
      if (results === 'error') return []; // transient — retryable, do not cache
      if (this.cache) await this.cache.set(key, results, SEARCH_CACHE_TTL_S);
      return results;
    } catch (e) {
      this.logger.warn(`geocode search failed for "${q}": ${e}`);
      return [];
    }
  }

  /**
   * Geocode a free-text address. Fail-silent by design: any failure returns
   * null — receipt scanning must never break because of geocoding.
   * Negative results ("no match") ARE cached; transient errors are NOT.
   */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const query = normalizeGeocodeQuery(address);
    if (!query) return null;
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    return this.resolve(query, url);
  }

  /**
   * Geocode a STRUCTURED address via Nominatim's structured endpoint
   * (street/city/postalcode/country params). Far more robust than free text on
   * noisy receipts (e.g. Polish receipts that print the store address AND the
   * company's registered seat) — the caller passes only the store's own parts,
   * so unrelated tokens can't derail the match. Requires at least a city or a
   * postal code (a street alone is too ambiguous). Same fail-silent + caching
   * contract as {@link geocode}.
   */
  async geocodeStructured(parts: StructuredAddress): Promise<GeocodeResult | null> {
    const street = normalizeStreetForGeocode(parts.street);
    const city = cleanPart(parts.city);
    const postalCode = cleanPart(parts.postalCode);
    const country = cleanPart(parts.country);
    if (!city && !postalCode) return null;

    // Tier 1: full address (street + city/postcode). Nominatim returns the exact
    // building when the street resolves.
    if (street) {
      const exact = await this.resolveStructured(street, city, postalCode, country);
      if (exact) return exact;
    }
    // Tier 2: drop the street → town/postcode centroid. Guarantees a pin whenever
    // the city or postal code is geocodable, which it almost always is.
    return this.resolveStructured(null, city, postalCode, country);
  }

  private resolveStructured(
    street: string | null,
    city: string | null,
    postalCode: string | null,
    country: string | null,
  ): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({ format: 'json', limit: '1' });
    if (street) params.set('street', street);
    if (city) params.set('city', city);
    if (postalCode) params.set('postalcode', postalCode);
    if (country) params.set('country', country);
    const url = `${NOMINATIM_URL}?${params.toString()}`;

    // Canonical, order-stable cache key; the `struct|` prefix keeps it disjoint
    // from free-text keys (which are lowercased address strings).
    const cacheKey =
      `struct|street=${(street ?? '').toLowerCase()}` +
      `|city=${(city ?? '').toLowerCase()}` +
      `|postalcode=${(postalCode ?? '').toLowerCase()}` +
      `|country=${(country ?? '').toLowerCase()}`;

    return this.resolve(cacheKey, url);
  }

  /**
   * Shared cache-read → throttled fetch → cache-write core for both the
   * free-text and structured paths. Fail-silent: any error returns null.
   * Negative results ("no match") ARE cached under `cacheKey`; transient
   * errors are NOT.
   */
  private async resolve(cacheKey: string, url: string): Promise<GeocodeResult | null> {
    try {
      const cached = await this.prisma.geocodeCache.findUnique({
        where: { queryNormalized: cacheKey },
      });
      if (cached) {
        if (cached.lat == null || cached.lng == null) return null; // negative cache
        return { lat: Number(cached.lat), lng: Number(cached.lng), displayName: cached.displayName };
      }

      const fetched = await this.throttled(() => this.fetchNominatim(url, cacheKey));
      if (fetched === 'error') return null; // transient — retryable next time, do not cache

      await this.prisma.geocodeCache.upsert({
        where: { queryNormalized: cacheKey },
        create: {
          queryNormalized: cacheKey,
          lat: fetched?.lat ?? null,
          lng: fetched?.lng ?? null,
          displayName: fetched?.displayName ?? null,
        },
        update: {},
      });
      return fetched;
    } catch (e) {
      this.logger.warn(`geocode failed for "${cacheKey}": ${e}`);
      return null;
    }
  }

  /** Serialize all Nominatim calls with a >=1.1s gap between them. */
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return fn();
    };
    const p = this.chain.then(run, run);
    this.chain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  /** null = confirmed no results (cacheable); 'error' = transient failure (not cacheable). */
  private async fetchNominatim(url: string, label: string): Promise<GeocodeResult | null | 'error'> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Nominatim returned ${res.status} for "${label}"`);
        return 'error';
      }
      const body = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      if (!Array.isArray(body) || body.length === 0) return null;
      const lat = Number(body[0].lat);
      const lng = Number(body[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'error';
      return { lat, lng, displayName: body[0].display_name ?? null };
    } catch (e) {
      this.logger.warn(`Nominatim request failed for "${label}": ${e}`);
      return 'error';
    }
  }

  /** Multi-result variant for search(). [] = no matches (cacheable); 'error' = transient. */
  private async fetchNominatimList(url: string, label: string): Promise<GeocodeSearchResult[] | 'error'> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Nominatim returned ${res.status} for "${label}"`);
        return 'error';
      }
      const body = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      if (!Array.isArray(body)) return 'error';
      const out: GeocodeSearchResult[] = [];
      for (const r of body) {
        const lat = Number(r.lat);
        const lng = Number(r.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          out.push({ lat, lng, name: r.display_name ?? '' });
        }
      }
      return out;
    } catch (e) {
      this.logger.warn(`Nominatim search failed for "${label}": ${e}`);
      return 'error';
    }
  }
}
