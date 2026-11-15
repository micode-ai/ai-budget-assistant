import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';
import type { CashFlowForecastResponse } from '@budget/shared-types';

/**
 * The 30-day forecast from `GET /insights/cash-flow-forecast`, for the current
 * account. `null` while loading, offline, on error and for a fully encrypted
 * account — the card is then simply not drawn, never drawn from a guess.
 * There is no device-side fallback on purpose: the forecast needs income
 * cadence, subscriptions and the wallet, which only the server has together.
 */
export function useCashFlowForecast(enabled: boolean): CashFlowForecastResponse | null {
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const [state, setState] = useState<{ accountId: string; data: CashFlowForecastResponse } | null>(null);

  useEffect(() => {
    if (!enabled || !currentAccountId) return;
    let cancelled = false;
    api
      .getCashFlowForecast()
      .then((data) => {
        if (!cancelled) setState({ accountId: currentAccountId, data });
      })
      .catch((err) => {
        // Expected offline; never console.error (LogBox shows it as a crash).
        console.warn('Cash-flow forecast unavailable', err);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, currentAccountId]);

  if (!enabled || !state || state.accountId !== currentAccountId) return null;
  if (state.data.encryptionRestricted || !state.data.days?.length) return null;
  return state.data;
}
