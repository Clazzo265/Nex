import type { Goal, HabitEntry } from '../types/nexora';

export function computeGoalProgressFromMilestones(goal: Goal): number {
  const milestones = goal.milestones ?? [];
  if (milestones.length === 0) return goal.progressPercent;
  const done = milestones.filter((m) => m.completed).length;
  return Math.round((done * 100) / milestones.length);
}

/**
 * Computes current consecutive completion streak for a daily habit up to todayKey,
 * without penalizing missed days (shows gentle consistency count).
 */
export function computeHabitStreak(
  entries: HabitEntry[],
  habitId: string,
  todayKey: string
): { currentStreak: number; totalCompletions: number } {
  const completedDates = new Set(
    entries.filter((e) => e.habitId === habitId && e.completed).map((e) => e.dateKey)
  );
  const totalCompletions = completedDates.size;

  const parseDate = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  let cursor = parseDate(todayKey);
  // If not completed today yet, start checking from yesterday so streak isn't prematurely zeroed mid-day
  if (!completedDates.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let currentStreak = 0;
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (completedDates.has(key)) {
      currentStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return { currentStreak, totalCompletions };
}
