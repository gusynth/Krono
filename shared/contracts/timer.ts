import { z } from 'zod';
import { localDateSchema } from './habits';

const ms = z.number().int().min(1000).max(28_800_000);
export const presetSchema = z
  .object({
    focusMs: ms,
    shortBreakMs: ms,
    longBreakMs: ms,
    longEvery: z.number().int().min(1).max(12),
  })
  .strict();
export const defaultPreset = {
  focusMs: 1_500_000,
  shortBreakMs: 300_000,
  longBreakMs: 900_000,
  longEvery: 4,
} as const;
export const timerConfigurationSchema = z
  .object({
    focusMinutes: z.number().int().min(1).max(240),
    shortBreakMinutes: z.number().int().min(1).max(120),
    longBreakMinutes: z.number().int().min(1).max(120),
    longEvery: z.number().int().min(1).max(12),
    proportional: z.boolean(),
  })
  .strict();
export const defaultTimerConfiguration = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longEvery: 4,
  proportional: true,
} as const;
export type TimerConfiguration = z.infer<typeof timerConfigurationSchema>;
export const phaseSchema = z.enum(['focus', 'short-break', 'long-break', 'free']);
export const timerStateSchema = z.enum([
  'idle',
  'running',
  'paused',
  'awaiting-next',
  'recovering',
  'storage-error',
]);
export const segmentSchema = z
  .object({
    startUtcMs: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();
export const timerSessionSchema = z
  .object({
    id: z.string().uuid(),
    phase: phaseSchema,
    preset: presetSchema,
    timezone: z.string().min(1).max(80),
    startedUtcMs: z.number().int().nonnegative(),
    segments: z.array(segmentSchema),
    habitId: z.string().uuid().nullable().optional(),
    singleFocus: z.boolean().optional(),
  })
  .strict();
export const timerRecordSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    state: timerStateSchema.exclude(['storage-error']),
    phase: phaseSchema,
    nextPhase: phaseSchema,
    cycle: z.number().int().nonnegative(),
    session: timerSessionSchema.nullable(),
    configuration: timerConfigurationSchema.optional(),
    cycleBase: z.number().int().nonnegative().optional(),
    cycleEvery: z.number().int().min(1).max(12).optional(),
    cycleDate: localDateSchema.optional(),
    singleFocus: z.boolean().optional(),
    focusCompleted: z.boolean().optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if ((record.cycleBase ?? 0) > record.cycle)
      context.addIssue({ code: 'custom', message: 'Base do ciclo inválida' });
    if ((record.state === 'idle') !== (record.session === null))
      context.addIssue({ code: 'custom', message: 'Sessão incompatível com estado' });
    if (record.session && record.session.phase !== record.phase)
      context.addIssue({ code: 'custom', message: 'Fase inconsistente' });
    if (record.session) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: record.session.timezone }).format(0);
      } catch {
        context.addIssue({ code: 'custom', message: 'Fuso inválido' });
      }
      const preset = record.session.preset;
      const limit =
        record.phase === 'focus'
          ? preset.focusMs
          : record.phase === 'short-break'
            ? preset.shortBreakMs
            : record.phase === 'long-break'
              ? preset.longBreakMs
              : null;
      const elapsed = record.session.segments.reduce(
        (total, segment) => total + segment.durationMs,
        0,
      );
      if (limit !== null && elapsed > limit)
        context.addIssue({ code: 'custom', message: 'Duração acima do prazo' });
    }
  });
export const timerCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    sessionId: z.string().uuid().nullable(),
    action: z.enum([
      'start',
      'pause',
      'resume',
      'cancel',
      'select-phase',
      'recover',
      'discard',
      'retry',
      'finish',
      'configure',
      'end-cycle',
      'set-single-focus',
    ]),
    phase: phaseSchema.optional(),
    preset: presetSchema.optional(),
    configuration: timerConfigurationSchema.optional(),
    singleFocus: z.boolean().optional(),
  })
  .strict();
export const timerSnapshotSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    state: timerStateSchema,
    phase: phaseSchema,
    nextPhase: phaseSchema,
    cycle: z.number().int().nonnegative(),
    focusNumber: z.number().int().min(1).max(12),
    longEvery: z.number().int().min(1).max(12),
    sessionId: z.string().uuid().nullable(),
    elapsedMs: z.number().int().nonnegative(),
    remainingMs: z.number().int().nonnegative().nullable(),
    durationMs: z.number().int().positive().nullable(),
    message: z.string().nullable(),
    habitId: z.string().uuid().nullable().optional(),
    configuration: timerConfigurationSchema.optional(),
    activePreset: presetSchema.optional(),
    singleFocus: z.boolean().optional(),
    canEndCycle: z.boolean().optional(),
    focusCompleted: z.boolean().optional(),
  })
  .strict();
export const timerReplySchema = z
  .object({
    code: z.enum(['ok', 'conflict', 'invalid', 'storage-error']),
    snapshot: timerSnapshotSchema,
  })
  .strict();
export type TimerRecord = z.infer<typeof timerRecordSchema>;
export type TimerCommand = z.infer<typeof timerCommandSchema>;
export type TimerSnapshot = z.infer<typeof timerSnapshotSchema>;
export type TimerReply = z.infer<typeof timerReplySchema>;
export type TimerPhase = z.infer<typeof phaseSchema>;
export type TimerSession = z.infer<typeof timerSessionSchema>;
export type Preset = z.infer<typeof presetSchema>;
export interface TimerAPI {
  read: () => Promise<TimerSnapshot>;
  command: (command: TimerCommand) => Promise<TimerReply>;
  subscribe: (listener: (snapshot: TimerSnapshot) => void) => () => void;
}

/** Uma resposta antiga com a mesma revisão durável não pode apagar um erro de gravação. */
export function acceptsTimerSnapshot(
  current: TimerSnapshot,
  next: TimerSnapshot,
  explicitRetry = false,
): boolean {
  if (next.revision < current.revision) return false;
  if (next.revision === current.revision) {
    if (current.state === 'storage-error' && next.state !== 'storage-error' && !explicitRetry)
      return false;
    if (
      current.state === 'running' &&
      next.state === 'running' &&
      next.elapsedMs < current.elapsedMs
    )
      return false;
  }
  return true;
}
