import { it, expect } from 'vitest';
import { orderedHabits, moveHabit } from '../../shared/domain/habit-order';
import { dailyHabitReview } from '../../shared/domain/daily-review';
import { preferencesSchema, defaultPreferences } from '../../shared/contracts/desktop';
import type { HabitView } from '../../shared/contracts/habits';

it('ordem mantém novos IDs ao final, ignora excluídos e não muda a entrada', () => {
  const habits = ['a', 'b', 'c'].map((id) => ({ id }));
  expect(orderedHabits(habits, ['deleted', 'b', 'a']).map((h) => h.id)).toEqual(['b', 'a', 'c']);
  expect(habits.map((h) => h.id)).toEqual(['a', 'b', 'c']);
  expect(orderedHabits(habits)).toEqual(habits);
});
it('mover troca vizinhos visíveis sem deslocar os filtrados', () => {
  expect(moveHabit(['a', 'hidden', 'b', 'c'], ['a', 'b', 'c'], 'a', 1)).toEqual([
    'b',
    'hidden',
    'a',
    'c',
  ]);
  expect(moveHabit(['a', 'b'], ['a', 'b'], 'b', -1)).toEqual(['b', 'a']);
  expect(moveHabit(['a', 'b'], ['a', 'b'], 'a', -1)).toBeNull();
  expect(moveHabit(['a', 'b'], ['a', 'b'], 'b', 1)).toBeNull();
  expect(moveHabit(['a'], ['a', 'missing'], 'a', 1)).toBeNull();
});
it('ordem aceita preferências antigas e recusa IDs duplicados/inválidos/excesso', () => {
  const id = 'a9454936-4395-47b8-b938-d8377a518819';
  expect(preferencesSchema.parse(defaultPreferences()).habitOrder).toBeUndefined();
  expect(preferencesSchema.parse({ ...defaultPreferences(), habitOrder: [id] }).habitOrder).toEqual(
    [id],
  );
  for (const habitOrder of [[id, id], ['invalid'], Array(101).fill(id)])
    expect(preferencesSchema.safeParse({ ...defaultPreferences(), habitOrder }).success).toBe(
      false,
    );
});
it('revisão usa ocorrências históricas, inclui arquivados e exclui descanso/futuro', () => {
  const date = '2026-01-01';
  const habits = ['completed', 'pending', 'missed', 'rest', 'not-applicable', 'future'].map(
    (status, i) =>
      ({
        id: String(i),
        name: String(i),
        archived: true,
        history: [{ date, status, durationMs: 0 }],
      }) as HabitView,
  );
  const review = dailyHabitReview(habits, date);
  expect(review.completed).toBe(1);
  expect(review.planned).toHaveLength(3);
  expect(review.unavailable).toBe(1);
  expect(dailyHabitReview(habits, '2025-12-31').unavailable).toBe(6);
  expect(dailyHabitReview([], date)).toEqual({ planned: [], completed: 0, unavailable: 0 });
});
