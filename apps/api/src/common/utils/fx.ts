/**
 * Shared FX helpers for services that must express amounts in ONE display currency.
 *
 * The formula and the fail-soft behaviour originate in AiToolsService (ai-tools.service.ts:37-53)
 * and were then hand-copied into safe-to-spend, wrapped and inflation-shield. New call sites
 * should import from here instead of adding a fifth copy; the older three are left as they are.
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
