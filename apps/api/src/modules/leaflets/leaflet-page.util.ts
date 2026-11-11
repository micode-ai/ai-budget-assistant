export interface RawLeafletItem {
  name: string;
  canonicalName: string;
  promoPrice: number;
  regularPrice: number | null;
  currencyCode: string;
  condition: string | null;
  validFrom: string | null;
  validTo: string | null;
  basketIndex: number | null;
}

export interface NormalizedLeafletPage {
  readable: boolean;
  chain: string | null;
  validFrom: string | null;
  validTo: string | null;
  items: RawLeafletItem[];
}

const NULLABLE_STRING = { type: ['string', 'null'] } as const;
const NULLABLE_NUMBER = { type: ['number', 'null'] } as const;

/** Strict structured-output schema; `normalizeLeafletPage` stays as defence. */
export const LEAFLET_PAGE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'leaflet_page',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['chain', 'validFrom', 'validTo', 'items'],
      properties: {
        chain: NULLABLE_STRING,
        validFrom: NULLABLE_STRING,
        validTo: NULLABLE_STRING,
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'name', 'canonicalName', 'promoPrice', 'regularPrice', 'currencyCode', 'condition',
              'validFrom', 'validTo', 'basketIndex',
            ],
            properties: {
              name: { type: 'string' },
              canonicalName: { type: 'string' },
              promoPrice: NULLABLE_NUMBER,
              regularPrice: NULLABLE_NUMBER,
              currencyCode: NULLABLE_STRING,
              condition: NULLABLE_STRING,
              validFrom: NULLABLE_STRING,
              validTo: NULLABLE_STRING,
              basketIndex: { type: ['integer', 'null'] },
            },
          },
        },
      },
    },
  },
};

function str(v: unknown, max = 120): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function money(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** Parses `YYYY-MM-DD`, `DD.MM.YYYY` or `DD.MM` (year from `now`; next year if > 300 days in the past). */
function parseDate(v: unknown, now: Date): string | null {
  const s = str(v, 30);
  if (!s) return null;
  let y: number;
  let m: number;
  let d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (mt) {
    y = +mt[1];
    m = +mt[2];
    d = +mt[3];
  } else if ((mt = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s))) {
    d = +mt[1];
    m = +mt[2];
    y = +mt[3];
  } else if ((mt = /^(\d{1,2})[./](\d{1,2})\.?$/.exec(s))) {
    d = +mt[1];
    m = +mt[2];
    y = now.getUTCFullYear();
    const dt = validYmd(y, m, d);
    // A year-less date is read as the one nearest to now: a January leaflet read in December is
    // next year's, a December leaflet read in January is last year's.
    if (dt && now.getTime() - dt.getTime() > 300 * DAY_MS) y += 1;
    else if (dt && dt.getTime() - now.getTime() > 300 * DAY_MS) y -= 1;
  } else {
    return null;
  }
  return validYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

function validRange(from: string | null, to: string | null): string | null {
  return to && from && to < from ? null : to;
}

/**
 * Turns the model's JSON for one leaflet page into safe facts. Pure — the model's
 * output is untrusted: any field can be missing, mistyped or absurd.
 */
export function normalizeLeafletPage(raw: unknown, basketSize: number, now: Date): NormalizedLeafletPage {
  const empty: NormalizedLeafletPage = { readable: false, chain: null, validFrom: null, validTo: null, items: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  const validFrom = parseDate(r.validFrom, now);
  const validTo = validRange(validFrom, parseDate(r.validTo, now));

  const items: RawLeafletItem[] = [];
  for (const entry of Array.isArray(r.items) ? r.items : []) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = str(e.name);
    const promoPrice = money(e.promoPrice);
    const currency = str(e.currencyCode, 3)?.toUpperCase() ?? null;
    if (!name || promoPrice == null || !currency || !/^[A-Z]{3}$/.test(currency)) continue;
    const regular = money(e.regularPrice);
    const from = parseDate(e.validFrom, now);
    const idx = e.basketIndex;
    items.push({
      name,
      canonicalName: str(e.canonicalName) ?? name,
      promoPrice,
      // A "regular" price no higher than the promo one is not a promo.
      regularPrice: regular != null && regular > promoPrice ? regular : null,
      currencyCode: currency,
      condition: str(e.condition, 60),
      validFrom: from,
      validTo: validRange(from, parseDate(e.validTo, now)),
      basketIndex: typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < basketSize ? idx : null,
    });
  }
  return { readable: items.length > 0, chain: str(r.chain, 60), validFrom, validTo, items };
}
