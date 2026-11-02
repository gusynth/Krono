import { z } from 'zod';
import type Database from 'better-sqlite3';
import { timerRecordSchema, timerSessionSchema } from '../../shared/contracts/timer';
import { initialTimer, activeMs, allocateDays } from '../../shared/domain/timer';
import { civilDate } from '../../shared/domain/habits';

export const timerCommitSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    record: timerRecordSchema,
    command: z
      .object({ id: z.string().min(1).max(128), fingerprint: z.string().max(2000) })
      .strict(),
    result: z
      .object({
        session: timerSessionSchema,
        outcome: z.enum(['completed', 'interrupted']),
        completedUtcMs: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TimerCommit = z.infer<typeof timerCommitSchema>;
export interface TimerRepository {
  load: () => Promise<z.infer<typeof timerRecordSchema>>;
  lookup: (id: string) => Promise<string | null>;
  commit: (commit: TimerCommit) => Promise<void>;
}

export function timerRepository(db: Database.Database) {
  const load = () => {
    const row = db.prepare('SELECT payload FROM timer_head WHERE id = 1').get() as
      { payload: string } | undefined;
    return row ? timerRecordSchema.parse(JSON.parse(row.payload)) : initialTimer();
  };
  const lookup = (id: string) =>
    (
      db.prepare('SELECT fingerprint FROM timer_commands WHERE id = ?').get(id) as
        { fingerprint: string } | undefined
    )?.fingerprint ?? null;
  const commit = (input: unknown) => {
    const value = timerCommitSchema.parse(input);
    db.transaction(() => {
      if (lookup(value.command.id) !== null) throw new Error('DUPLICATE_COMMAND');
      if (
        load().revision !== value.expectedRevision ||
        value.record.revision !== value.expectedRevision + 1
      )
        throw new Error('REVISION_CONFLICT');
      if (value.record.session?.habitId && value.record.session.id !== load().session?.id) {
        const habit = db
          .prepare("SELECT id FROM habits WHERE id=? AND kind='time'")
          .get(value.record.session.habitId);
        if (!habit) throw new Error('INVALID_HABIT');
      }
      if (value.result) {
        const { session, outcome, completedUtcMs } = value.result;
        const eligible =
          outcome === 'completed' && (session.phase === 'focus' || session.phase === 'free')
            ? activeMs(session)
            : 0;
        db.prepare(
          'INSERT INTO focus_sessions(id, phase, outcome, timezone, started_utc, completed_utc, active_ms, eligible_ms, payload,completion_date,habit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          session.id,
          session.phase,
          outcome,
          session.timezone,
          session.startedUtcMs,
          completedUtcMs,
          activeMs(session),
          eligible,
          JSON.stringify(session),
          civilDate(completedUtcMs, session.timezone),
          session.habitId ?? null,
        );
        const segmentInsert = db.prepare(
          'INSERT INTO focus_segments(session_id, ordinal, start_utc, duration_ms) VALUES (?, ?, ?, ?)',
        );
        session.segments.forEach((segment, index) =>
          segmentInsert.run(session.id, index, segment.startUtcMs, segment.durationMs),
        );
        if (eligible > 0) {
          const credit = db.prepare(
            'INSERT INTO focus_daily_credit(session_id, local_date, duration_ms) VALUES (?, ?, ?)',
          );
          for (const allocation of allocateDays(session))
            credit.run(session.id, allocation.date, allocation.durationMs);
          if (session.habitId) {
            const habit = db
              .prepare("SELECT timezone FROM habits WHERE id=? AND kind='time'")
              .get(session.habitId) as { timezone: string } | undefined;
            if (!habit) throw new Error('INVALID_HABIT');
            const insert = db.prepare('INSERT INTO habit_contributions VALUES (?,?,?,?)');
            for (const allocation of allocateDays({ ...session, timezone: habit.timezone }))
              insert.run(session.id, session.habitId, allocation.date, allocation.durationMs);
            db.prepare('UPDATE habit_state SET revision=revision+1 WHERE id=1').run();
          }
        }
        if (outcome === 'completed')
          db.prepare('INSERT INTO focus_events(session_id, kind, delivery) VALUES (?, ?, ?)').run(
            session.id,
            'completed',
            'pending',
          );
      }
      db.prepare('INSERT INTO timer_commands(id, fingerprint) VALUES (?, ?)').run(
        value.command.id,
        value.command.fingerprint,
      );
      db.prepare(
        'INSERT INTO timer_head(id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
      ).run(JSON.stringify(value.record));
    })();
  };
  return { load, lookup, commit };
}
