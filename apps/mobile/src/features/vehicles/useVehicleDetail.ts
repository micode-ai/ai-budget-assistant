import { useCallback, useEffect, useState } from 'react';
import type { Vehicle, VehicleCostKind, VehicleHistory, VehicleHistoryPeriod } from '@budget/shared-types';
import { api } from '@/services/api';
import { useVehicles } from './useVehicles';

export interface VehicleDetailState {
  vehicle: Vehicle | null;
  /** The last period that loaded; kept on screen while the next one loads. */
  history: VehicleHistory | null;
  period: VehicleHistoryPeriod;
  setPeriod: (p: VehicleHistoryPeriod) => void;
  /** A month (`YYYY-MM`) picked on the bar chart; narrows the breakdown and the list. */
  month: string | null;
  setMonth: (m: string | null) => void;
  /** A kind picked in the breakdown; narrows the list. */
  kind: VehicleCostKind | null;
  setKind: (k: VehicleCostKind | null) => void;
  loading: boolean;
  error: boolean;
  /** The vehicle list loaded and has no vehicle with this id. */
  notFound: boolean;
  retry: () => void;
}

/**
 * The vehicle screen's data (ABA-811). Called ONCE, in `VehicleDetailView`
 * above the 1024 split, and passed down — a resize swaps the layout but never
 * refetches or drops the picked period, month or kind.
 *
 * Online only, like the rest of vehicles: a failed load is `error`, never an
 * empty history.
 */
export function useVehicleDetail(vehicleId: string): VehicleDetailState {
  const { vehicles, isLoaded, accountId } = useVehicles();
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const [period, setPeriodState] = useState<VehicleHistoryPeriod>(12);
  const [month, setMonth] = useState<string | null>(null);
  const [kind, setKind] = useState<VehicleCostKind | null>(null);
  const [history, setHistory] = useState<VehicleHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!vehicleId || !accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .getVehicleHistory(vehicleId, period)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((err) => {
        // Expected offline; never console.error (LogBox shows it as a crash).
        console.warn('Vehicle history unavailable', err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, accountId, period, attempt, vehicle?.updatedAt]);

  const setPeriod = useCallback((p: VehicleHistoryPeriod) => {
    setPeriodState(p);
    // A picked month may not exist in the new period.
    setMonth(null);
  }, []);

  return {
    vehicle,
    history,
    period,
    setPeriod,
    month,
    setMonth,
    kind,
    setKind,
    loading,
    error,
    notFound: isLoaded && !vehicle,
    retry: () => setAttempt((n) => n + 1),
  };
}
