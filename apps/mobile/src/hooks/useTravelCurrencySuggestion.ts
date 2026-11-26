import { useCallback, useEffect, useRef, useState } from 'react';
import { suggestLocalCurrency, type LocalCurrencySuggestion } from '@budget/shared-utils';
import { countryFromLocation } from '@/features/travelCurrency/countryFromLocation';
import {
  useTravelCurrencyStore,
  activeRemembered,
  TRIP_WALLET_STREAK,
} from '@/features/travelCurrency/travelCurrencyStore';

/**
 * Local-currency nudge for the expense create form. `location` is the fix the form already
 * captured (null when permission or the capture toggle is off) - this hook never asks for
 * location itself.
 */
export function useTravelCurrencySuggestion(opts: {
  accountId: string | undefined;
  baseCurrency: string;
  currentCurrency: string;
  location: { lat: number; lng: number } | null;
}) {
  const { accountId, baseCurrency, currentCurrency, location } = opts;
  const dismissed = useTravelCurrencyStore((s) => s.dismissedCountries);
  const streak = useTravelCurrencyStore((s) => s.streak);
  const [country, setCountry] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!location) return;
    countryFromLocation(location.lat, location.lng).then((c) => {
      if (alive) setCountry(c);
    });
    return () => {
      alive = false;
    };
  }, [location?.lat, location?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestion: LocalCurrencySuggestion | null = hidden
    ? null
    : suggestLocalCurrency({
        countryCode: country,
        baseCurrency,
        currentCurrency,
        dismissedCountries: dismissed,
      });

  // Once per form session: a country change or remount inside the same session must not
  // push the trip-wallet streak further.
  const shownRef = useRef(false);
  const suggestionKey = suggestion?.countryCode;
  useEffect(() => {
    if (suggestionKey && !shownRef.current) {
      shownRef.current = true;
      useTravelCurrencyStore.getState().recordShown();
    }
  }, [suggestionKey]);

  const accept = useCallback(() => {
    if (suggestion && accountId) {
      useTravelCurrencyStore.getState().remember(accountId, suggestion.currency);
    }
    setHidden(true);
  }, [suggestion, accountId]);

  const dismiss = useCallback(() => {
    if (suggestion) useTravelCurrencyStore.getState().dismissCountry(suggestion.countryCode);
    useTravelCurrencyStore.getState().resetStreak();
    setHidden(true);
  }, [suggestion]);

  return { suggestion, accept, dismiss, suggestTripWallet: !!suggestion && streak >= TRIP_WALLET_STREAK };
}

/** Initial form currency: the remembered travel currency (14 days) for the account, if any. */
export function rememberedTravelCurrency(accountId: string | undefined): string | null {
  return activeRemembered(useTravelCurrencyStore.getState().remembered, accountId, Date.now());
}
