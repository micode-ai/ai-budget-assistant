import { create } from 'zustand';
import { api } from '../services/api';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import i18n from '@/i18n';
import { buildReferralShareMessage } from '@/features/referral/referralLink';
import type { ReferralStatsDto, ReferralListItemDto } from '@budget/shared-types';

interface ReferralState {
  code: string | null;
  stats: ReferralStatsDto | null;
  referrals: ReferralListItemDto[];
  isLoading: boolean;
  error: string | null;

  loadCode: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadReferrals: () => Promise<void>;
  shareCode: () => Promise<void>;
  copyCode: () => Promise<boolean>;
  reset: () => void;
}

export const useReferralStore = create<ReferralState>()((set, get) => ({
  code: null,
  stats: null,
  referrals: [],
  isLoading: false,
  error: null,

  loadCode: async () => {
    try {
      const result = await api.getReferralCode();
      set({ code: result.code });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load referral code' });
    }
  },

  loadStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const stats = await api.getReferralStats();
      set({ stats, code: stats.referralCode, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load referral stats',
        isLoading: false,
      });
    }
  },

  loadReferrals: async () => {
    try {
      const referrals = await api.getReferralList();
      set({ referrals });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load referrals' });
    }
  },

  shareCode: async () => {
    const { code } = get();
    if (!code) return;
    try {
      await Share.share({
        message: buildReferralShareMessage(code, i18n.t('referral.shareText', { code })),
      });
    } catch {
      // User cancelled share
    }
  },

  copyCode: async () => {
    const { code } = get();
    if (!code) return false;
    await Clipboard.setStringAsync(code);
    return true;
  },

  reset: () => set({ code: null, stats: null, referrals: [], isLoading: false, error: null }),
}));
