import { z } from 'zod';
import { localDateSchema } from './habits';
import type { GardenSnapshot } from './garden';

const integer = z.number().int().nonnegative();
export const productionCursorSchema = z
  .object({
    beforeUtcMs: integer,
    beforeId: z.string().uuid(),
    ceiling: integer,
    context: z.string().max(200),
  })
  .strict();
export const productionQuerySchema = z
  .object({
    days: z.number().int().min(1).max(366).default(30),
    endDate: localDateSchema.optional(),
    habitId: z.string().uuid().nullable().default(null),
    cursor: productionCursorSchema.optional(),
    ceiling: integer.optional(),
  })
  .strict();
export const goalCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    expectedRevision: integer,
    expectedDate: localDateSchema,
    habitId: z.string().uuid().nullable(),
    cadence: z.enum(['daily', 'weekly']),
    targetMinutes: z.number().int().positive().nullable(),
    applyCurrent: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      value.targetMinutes === null ||
      value.targetMinutes <= (value.cadence === 'daily' ? 1440 : 10080),
    'Meta fora do limite',
  );
const goalDefinitionSchema = z
  .object({ effectiveDate: localDateSchema, timezone: z.string(), targetMs: integer.nullable() })
  .strict();
export const goalViewSchema = z
  .object({
    cadence: z.enum(['daily', 'weekly']),
    definition: goalDefinitionSchema.nullable(),
    pending: goalDefinitionSchema.nullable(),
    startDate: localDateSchema,
    endDate: localDateSchema,
    actualMs: integer,
    percent: z.number().nonnegative().nullable(),
    ringPercent: z.number().min(0).max(100),
  })
  .strict();
export const goalsSnapshotSchema = z
  .object({
    revision: integer,
    today: localDateSchema,
    timezone: z.string(),
    refreshAfterMs: z.number().positive(),
    daily: goalViewSchema,
    weekly: goalViewSchema,
  })
  .strict();
export const goalReplySchema = z
  .object({
    code: z.enum(['ok', 'conflict', 'invalid', 'storage-error']),
    revision: integer.nullable(),
  })
  .strict();
const metricsSchema = z
  .object({
    eligibleMs: integer,
    interruptedMs: integer,
    sessions: integer,
    activeDays: integer,
    averagePerDayMs: z.number().nonnegative(),
    averagePerActiveDayMs: z.number().nonnegative().nullable(),
  })
  .strict();
export const productionSnapshotSchema = z
  .object({
    version: z.literal(1),
    today: localDateSchema,
    timezone: z.string(),
    startDate: localDateSchema,
    endDate: localDateSchema,
    days: z.number().int().min(1).max(366),
    habitId: z.string().uuid().nullable(),
    ceiling: integer,
    refreshAfterMs: z.number().positive(),
    metrics: metricsSchema,
    previous: z
      .object({
        days: integer,
        currentMs: integer,
        previousMs: integer,
        percentChange: z.number().nullable(),
      })
      .strict(),
    daysData: z.array(z.object({ date: localDateSchema, durationMs: integer }).strict()).max(366),
    goals: goalsSnapshotSchema,
    habits: z
      .array(z.object({ id: z.string().uuid(), name: z.string(), archived: z.boolean() }).strict())
      .max(100),
    history: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            phase: z.enum(['focus', 'free']),
            outcome: z.enum(['completed', 'interrupted']),
            completedUtcMs: integer,
            completionDate: localDateSchema,
            timezone: z.string(),
            activeMs: integer,
            eligibleMs: integer,
            habitName: z.string().nullable(),
          })
          .strict(),
      )
      .max(20),
    nextCursor: productionCursorSchema.nullable(),
  })
  .strict();
export type ProductionQuery = z.infer<typeof productionQuerySchema>;
export type ProductionSnapshot = z.infer<typeof productionSnapshotSchema>;
export type GoalCommand = z.infer<typeof goalCommandSchema>;
export type GoalReply = z.infer<typeof goalReplySchema>;
export type GoalsSnapshot = z.infer<typeof goalsSnapshotSchema>;
export type GoalView = z.infer<typeof goalViewSchema>;
export interface ProductionAPI {
  garden: () => Promise<GardenSnapshot>;
  day: (query: ProductionDayQuery) => Promise<ProductionDay>;
  read: (query: ProductionQuery) => Promise<ProductionSnapshot>;
  goals: () => Promise<GoalsSnapshot>;
  command: (command: GoalCommand) => Promise<GoalReply>;
  subscribe: (listener: () => void) => () => void;
}

// Capacidade interna do main/worker; não exposta na API de Produção do renderer.
export const productionHistoryPageSchema = z
  .object({
    endDate: localDateSchema,
    ceiling: integer,
    history: z.array(productionSnapshotSchema.shape.history.element).max(500),
    nextCursor: productionCursorSchema.nullable(),
  })
  .strict();

export const productionDayQuerySchema = z
  .object({
    date: localDateSchema,
    habitId: z.string().uuid().nullable(),
    ceiling: integer,
    cursor: productionCursorSchema.optional(),
  })
  .strict();
export const productionDaySchema = z
  .object({
    date: localDateSchema,
    eligibleMs: integer,
    interruptedMs: integer,
    history: z
      .array(
        productionSnapshotSchema.shape.history.element.extend({
          startedUtcMs: integer,
          dayCreditMs: integer,
        }),
      )
      .max(20),
    nextCursor: productionCursorSchema.nullable(),
  })
  .strict();
export type ProductionDayQuery = z.infer<typeof productionDayQuerySchema>;
export type ProductionDay = z.infer<typeof productionDaySchema>;
