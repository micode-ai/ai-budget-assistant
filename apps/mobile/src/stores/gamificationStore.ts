import { create } from 'zustand';
import { api } from '@/services/api';
import * as gamificationRepo from '@/db/gamificationRepository';

interface AchievementProgress {
  achievementId: string;
  isCompleted: boolean;
  progress: number;
  unlockedAt?: string;
}

interface NewBadge {
  achievementId: string;
  unlockedAt: string;
}

interface GamificationState {
  totalXp: number;
  level: number;
  levelProgress: number;
  currentStreak: number;
  longestStreak: number;
  achievements: AchievementProgress[];
  recentBadges: NewBadge[];
  newBadgeToShow: NewBadge | null;
  isLoading: boolean;
  error: string | null;

  loadProfile: () => Promise<void>;
  checkAchievements: () => Promise<void>;
  dismissNewBadge: () => void;
  reset: () => void;
}

export const useGamificationStore = create<GamificationState>()((set, get) => ({
  totalXp: 0,
  level: 1,
  levelProgress: 0,
  currentStreak: 0,
  longestStreak: 0,
  achievements: [],
  recentBadges: [],
  newBadgeToShow: null,
  isLoading: false,
  error: null,

  loadProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const profile = await api.getGamificationProfile();
      set({
        totalXp: profile.totalXp,
        level: profile.level,
        levelProgress: profile.levelProgress,
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        achievements: profile.achievements,
        recentBadges: profile.recentBadges,
        isLoading: false,
      });

      // Cache achievements locally
      for (const a of profile.achievements) {
        try {
          await gamificationRepo.upsertAchievement(a);
        } catch {}
      }
      // Cache streak locally
      try {
        await gamificationRepo.upsertStreak({
          currentStreak: profile.currentStreak,
          longestStreak: profile.longestStreak,
          lastActivityDate: profile.lastActivityDate,
        });
      } catch {}
    } catch (err) {
      // Try loading from local cache
      try {
        const localAchievements = await gamificationRepo.getAllAchievements();
        const localStreak = await gamificationRepo.getStreak();
        set({
          achievements: localAchievements.map((a) => ({
            achievementId: a.achievementId,
            isCompleted: a.isCompleted,
            progress: a.progress,
            unlockedAt: a.unlockedAt?.toISOString(),
          })),
          currentStreak: localStreak?.currentStreak || 0,
          longestStreak: localStreak?.longestStreak || 0,
          isLoading: false,
        });
      } catch {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load gamification',
        });
      }
    }
  },

  checkAchievements: async () => {
    try {
      const result = await api.checkAchievements();

      if (result.newlyUnlocked && result.newlyUnlocked.length > 0) {
        // Show the first newly unlocked badge
        set({ newBadgeToShow: result.newlyUnlocked[0] });

        // Refresh full profile to get updated data
        get().loadProfile();
      } else {
        // Update streak at least
        set((state) => ({
          currentStreak: result.currentStreak ?? state.currentStreak,
        }));
      }
    } catch {
      // Silently fail - gamification should never block core operations
    }
  },

  dismissNewBadge: () => {
    set({ newBadgeToShow: null });
  },

  reset: () => {
    set({
      totalXp: 0,
      level: 1,
      levelProgress: 0,
      currentStreak: 0,
      longestStreak: 0,
      achievements: [],
      recentBadges: [],
      newBadgeToShow: null,
      isLoading: false,
      error: null,
    });
    gamificationRepo.clearGamificationData().catch(() => {});
  },
}));
