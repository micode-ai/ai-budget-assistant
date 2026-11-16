/**
 * Pure helpers for the vehicle screens (ABA-796): reading what the user typed
 * into the fill-up form, and the numbers each card shows.
 */

/** "42,5" or "42.5" → 42.5; anything that is not a positive number → null. */
export function parseLiters(text: string): number | null {
  const v = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 1000) / 1000; // the API accepts three decimals
}

/** "123 456" → 123456; a fractional or negative reading → null. */
export function parseOdometer(text: string): number | null {
  const cleaned = text.trim().replace(/[\s  .,']/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const v = Number(cleaned);
  return Number.isSafeInteger(v) ? v : null;
}

/** "6.4" in the user's locale, or null when the stat is not known yet. */
export function formatConsumption(lPer100Km: number | null, locale: string): string | null {
  if (lPer100Km === null) return null;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(lPer100Km);
}

export function formatKm(km: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(km);
}

/**
 * Whether the stats can say anything yet. The full-tank method needs a first
 * full fill as the baseline and a second one to close an interval, so until
 * then the card explains what is missing instead of showing dashes.
 */
export function hasConsumption(stats: { consumptionLPer100Km: number | null } | null): boolean {
  return !!stats && stats.consumptionLPer100Km !== null;
}

/** kWh for an electric car, litres for everything else. */
export function fuelUnitKey(fuelType: string): 'vehicles.unitKwh' | 'vehicles.unitLiters' {
  return fuelType === 'electric' ? 'vehicles.unitKwh' : 'vehicles.unitLiters';
}

/** `YYYY-MM-DD` (or a full ISO stamp) as the local calendar day it names — never `new Date(string)`, which reads UTC. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
