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
  return found ? out : undefined;
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
