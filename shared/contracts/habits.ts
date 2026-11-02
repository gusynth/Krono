import { z } from 'zod';
import { habitIconSchema } from './habit-icon';

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
  }, 'Data inválida');
export const frequencySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }).strict(),
  z.object({ kind: z.literal('weekdays') }).strict(),
  z
    .object({
      kind: z.literal('specific'),
      days: z
        .array(z.number().int().min(0).max(6))
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length),
    })
    .strict(),
  z.object({ kind: z.literal('alternate'), anchor: localDateSchema }).strict(),
]);
export const habitInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['action', 'time']),
    frequency: frequencySchema,
    targetMinutes: z.number().int().min(1).max(480),
    icon: habitIconSchema.optional(),
  })
  .strict();
export const habitCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum(['create', 'edit', 'archive', 'restore', 'check', 'undo', 'select', 'delete']),
    habitId: z.string().uuid().nullable(),
    input: habitInputSchema.optional(),
    applyToday: z.boolean().optional(),
    expectedDate: localDateSchema.optional(),
    confirmPermanent: z.boolean().optional(),
  })
  .strict();
export const occurrenceSchema = z.object({
  date: localDateSchema,
  status: z.enum(['completed', 'missed', 'pending', 'rest', 'future', 'not-applicable']),
  durationMs: z.number().nonnegative(),
});
export const habitViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(['action', 'time']),
  timezone: z.string(),
  archived: z.boolean(),
  icon: habitIconSchema.optional(),
  frequency: frequencySchema,
  targetMinutes: z.number(),
  pendingChange: z.boolean(),
  nextFrequency: frequencySchema.nullable(),
  nextTargetMinutes: z.number().nullable(),
  today: occurrenceSchema,
  history: z.array(occurrenceSchema),
  streak: z.number(),
  completed: z.number(),
  expected: z.number(),
});
export const habitsSnapshotSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    today: localDateSchema,
    refreshAfterMs: z.number().positive(),
    habits: z.array(habitViewSchema).max(100),
    selectedId: z.string().uuid().nullable(),
  })
  .strict();
export const habitReplySchema = z.object({
  code: z.enum(['ok', 'conflict', 'invalid', 'storage-error']),
  snapshot: habitsSnapshotSchema.nullable(),
});
export type Frequency = z.infer<typeof frequencySchema>;
export type HabitInput = z.infer<typeof habitInputSchema>;
export type HabitCommand = z.infer<typeof habitCommandSchema>;
export type HabitView = z.infer<typeof habitViewSchema>;
export type HabitsSnapshot = z.infer<typeof habitsSnapshotSchema>;
export type HabitReply = z.infer<typeof habitReplySchema>;
export interface HabitsAPI {
  read: () => Promise<HabitsSnapshot>;
  command: (command: HabitCommand) => Promise<HabitReply>;
}
