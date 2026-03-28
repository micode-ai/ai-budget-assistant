export interface AchievementDef {
  id: string;
  category: 'budget' | 'tracking' | 'streak' | 'milestone' | 'savings' | 'social';
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  threshold?: number;
  xpReward: number;
  titleKey: string;
  descriptionKey: string;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
  // Tracking milestones
  { id: 'first_expense', category: 'milestone', icon: '🌟', rarity: 'common', threshold: 1, xpReward: 10, titleKey: 'gamification.achievements.firstExpense.title', descriptionKey: 'gamification.achievements.firstExpense.description' },
  { id: 'expenses_10', category: 'milestone', icon: '📝', rarity: 'common', threshold: 10, xpReward: 25, titleKey: 'gamification.achievements.expenses10.title', descriptionKey: 'gamification.achievements.expenses10.description' },
  { id: 'expenses_50', category: 'milestone', icon: '📊', rarity: 'rare', threshold: 50, xpReward: 50, titleKey: 'gamification.achievements.expenses50.title', descriptionKey: 'gamification.achievements.expenses50.description' },
  { id: 'expenses_100', category: 'milestone', icon: '🏆', rarity: 'epic', threshold: 100, xpReward: 100, titleKey: 'gamification.achievements.expenses100.title', descriptionKey: 'gamification.achievements.expenses100.description' },
  { id: 'expenses_500', category: 'milestone', icon: '💎', rarity: 'legendary', threshold: 500, xpReward: 250, titleKey: 'gamification.achievements.expenses500.title', descriptionKey: 'gamification.achievements.expenses500.description' },

  // Budget achievements
  { id: 'first_budget', category: 'budget', icon: '🎯', rarity: 'common', threshold: 1, xpReward: 15, titleKey: 'gamification.achievements.firstBudget.title', descriptionKey: 'gamification.achievements.firstBudget.description' },
  { id: 'budget_month_no_exceed', category: 'budget', icon: '🌟', rarity: 'rare', xpReward: 75, titleKey: 'gamification.achievements.budgetMonthNoExceed.title', descriptionKey: 'gamification.achievements.budgetMonthNoExceed.description' },
  { id: 'budget_3months_no_exceed', category: 'budget', icon: '🔥', rarity: 'epic', xpReward: 200, titleKey: 'gamification.achievements.budget3MonthsNoExceed.title', descriptionKey: 'gamification.achievements.budget3MonthsNoExceed.description' },

  // Streak achievements
  { id: 'streak_3', category: 'streak', icon: '🔥', rarity: 'common', threshold: 3, xpReward: 15, titleKey: 'gamification.achievements.streak3.title', descriptionKey: 'gamification.achievements.streak3.description' },
  { id: 'streak_7', category: 'streak', icon: '⚡', rarity: 'rare', threshold: 7, xpReward: 35, titleKey: 'gamification.achievements.streak7.title', descriptionKey: 'gamification.achievements.streak7.description' },
  { id: 'streak_30', category: 'streak', icon: '💪', rarity: 'epic', threshold: 30, xpReward: 150, titleKey: 'gamification.achievements.streak30.title', descriptionKey: 'gamification.achievements.streak30.description' },
  { id: 'streak_100', category: 'streak', icon: '🏅', rarity: 'legendary', threshold: 100, xpReward: 500, titleKey: 'gamification.achievements.streak100.title', descriptionKey: 'gamification.achievements.streak100.description' },

  // Savings achievements
  { id: 'first_income', category: 'savings', icon: '💰', rarity: 'common', threshold: 1, xpReward: 10, titleKey: 'gamification.achievements.firstIncome.title', descriptionKey: 'gamification.achievements.firstIncome.description' },
  { id: 'net_positive_month', category: 'savings', icon: '💵', rarity: 'rare', xpReward: 50, titleKey: 'gamification.achievements.netPositiveMonth.title', descriptionKey: 'gamification.achievements.netPositiveMonth.description' },

  // Social achievements (referrals)
  { id: 'referrals_5', category: 'social', icon: '🤝', rarity: 'epic', threshold: 5, xpReward: 150, titleKey: 'gamification.achievements.referrals5.title', descriptionKey: 'gamification.achievements.referrals5.description' },
  { id: 'referrals_10_ambassador', category: 'social', icon: '🏅', rarity: 'legendary', threshold: 10, xpReward: 500, titleKey: 'gamification.achievements.ambassador.title', descriptionKey: 'gamification.achievements.ambassador.description' },
];

export const XP_PER_LEVEL = 100;

export function getLevel(totalXp: number): { level: number; progress: number } {
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const progress = Math.round(((totalXp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100);
  return { level, progress };
}
