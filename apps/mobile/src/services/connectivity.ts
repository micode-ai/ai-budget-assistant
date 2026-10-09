import { create } from 'zustand';
import { createConnectivity, type ConnectivityStatus } from './connectivityCore';
import { startPlatformListeners } from './connectivityListeners';

/**
 * App-wide "can I reach the API" signal (ABA-648), pure JS - no NetInfo/expo-network.
 * `http-client.ts` reports every fetch outcome here; `useConnectivity` reads it.
 * `unknown` counts as online, so nothing is disabled before the first answer.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export const useConnectivityStore = create<{ status: ConnectivityStatus }>(() => ({
  status: 'unknown',
}));

async function probeHealth(): Promise<boolean> {
  try {
    // Any HTTP response (even 429/503) means the network path works.
    await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    return true;
  } catch {
    return false;
  }
}

const connectivity = createConnectivity({
  probe: probeHealth,
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onChange: (status) => useConnectivityStore.setState({ status }),
});

let listening = false;
export function ensureConnectivityListeners(): void {
  if (listening) return;
  listening = true;
  startPlatformListeners(() => connectivity.recheck());
}

export const reportApiResponse = () => connectivity.reportResponse();
export const reportApiFetchFailure = () => connectivity.reportFetchFailure();
