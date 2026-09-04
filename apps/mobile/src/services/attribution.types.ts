/** Where a signup came from, as emitted by the marketing generators' `app_url()`
 * on every CTA into the app. Platform-free so both implementations share it. */
export interface Acquisition {
  src?: string;
  loc?: string;
  lang?: string;
  plan?: string;
}

/** The query keys we read, and the only ones we keep. */
export const ACQUISITION_KEYS = ['src', 'loc', 'lang', 'plan'] as const;

/** Charset the API also enforces. A value that fails it is dropped rather than sent:
 * attribution must never be the reason a registration is rejected. */
const SAFE = /^[A-Za-z0-9_-]{1,20}$/;

/** Pure: pull the acquisition fields out of a query string, keeping only values that
 * will survive the API's own validation. Returns undefined when nothing usable is
 * present, so callers can omit the field entirely rather than send an empty object. */
export function parseAcquisition(search: string): Acquisition | undefined {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return undefined;
  }
  const out: Acquisition = {};
  let found = false;
  for (const k of ACQUISITION_KEYS) {
    const v = params.get(k);
    if (v && SAFE.test(v)) {
      out[k] = v;
      found = true;
    }
  }
  return found ? out : fromUtm(params);
}

/**
 * Fold a `utm_*` value into something the API's charset will accept.
 *
 * Needed because the two schemes disagree on more than names: `utm_source` is
 * conventionally a hostname (`startupfa.me`), and a dot fails `SAFE` outright —
 * so without this every directory referral would be dropped by the very guard
 * meant to stop hostile input. Anything outside the allowed charset collapses to
 * a single dash, and the result is truncated to the API's 20-character limit
 * rather than dropped: `startupfa-me` is a worse label than `startupfa.me`, but
 * both beat "direct/unknown".
 */
function normalizeTag(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 20)
    // A cut can land mid-word and leave the dash dangling.
    .replace(/-+$/, '');
  return cleaned || undefined;
}

/**
 * Read the standard `utm_*` scheme when our own tags are absent.
 *
 * Every directory, newsletter and ad network tags its links this way — Startup
 * Fame, for one, sends `?utm_source=startupfa.me&utm_medium=referral`. Reading
 * only our own `?src=` meant all of that arrived as "direct/unknown", which is
 * precisely the traffic we most need to tell apart.
 *
 * Deliberately all-or-nothing rather than field-by-field: our own tags are more
 * precise, so if ANY of them is present the utm set is ignored entirely, and a
 * record never mixes `src=landing` with a medium from someone else's scheme.
 *
 * `utm_source` is required — `utm_medium=referral` on its own says how, but not
 * from where, and "where" is the whole question. Medium lands in `loc` because
 * that is the free secondary dimension, and its values (referral, cpc, email)
 * cannot be confused with our own placement vocabulary (hero, pricing_card,
 * footer, share, guest).
 */
function fromUtm(params: URLSearchParams): Acquisition | undefined {
  const src = normalizeTag(params.get('utm_source'));
  if (!src) return undefined;
  const loc = normalizeTag(params.get('utm_medium'));
  return loc ? { src, loc } : { src };
}

/** Referral codes are 6 chars from a no-0/O/1/I/L alphabet, but the bound is
 * deliberately loose: the server is the authority on what a valid code is, and
 * a client regex that is stricter than the server would silently drop a code
 * the server would have honoured. This only has to stop a hostile query string
 * from reaching a text input. */
const REFERRAL_CODE = /^[A-Za-z0-9]{4,12}$/;

/** Pure: pull `?ref=` out of a query string, normalised the way the register
 * screen stores it (uppercase). Returns undefined when absent or implausible. */
export function parseReferralCode(search: string): string | undefined {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return undefined;
  }
  const raw = params.get('ref');
  if (!raw || !REFERRAL_CODE.test(raw)) return undefined;
  return raw.toUpperCase();
}
