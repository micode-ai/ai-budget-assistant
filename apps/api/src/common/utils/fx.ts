/**
 * Shared FX helpers for services that must express amounts in ONE display currency.
 *
 * The formula and the fail-soft behaviour originate in AiToolsService and were
 * hand-copied at least five times (safe-to-spend, wrapped, inflation-shield,
 * trip-settle-up, plus fat-finder/story before this file existed) before all
 * five call sites were consolidated onto this module. New FX-consuming code
 * must import from here — do not add a sixth copy.
 *
 * Rate convention (open.er-api.com via ExchangeRateService): `1 base = rates[X] X`,
 * therefore `amount_in_base = amount / rates[from]`.
 */

/** Minimal surface of ExchangeRateService — keeps this util free of Nest DI. */
export interface FxRateProvider {
  getRates(baseCurrency: string): Promise<{ rates: Record<string, number> }>;
}

/**
 * Fetch rates for `base`, or null when the provider is unavailable. Never throws —
 * a rate-provider outage must not fail the feature that needed the conversion.
 */
export async function getRatesSafe(
  provider: FxRateProvider,
  base: string,
): Promise<Record<string, number> | null> {
  try {
    const { rates } = await provider.getRates(base);
    return rates || null;
  } catch {
    return null;
  }
}

/**
 * Convert `amount` from `from` into `base`.
 * Returns null when the rate is unknown — callers exclude the amount rather than
 * mislabel it, and flag the result as approximate.
 */
export function convertAmount(
  amount: number,
  from: string,
  base: string,
  rates: Record<string, number> | null,
): number | null {
  if (from === base) return amount;
  if (!rates) return null;
  const r = rates[from];
  if (!r || r <= 0) return null;
  return Math.round((amount / r) * 100) / 100;
}
