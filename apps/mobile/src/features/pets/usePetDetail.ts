import { useCallback, useEffect, useState } from 'react';
import type { Pet, PetCostKind, PetHistory, PetHistoryPeriod } from '@budget/shared-types';
import { api } from '@/services/api';
import { usePets } from './usePets';

export interface PetDetailState {
  pet: Pet | null;
  /** The last period that loaded; kept on screen while the next one loads. */
  history: PetHistory | null;
  period: PetHistoryPeriod;
  setPeriod: (p: PetHistoryPeriod) => void;
  /** A month (`YYYY-MM`) picked on the bar chart; narrows the breakdown and the list. */
  month: string | null;
  setMonth: (m: string | null) => void;
  /** A kind picked in the breakdown; narrows the list. */
  kind: PetCostKind | null;
  setKind: (k: PetCostKind | null) => void;
  loading: boolean;
  error: boolean;
  /** The pet list loaded and has no pet with this id. */
  notFound: boolean;
  retry: () => void;
  /** Unlink one expense from the pet, then reload the period. Rejects on failure. */
  removeCost: (expenseId: string) => Promise<void>;
}

/**
 * The pet screen's data (ABA-831). Called ONCE, in `PetDetailView` above the
 * 1024 split, and passed down — a resize swaps the layout but never refetches
 * or drops the picked period, month or kind.
 *
 * Online only: a failed load is `error`, never an empty history.
 */
export function usePetDetail(petId: string): PetDetailState {
  const { pets, isLoaded, accountId } = usePets();
  const pet = pets.find((p) => p.id === petId) ?? null;
  const [period, setPeriodState] = useState<PetHistoryPeriod>(12);
  const [month, setMonth] = useState<string | null>(null);
  const [kind, setKind] = useState<PetCostKind | null>(null);
  const [history, setHistory] = useState<PetHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!petId || !accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .getPetHistory(petId, period)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((err) => {
        // Expected offline; never console.error (LogBox shows it as a crash).
        console.warn('Pet history unavailable', err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [petId, accountId, period, attempt, pet?.updatedAt]);

  const setPeriod = useCallback((p: PetHistoryPeriod) => {
    setPeriodState(p);
    // A picked month may not exist in the new period.
    setMonth(null);
  }, []);

  const removeCost = useCallback(async (expenseId: string) => {
    await api.removePetCost(expenseId);
    setAttempt((n) => n + 1);
  }, []);

  return {
    pet,
    history,
    period,
    setPeriod,
    month,
    setMonth,
    kind,
    setKind,
    loading,
    error,
    notFound: isLoaded && !pet,
    retry: () => setAttempt((n) => n + 1),
    removeCost,
  };
}
