import { createHash } from 'crypto';

/** One promo as the community layer keys it. Dates are `YYYY-MM-DD` strings or `@db.Date` values. */
export interface PromoIdentity {
  chain: string;
  canonicalName: string;
  promoPrice: number | string | { toString(): string };
  currencyCode: string;
  validFrom: Date | string;
  validTo: Date | string;
}

const ymd = (d: Date | string): string => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

/**
 * Stable key of one promo: (chain, canonicalName, promoPrice to the cent, currency, validFrom,
 * validTo) — the same fields as the observation table's unique key minus the contributor. It is a
 * hash so it is compact and safe to use as a cache/dedup key; fields are JSON-encoded first so a
 * separator inside a name cannot make two different promos collide.
 */
export function promoKey(p: PromoIdentity): string {
  const parts = [
    p.chain,
    p.canonicalName,
    Number(p.promoPrice.toString()).toFixed(2),
    p.currencyCode,
    ymd(p.validFrom),
    ymd(p.validTo),
  ];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

/**
 * Community confirmation of one promo's rows. Any admin row confirms it on its own (an admin
 * upload is confirmed on publish); otherwise it needs at least `k` distinct contributors, of whom
 * at least `minTrusted` are trusted. A contributor counts once, and counts as trusted when any of
 * their rows is.
 */
export function isPromoConfirmed(
  rows: { contributorKey: string; trusted: boolean; isAdmin: boolean }[],
  k: number,
  minTrusted: number,
): boolean {
  if (rows.some((r) => r.isAdmin)) return true;
  const contributors = new Map<string, boolean>();
  for (const r of rows) contributors.set(r.contributorKey, (contributors.get(r.contributorKey) ?? false) || r.trusted);
  const trusted = [...contributors.values()].filter(Boolean).length;
  return contributors.size >= k && trusted >= minTrusted;
}
