import { create } from 'zustand';

interface UpgradeState {
  visible: boolean;
  feature: string;
  requiredTier: 'pro' | 'business';
  show: (feature?: string, requiredTier?: 'pro' | 'business') => void;
  hide: () => void;
}

export const useUpgradeStore = create<UpgradeState>()((set) => ({
  visible: false,
  feature: '',
  requiredTier: 'pro',

  show: (feature = '', requiredTier = 'pro') =>
    set({ visible: true, feature, requiredTier }),

  hide: () => set({ visible: false }),
}));
