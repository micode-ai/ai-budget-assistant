import type { ExchangeRateWatch } from '@budget/shared-types';

/**
 * Splits the user's rate alerts into the ones still waiting and the ones that
 * already fired.
 *
 * The screen needs both: an alert is one-shot, so once it fires the row is the
 * ONLY record that it ever did — the push can be swiped away, and before the
 * dedicated screen existed a fired alert was invisible in the app entirely
 * (`getWatchesForPair` filters on `isActive`).
 *
 * `createdAt`/`triggeredAt` are typed `Date` but arrive as ISO strings, because
 * `exchangeRateWatchStore` stores the API response untouched — hence `toTime`
 * rather than `.getTime()`.
 */
export interface RateAlertGroups {
  active: ExchangeRateWatch[];
  triggered: ExchangeRateWatch[];
}

/** Fired alerts are history and accumulate forever server-side; waiting ones never cap. */
const DEFAULT_MAX_TRIGGERED = 10;

function toTime(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function partitionRateAlerts(
  watches: ExchangeRateWatch[],
  options?: { maxTriggered?: number },
): RateAlertGroups {
  const maxTriggered = options?.maxTriggered ?? DEFAULT_MAX_TRIGGERED;

  const active = watches
    .filter((w) => w.isActive)
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

  const triggered = watches
    .filter((w) => !w.isActive)
    // A row with no timestamp sorts to 0 and therefore last, rather than
    // throwing on a nullable field.
    .sort((a, b) => toTime(b.triggeredAt) - toTime(a.triggeredAt))
    .slice(0, maxTriggered);

  return { active, triggered };
}
