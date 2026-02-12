import { executeSql } from './client';

interface AchievementRow {
  id: string;
  achievement_id: string;
  progress: number;
  is_completed: number;
  unlocked_at: number | null;
  created_at: number;
  updated_at: number;
}

interface StreakRow {
  id: string;
  streak_type: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: number | null;
  streak_start_date: number | null;
  updated_at: number;
}

export interface LocalAchievement {
  id: string;
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  unlockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalStreak {
  id: string;
  streakType: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: Date;
  streakStartDate?: Date;
  updatedAt: Date;
}

function rowToAchievement(row: AchievementRow): LocalAchievement {
  return {
    id: row.id,
    achievementId: row.achievement_id,
    progress: row.progress,
    isCompleted: row.is_completed === 1,
    unlockedAt: row.unlocked_at ? new Date(row.unlocked_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToStreak(row: StreakRow): LocalStreak {
  return {
    id: row.id,
    streakType: row.streak_type,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActivityDate: row.last_activity_date ? new Date(row.last_activity_date) : undefined,
    streakStartDate: row.streak_start_date ? new Date(row.streak_start_date) : undefined,
    updatedAt: new Date(row.updated_at),
  };
}

export async function getAllAchievements(): Promise<LocalAchievement[]> {
  const rows = await executeSql<AchievementRow>(
    'SELECT * FROM user_achievements ORDER BY is_completed DESC, unlocked_at DESC',
  );
  return rows.map(rowToAchievement);
}

export async function upsertAchievement(achievement: {
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  unlockedAt?: string;
}): Promise<void> {
  const now = Date.now();
  await executeSql(
    `INSERT INTO user_achievements (id, achievement_id, progress, is_completed, unlocked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       progress = excluded.progress,
       is_completed = excluded.is_completed,
       unlocked_at = excluded.unlocked_at,
       updated_at = excluded.updated_at`,
    [
      achievement.achievementId,
      achievement.achievementId,
      achievement.progress,
      achievement.isCompleted ? 1 : 0,
      achievement.unlockedAt ? new Date(achievement.unlockedAt).getTime() : null,
      now,
      now,
    ],
  );
}

export async function upsertStreak(streak: {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: string;
}): Promise<void> {
  const now = Date.now();
  await executeSql(
    `INSERT INTO user_streaks (id, streak_type, current_streak, longest_streak, last_activity_date, streak_start_date, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       current_streak = excluded.current_streak,
       longest_streak = excluded.longest_streak,
       last_activity_date = excluded.last_activity_date,
       updated_at = excluded.updated_at`,
    [
      'daily_tracking',
      'daily_tracking',
      streak.currentStreak,
      streak.longestStreak,
      streak.lastActivityDate ? new Date(streak.lastActivityDate).getTime() : null,
      streak.lastActivityDate ? new Date(streak.lastActivityDate).getTime() : null,
      now,
    ],
  );
}

export async function getStreak(): Promise<LocalStreak | null> {
  const rows = await executeSql<StreakRow>(
    'SELECT * FROM user_streaks WHERE streak_type = ? LIMIT 1',
    ['daily_tracking'],
  );
  return rows.length > 0 ? rowToStreak(rows[0]) : null;
}

export async function clearGamificationData(): Promise<void> {
  await executeSql('DELETE FROM user_achievements');
  await executeSql('DELETE FROM user_streaks');
}
