import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { defaultPreset } from '../../shared/contracts/timer';
import { addDays } from '../../shared/domain/habits';

/** Dataset sintético compartilhado: 100 hábitos, 100 mil sessões e 365 datas. */
export function seedScaleDatabase(db: Database.Database) {
  const ids = Array.from({ length: 100 }, () => randomUUID());
  const put = db.prepare(
    'INSERT INTO focus_sessions(id,phase,outcome,timezone,started_utc,completed_utc,active_ms,eligible_ms,payload,completion_date,habit_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  const credit = db.prepare('INSERT INTO focus_daily_credit VALUES (?,?,?)'),
    contribution = db.prepare('INSERT INTO habit_contributions VALUES (?,?,?,?)');
  db.transaction(() => {
    ids.forEach((id, index) => {
      db.prepare('INSERT INTO habits VALUES (?,?,?,?,?)').run(
        id,
        `Hábito sintético ${index}`,
        'time',
        'UTC',
        '2025-01-01',
      );
      db.prepare('INSERT INTO habit_versions VALUES (?,?,?)').run(
        id,
        '2025-01-01',
        JSON.stringify({
          date: '2025-01-01',
          active: true,
          frequency: { kind: 'daily' },
          targetMinutes: 1,
        }),
      );
    });
    for (let index = 0; index < 100_000; index++) {
      const id = randomUUID(),
        date = addDays('2025-01-01', index % 365),
        start = Date.parse(`${date}T08:00:00Z`) + Math.floor(index / 365) * 100_000;
      const phase = index % 10 === 0 ? 'short-break' : 'focus',
        outcome = index % 10 === 1 ? 'interrupted' : 'completed',
        active = phase === 'short-break' ? 10_000 : outcome === 'completed' ? 60_000 : 15_000,
        eligible = phase === 'focus' && outcome === 'completed' ? active : 0;
      const session = {
        id,
        phase,
        timezone: 'UTC',
        startedUtcMs: start,
        segments: [{ startUtcMs: start, durationMs: active }],
        preset: { ...defaultPreset, focusMs: 60_000, shortBreakMs: 10_000 },
        habitId: phase === 'focus' ? ids[index % 100] : null,
      };
      put.run(
        id,
        phase,
        outcome,
        'UTC',
        start,
        start + active,
        active,
        eligible,
        JSON.stringify(session),
        date,
        session.habitId,
      );
      if (eligible) {
        credit.run(id, date, eligible);
        contribution.run(id, session.habitId, date, eligible);
      }
    }
  })();
  return ids;
}
