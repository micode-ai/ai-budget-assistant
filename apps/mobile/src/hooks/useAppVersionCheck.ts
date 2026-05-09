import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Application from 'expo-application';
import debug from 'debug';
import type { AppVersionCheckResponse } from '@budget/shared-types';
import { fetchVersionCheck } from '@/services/appVersion';

const log = debug('app:version-check');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type Status = 'available' | 'required' | 'up-to-date' | 'unknown';

interface State {
  status: Status;
  check: AppVersionCheckResponse | null;
}

let cached: { fetchedAt: number; state: State } | null = null;

export function useAppVersionCheck(): State {
  const [state, setState] = useState<State>(() => cached?.state ?? { status: 'unknown', check: null });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    async function run() {
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        setState(cached.state);
        return;
      }

      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;

      try {
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        const version = Application.nativeApplicationVersion ?? '0.0.0';
        const check = await fetchVersionCheck(platform, version, ctrl.signal);
        const status: Status = check.isUpdateRequired
          ? 'required'
          : check.isUpdateAvailable
            ? 'available'
            : 'up-to-date';
        const next: State = { status, check };
        cached = { fetchedAt: Date.now(), state: next };
        setState(next);
      } catch (err) {
        log('check failed: %o', err);
        // leave existing state; do not flip to error
      }
    }

    run();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') run();
    });
    return () => {
      sub.remove();
      inFlight.current?.abort();
    };
  }, []);

  return state;
}

// Test seam — clears the in-memory cache.
export function __resetAppVersionCheckCache() {
  cached = null;
}
