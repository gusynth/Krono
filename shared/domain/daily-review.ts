import type { HabitView } from '../contracts/habits';

export function dailyHabitReview(habits: readonly HabitView[], date: string) {
  const entries = habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    day: habit.history.find((day) => day.date === date),
  }));
  const planned = entries.filter(
    (entry) => entry.day && ['completed', 'pending', 'missed'].includes(entry.day.status),
  );
  return {
    planned,
    completed: planned.filter((entry) => entry.day?.status === 'completed').length,
    unavailable: entries.filter((entry) => !entry.day || entry.day.status === 'future').length,
  };
}
