import type Database from 'better-sqlite3';
import {
  goalCommandSchema,
  goalsSnapshotSchema,
  type GoalReply,
  type GoalsSnapshot,
} from '../../shared/contracts/production';
import { civilDate, nextCivilDay } from '../../shared/domain/habits';
import { goalEffectiveDate, goalProgress, weekStart } from '../../shared/domain/production';
import { creditTotal } from './production-queries';

interface Definition {
  effective_date: string;
  timezone: string;
  target_ms: number | null;
}
export function productionGoals(db: Database.Database) {
  const revision = () =>
    (
      db.prepare('SELECT revision FROM production_goal_state WHERE id=1').get() as {
        revision: number;
      }
    ).revision;
  const scope = (id: string | null) => (id ? `habit:${id}` : 'global');
  const scopeTimezone = (fallback: string, id: string | null) =>
    (
      db
        .prepare(
          'SELECT timezone FROM production_goal_versions WHERE scope=? ORDER BY created_utc,effective_date LIMIT 1',
        )
        .get(scope(id)) as { timezone: string } | undefined
    )?.timezone ?? fallback;
  const read = (
    date: string,
    today: string,
    timezone: string,
    habitId: string | null,
    ceiling: number,
    now: number,
  ): GoalsSnapshot => {
    const view = (cadence: 'daily' | 'weekly') => {
      const definition = db
        .prepare(
          'SELECT * FROM production_goal_versions WHERE scope=? AND cadence=? AND effective_date<=? ORDER BY effective_date DESC LIMIT 1',
        )
        .get(scope(habitId), cadence, date) as Definition | undefined;
      const pending =
        date === today
          ? (db
              .prepare(
                'SELECT * FROM production_goal_versions WHERE scope=? AND cadence=? AND effective_date>? ORDER BY effective_date LIMIT 1',
              )
              .get(scope(habitId), cadence, date) as Definition | undefined)
          : undefined;
      const normalize = (value?: Definition) =>
        value
          ? {
              effectiveDate: value.effective_date,
              timezone: value.timezone,
              targetMs: value.target_ms,
            }
          : null;
      const startDate = cadence === 'daily' ? date : weekStart(date),
        actualMs = creditTotal(db, startDate, date, habitId, ceiling, true);
      return {
        cadence,
        definition: normalize(definition),
        pending: normalize(pending),
        startDate,
        endDate: date,
        actualMs,
        ...goalProgress(actualMs, definition?.target_ms ?? null),
      };
    };
    return goalsSnapshotSchema.parse({
      revision: revision(),
      today,
      timezone,
      refreshAfterMs: nextCivilDay(now, timezone),
      daily: view('daily'),
      weekly: view('weekly'),
    });
  };
  const command = (input: unknown, now: number, timezone: string): GoalReply => {
    const parsed = goalCommandSchema.safeParse(input);
    if (!parsed.success) return { code: 'invalid', revision: revision() };
    const value = parsed.data,
      fingerprint = JSON.stringify(value);
    const code = db.transaction((): GoalReply['code'] => {
      const prior = db
        .prepare('SELECT fingerprint FROM production_goal_commands WHERE id=?')
        .get(value.commandId) as { fingerprint: string } | undefined;
      if (prior) return prior.fingerprint === fingerprint ? 'ok' : 'conflict';
      if (value.expectedRevision !== revision()) return 'conflict';
      if (value.habitId) {
        const habit = db
          .prepare("SELECT timezone FROM habits WHERE id=? AND kind='time'")
          .get(value.habitId) as { timezone: string } | undefined;
        if (!habit) return 'invalid';
        timezone = habit.timezone;
        const row = db
          .prepare(
            'SELECT payload FROM habit_versions WHERE habit_id=? AND effective_date<=? ORDER BY effective_date DESC LIMIT 1',
          )
          .get(value.habitId, civilDate(now, timezone)) as { payload: string } | undefined;
        if (!row || !(JSON.parse(row.payload) as { active: boolean }).active) return 'invalid';
      }
      timezone = scopeTimezone(timezone, value.habitId);
      const today = civilDate(now, timezone);
      if (today !== value.expectedDate) return 'conflict';
      const last = db
        .prepare('SELECT MAX(created_utc) AS latest FROM production_goal_versions WHERE scope=?')
        .get(scope(value.habitId)) as { latest: number | null };
      if (last.latest !== null && now < last.latest) return 'invalid';
      const effective = goalEffectiveDate(today, value.cadence, value.applyCurrent);
      // Substitui apenas o agendamento futuro deste escopo; passado permanece intacto.
      db.prepare(
        'DELETE FROM production_goal_versions WHERE scope=? AND cadence=? AND effective_date>?',
      ).run(scope(value.habitId), value.cadence, today);
      db.prepare(
        'INSERT INTO production_goal_versions VALUES (?,?,?,?,?,?) ON CONFLICT(scope,cadence,effective_date) DO UPDATE SET target_ms=excluded.target_ms,timezone=excluded.timezone,created_utc=excluded.created_utc',
      ).run(
        scope(value.habitId),
        value.cadence,
        effective,
        timezone,
        value.targetMinutes === null ? null : value.targetMinutes * 60_000,
        now,
      );
      db.prepare('INSERT INTO production_goal_commands VALUES (?,?,?)').run(
        value.commandId,
        fingerprint,
        now,
      );
      db.prepare('UPDATE production_goal_state SET revision=revision+1 WHERE id=1').run();
      return 'ok';
    })();
    return { code, revision: revision() };
  };
  return { read, command, timezone: scopeTimezone };
}
