export interface GamificationProfileResponse {
  totalXp: number;
  level: number;
  levelProgress: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: string;
  achievements: Array<{
    achievementId: string;
    isCompleted: boolean;
    progress: number;
    unlockedAt?: string;
  }>;
  recentBadges: Array<{
    achievementId: string;
    unlockedAt: string;
  }>;
}

export interface CheckAchievementsResponse {
  newlyUnlocked: Array<{
    achievementId: string;
    unlockedAt: string;
  }>;
  updatedProgress: Array<{
    achievementId: string;
    progress: number;
  }>;
  streakUpdated: boolean;
  currentStreak: number;
}
