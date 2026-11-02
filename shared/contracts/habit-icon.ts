import { z } from 'zod';
export const habitIconSchema = z.enum([
  'book',
  'notebook',
  'dumbbell',
  'walk',
  'bike',
  'code',
  'music',
  'languages',
  'brush',
  'coffee',
  'water',
  'moon',
  'heart',
  'timer',
  'target',
  'leaf',
]);
export type HabitIconId = z.infer<typeof habitIconSchema>;
