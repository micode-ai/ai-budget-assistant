import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string | null;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim usage policy requires an identifying User-Agent.
const USER_AGENT = 'ai-budget-assistant/1.0 (https://ai-budget.pl)';
const REQUEST_TIMEOUT_MS = 5000;
// Usage policy: max 1 request/second. Single API container → in-process limiter suffices.
const MIN_REQUEST_GAP_MS = 1100;

/** Trim, collapse whitespace, lowercase. Null for unusably short input. */
export function normalizeGeocodeQuery(address: string | null | undefined): string | null {
  if (!address) return null;
  const q = address.replace(/\s+/g, ' ').trim().toLowerCase();
  return q.length >= 5 ? q : null;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastRequestAt = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Geocode a free-text address. Fail-silent by design: any failure returns
   * null — receipt scanning must never break because of geocoding.
   * Negative results ("no match") ARE cached; transient errors are NOT.
   */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const query = normalizeGeocodeQuery(address);
    if (!query) return null;

    try {
      const cached = await this.prisma.geocodeCache.findUnique({
        where: { queryNormalized: query },
      });
      if (cached) {
        if (cached.lat == null || cached.lng == null) return null; // negative cache
        return { lat: Number(cached.lat), lng: Number(cached.lng), displayName: cached.displayName };
      }

      const fetched = await this.throttled(() => this.queryNominatim(query));
      if (fetched === 'error') return null; // transient — retryable next time, do not cache

      await this.prisma.geocodeCache.upsert({
        where: { queryNormalized: query },
        create: {
          queryNormalized: query,
          lat: fetched?.lat ?? null,
          lng: fetched?.lng ?? null,
          displayName: fetched?.displayName ?? null,
        },
        update: {},
      });
      return fetched;
    } catch (e) {
      this.logger.warn(`geocode failed for "${query}": ${e}`);
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
  private async queryNominatim(query: string): Promise<GeocodeResult | null | 'error'> {
    try {
      const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Nominatim returned ${res.status} for "${query}"`);
        return 'error';
      }
      const body = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      if (!Array.isArray(body) || body.length === 0) return null;
      const lat = Number(body[0].lat);
      const lng = Number(body[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'error';
      return { lat, lng, displayName: body[0].display_name ?? null };
    } catch (e) {
      this.logger.warn(`Nominatim request failed for "${query}": ${e}`);
      return 'error';
    }
  }
}
