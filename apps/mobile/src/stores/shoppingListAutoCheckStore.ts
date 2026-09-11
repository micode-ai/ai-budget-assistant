import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'shopping-list-auto-check' });
const KEY = 'enabled';

interface ShoppingListAutoCheckState {
  /**
   * Auto-check off shopping-list items that show up on a scanned receipt
   * (ABA shopping-list-receipt-reconciliation). Default ON, unlike
   * `locationSettingsStore`'s capture toggle — this is a convenience
   * automation, not a privacy-sensitive capture, so it defaults to doing the
   * helpful thing. Device-local only, not server-synced (a personal
   * automation preference, not account data) and not reset on logout, same
   * treatment as `locationSettingsStore`.
   */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useShoppingListAutoCheckStore = create<ShoppingListAutoCheckState>((set) => ({
  enabled: mmkv.getString(KEY) !== 'false',
  setEnabled: (enabled) => {
    mmkv.set(KEY, String(enabled));
    set({ enabled });
  },
}));
