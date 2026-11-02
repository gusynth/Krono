import { z } from 'zod';
import { habitIconSchema } from '../../shared/contracts/habit-icon';
import type Database from 'better-sqlite3';
import {
  habitCommandSchema,
  habitsSnapshotSchema,
  frequencySchema,
  localDateSchema,
  type HabitReply,
  type HabitsSnapshot,
} from '../../shared/contracts/habits';
import {
  addDays,
  civilDate,
  nextCivilDay,
  occurrence,
  statistics,
} from '../../shared/domain/habits';
import { timerRecordSchema, timerSessionSchema } from '../../shared/contracts/timer';

const versionSchema = z
  .object({
    date: localDateSchema,
    active: z.boolean(),
    frequency: frequencySchema,
    targetMinutes: z.number().int().min(1).max(480),
    icon: habitIconSchema.optional(),
  })
  .strict();
interface Row {
  id: string;
  name: string;
  kind: 'action' | 'time';
  timezone: string;
  created_date: string;
}
export function habitRepository(db: Database.Database) {
  const state = () =>
    db.prepare('SELECT revision, selected_id FROM habit_state WHERE id=1').get() as {
      revision: number;
      selected_id: string | null;
    };
  const versions = (id: string) =>
    (
      db
        .prepare('SELECT payload FROM habit_versions WHERE habit_id=? ORDER BY effective_date')
        .all(id) as { payload: string }[]
    ).map((row) => versionSchema.parse(JSON.parse(row.payload)));
  const selected = (now: number): string | null => {
    const id = state().selected_id;
    const row = db.prepare('SELECT * FROM habits WHERE id=?').get(id) as Row | undefined;
    return row?.kind === 'time' &&
      versions(row.id).findLast((v) => v.date <= civilDate(now, row.timezone))?.active
      ? row.id
      : null;
  };
  const read = (now: number, timezone: string): HabitsSnapshot => {
    const head = state();
    const habits = (db.prepare('SELECT * FROM habits ORDER BY created_date,id').all() as Row[]).map(
      (row) => {
        const today = civilDate(now, row.timezone),
          allVersions = versions(row.id),
          current = allVersions.findLast((v) => v.date <= today) ?? {
            ...allVersions[0],
            active: false,
          };
        const checks = new Set(
          (
            db.prepare('SELECT local_date FROM habit_checks WHERE habit_id=?').all(row.id) as {
              local_date: string;
            }[]
          ).map((v) => v.local_date),
        );
        const credits = new Map(
          (
            db
              .prepare(
                'SELECT local_date,SUM(duration_ms) AS total FROM habit_contributions WHERE habit_id=? GROUP BY local_date',
              )
              .all(row.id) as { local_date: string; total: number }[]
          ).map((v) => [v.local_date, v.total]),
        );
        const day = (date: string) =>
          occurrence(date, today, allVersions, checks.has(date), credits.get(date) ?? 0, row.kind);
        const elapsed = [];
        for (let date = row.created_date; date <= today; date = addDays(date, 1))
          elapsed.push(day(date));
        const history = Array.from({ length: 28 }, (_, i) => day(addDays(today, i - 27)));
        const next = allVersions.find((v) => v.date > today);
        return {
          id: row.id,
          name: row.name,
          kind: row.kind,
          icon: allVersions.at(-1)?.icon ?? (row.kind === 'time' ? 'timer' : 'book'),
          timezone: row.timezone,
          archived: !current.active,
          frequency: current.frequency,
          targetMinutes: current.targetMinutes,
          pendingChange: !!next,
          nextFrequency: next?.frequency ?? null,
          nextTargetMinutes: next?.targetMinutes ?? null,
          today: day(today),
          history,
          ...statistics(history),
          streak: statistics(elapsed).streak,
        };
      },
    );
    const refreshAfterMs = Math.min(
      ...[...new Set([timezone, ...habits.map((h) => h.timezone)])].map((zone) =>
        nextCivilDay(now, zone),
      ),
    );
    return habitsSnapshotSchema.parse({
      version: 1,
      revision: head.revision,
      today: civilDate(now, timezone),
      refreshAfterMs,
      habits,
      selectedId: selected(now),
    });
  };
  const command = (input: unknown, now: number, timezone: string): HabitReply => {
    const parsed = habitCommandSchema.safeParse(input);
    if (!parsed.success) return { code: 'invalid', snapshot: read(now, timezone) };
    const value = parsed.data,
      fingerprint = JSON.stringify(value);
    const code = db.transaction((): HabitReply['code'] => {
      const previous = db
        .prepare('SELECT fingerprint FROM habit_commands WHERE id=?')
        .get(value.commandId) as { fingerprint: string } | undefined;
      if (previous) return previous.fingerprint === fingerprint ? 'ok' : 'conflict';
      if (state().revision !== value.expectedRevision) return 'conflict';
      const row = db.prepare('SELECT * FROM habits WHERE id=?').get(value.habitId) as
        Row | undefined;
      const today = civilDate(now, row?.timezone ?? timezone),
        list = row ? versions(row.id) : [],
        current = list.findLast((v) => v.date <= today);
      const icon =
        value.input?.icon ?? list.at(-1)?.icon ?? (row?.kind === 'time' ? 'timer' : 'book');
      const writeVersion = (id: string, version: z.infer<typeof versionSchema>) =>
        db
          .prepare(
            'INSERT INTO habit_versions VALUES (?,?,?) ON CONFLICT(habit_id,effective_date) DO UPDATE SET payload=excluded.payload',
          )
          .run(id, version.date, JSON.stringify(version));
      if (value.action !== 'create' && value.input && value.action !== 'edit') return 'invalid';
      if (value.action === 'create') {
        if (
          !value.input ||
          !value.habitId ||
          row ||
          (db.prepare('SELECT COUNT(*) AS n FROM habits').get() as { n: number }).n >= 100
        )
          return 'invalid';
        db.prepare('INSERT INTO habits VALUES (?,?,?,?,?)').run(
          value.habitId,
          value.input.name,
          value.input.kind,
          timezone,
          today,
        );
        writeVersion(value.habitId, {
          date: today,
          active: true,
          frequency: value.input.frequency,
          targetMinutes: value.input.targetMinutes,
          icon: value.input.icon ?? (value.input.kind === 'time' ? 'timer' : 'book'),
        });
      } else if (value.action === 'select') {
        if (value.habitId !== null && (!row || row.kind !== 'time' || !current?.active))
          return 'invalid';
        db.prepare('UPDATE habit_state SET selected_id=? WHERE id=1').run(value.habitId);
      } else {
        if (!row || !current) return 'invalid';
        switch (value.action) {
          case 'delete': {
            if (value.confirmPermanent !== true) return 'invalid';
            const head = db.prepare('SELECT payload FROM timer_head WHERE id=1').get() as
              { payload: string } | undefined;
            if (
              head &&
              timerRecordSchema.parse(JSON.parse(head.payload)).session?.habitId === row.id
            )
              return 'invalid';
            db.prepare('UPDATE habit_state SET selected_id=NULL WHERE selected_id=?').run(row.id);
            // Desvincular sem apagar sessões, segmentos, crédito civil ou alertas.
            const update = db.prepare(
              'UPDATE focus_sessions SET habit_id=NULL,payload=? WHERE id=?',
            );
            for (const session of db
              .prepare('SELECT id,payload FROM focus_sessions WHERE habit_id=?')
              .all(row.id) as { id: string; payload: string }[]) {
              const payload = timerSessionSchema.parse(JSON.parse(session.payload));
              update.run(JSON.stringify({ ...payload, habitId: null }), session.id);
            }
            for (const table of ['habit_contributions', 'habit_checks', 'habit_versions'])
              db.prepare(`DELETE FROM ${table} WHERE habit_id=?`).run(row.id);
            if (
              db
                .prepare('DELETE FROM production_goal_versions WHERE scope=?')
                .run(`habit:${row.id}`).changes
            )
              db.prepare('UPDATE production_goal_state SET revision=revision+1 WHERE id=1').run();
            db.prepare('DELETE FROM habits WHERE id=?').run(row.id);
            break;
          }
          case 'edit': {
            if (!value.input || value.input.kind !== row.kind || !current.active) return 'invalid';
            db.prepare('UPDATE habits SET name=? WHERE id=?').run(value.input.name, row.id);
            const date = value.applyToday ? today : addDays(today, 1);
            db.prepare('DELETE FROM habit_versions WHERE habit_id=? AND effective_date>?').run(
              row.id,
              today,
            );
            writeVersion(row.id, {
              date,
              active: true,
              frequency: value.input.frequency,
              targetMinutes: value.input.targetMinutes,
              icon,
            });
            break;
          }
          case 'archive':
          case 'restore': {
            if (current.active === (value.action === 'restore')) return 'invalid';
            db.prepare('DELETE FROM habit_versions WHERE habit_id=? AND effective_date>?').run(
              row.id,
              today,
            );
            writeVersion(row.id, {
              ...current,
              date: today,
              active: value.action === 'restore',
              icon,
            });
            if (value.action === 'archive')
              db.prepare('UPDATE habit_state SET selected_id=NULL WHERE selected_id=?').run(row.id);
            break;
          }
          case 'check':
          case 'undo': {
            if (value.expectedDate !== today) return 'conflict';
            if (
              row.kind !== 'action' ||
              occurrence(today, today, list, false, 0, 'action').status !== 'pending'
            )
              return 'invalid';
            if (value.action === 'check')
              db.prepare('INSERT OR IGNORE INTO habit_checks VALUES (?,?)').run(row.id, today);
            else
              db.prepare('DELETE FROM habit_checks WHERE habit_id=? AND local_date=?').run(
                row.id,
                today,
              );
            break;
          }
          default:
            return 'invalid';
        }
      }
      db.prepare('INSERT INTO habit_commands VALUES (?,?,?)').run(
        value.commandId,
        fingerprint,
        now,
      );
      db.prepare('UPDATE habit_state SET revision=revision+1 WHERE id=1').run();
      return 'ok';
    })();
    return { code, snapshot: read(now, timezone) };
  };
  return { read, command, selected };
}
