import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'location-settings' });
const KEY = 'captureEnabled';

interface LocationSettingsState {
  /**
   * Attach device GPS to expenses created "live". Default ON: only an explicit
   * OFF from settings is stored as 'false' and stays off. The OS permission is
   * still asked once, from a foreground add-expense screen (`locationCapture`).
   */
  captureEnabled: boolean;
  setCaptureEnabled: (enabled: boolean) => void;
}

export const useLocationSettingsStore = create<LocationSettingsState>((set) => ({
  captureEnabled: mmkv.getString(KEY) !== 'false',
  setCaptureEnabled: (enabled) => {
    mmkv.set(KEY, String(enabled));
    set({ captureEnabled: enabled });
  },
}));
