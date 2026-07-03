import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'location-settings' });
const KEY = 'captureEnabled';

interface LocationSettingsState {
  /** Opt-in: silently attach device GPS to expenses created "live". Default OFF. */
  captureEnabled: boolean;
  setCaptureEnabled: (enabled: boolean) => void;
}

export const useLocationSettingsStore = create<LocationSettingsState>((set) => ({
  captureEnabled: mmkv.getString(KEY) === 'true',
  setCaptureEnabled: (enabled) => {
    mmkv.set(KEY, String(enabled));
    set({ captureEnabled: enabled });
  },
}));
