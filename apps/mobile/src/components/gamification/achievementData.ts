export interface AchievementDef {
  id: string;
  i18nKey: string;
  category: 'budget' | 'tracking' | 'streak' | 'milestone' | 'savings';
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  threshold?: number;
  xpReward: number;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
  { id: 'first_expense', i18nKey: 'firstExpense', category: 'milestone', icon: '🌟', rarity: 'common', threshold: 1, xpReward: 10 },
  { id: 'expenses_10', i18nKey: 'expenses10', category: 'milestone', icon: '📝', rarity: 'common', threshold: 10, xpReward: 25 },
  { id: 'expenses_50', i18nKey: 'expenses50', category: 'milestone', icon: '📊', rarity: 'rare', threshold: 50, xpReward: 50 },
  { id: 'expenses_100', i18nKey: 'expenses100', category: 'milestone', icon: '🏆', rarity: 'epic', threshold: 100, xpReward: 100 },
  { id: 'expenses_500', i18nKey: 'expenses500', category: 'milestone', icon: '💎', rarity: 'legendary', threshold: 500, xpReward: 250 },
  { id: 'first_budget', i18nKey: 'firstBudget', category: 'budget', icon: '🎯', rarity: 'common', threshold: 1, xpReward: 15 },
  { id: 'budget_month_no_exceed', i18nKey: 'budgetMonthNoExceed', category: 'budget', icon: '🌟', rarity: 'rare', xpReward: 75 },
  { id: 'budget_3months_no_exceed', i18nKey: 'budget3MonthsNoExceed', category: 'budget', icon: '🔥', rarity: 'epic', xpReward: 200 },
  { id: 'streak_3', i18nKey: 'streak3', category: 'streak', icon: '🔥', rarity: 'common', threshold: 3, xpReward: 15 },
  { id: 'streak_7', i18nKey: 'streak7', category: 'streak', icon: '⚡', rarity: 'rare', threshold: 7, xpReward: 35 },
  { id: 'streak_30', i18nKey: 'streak30', category: 'streak', icon: '💪', rarity: 'epic', threshold: 30, xpReward: 150 },
  { id: 'streak_100', i18nKey: 'streak100', category: 'streak', icon: '🏅', rarity: 'legendary', threshold: 100, xpReward: 500 },
  { id: 'first_income', i18nKey: 'firstIncome', category: 'savings', icon: '💰', rarity: 'common', threshold: 1, xpReward: 10 },
  { id: 'net_positive_month', i18nKey: 'netPositiveMonth', category: 'savings', icon: '💵', rarity: 'rare', xpReward: 50 },
];

export function getI18nKey(achievementId: string): string {
  const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === achievementId);
  return def?.i18nKey || achievementId;
}
