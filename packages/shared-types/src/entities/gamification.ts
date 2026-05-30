export type AchievementCategory = 'budget' | 'tracking' | 'streak' | 'milestone' | 'savings';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  icon: string;
  rarity: BadgeRarity;
  threshold?: number;
  xpReward: number;
  titleKey: string;
  descriptionKey: string;
}

export interface UserAchievement {
  id: string;
  userId: string;
  accountId: string;
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  unlockedAt?: Date;
  notified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStreak {
  id: string;
  userId: string;
  accountId: string;
  streakType: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date;
  streakStartDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GamificationProfile {
  totalXp: number;
  level: number;
  levelProgress: number;
  currentStreak: number;
  longestStreak: number;
  achievements: UserAchievement[];
  recentBadges: UserAchievement[];
}
