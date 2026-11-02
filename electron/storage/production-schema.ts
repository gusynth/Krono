import type Database from 'better-sqlite3';
import { timerSessionSchema } from '../../shared/contracts/timer';
import { civilDate } from '../../shared/domain/habits';

/** Delta aditivo. Executado dentro da transação de migração do writer. */
export function migrateProduction(db: Database.Database) {
  db.exec(`ALTER TABLE focus_sessions ADD COLUMN completion_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE focus_sessions ADD COLUMN habit_id TEXT REFERENCES habits(id);
    CREATE TABLE production_goal_versions (scope TEXT NOT NULL, cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly')), effective_date TEXT NOT NULL, timezone TEXT NOT NULL, target_ms INTEGER CHECK(target_ms IS NULL OR target_ms > 0), created_utc INTEGER NOT NULL, PRIMARY KEY(scope,cadence,effective_date));
    CREATE TABLE production_goal_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
    INSERT INTO production_goal_state VALUES (1,0);
    CREATE TABLE production_goal_commands (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, created_utc INTEGER NOT NULL);`);
  let after = 0;
  const update = db.prepare('UPDATE focus_sessions SET completion_date=?,habit_id=? WHERE rowid=?');
  for (;;) {
    const rows = db
      .prepare(
        'SELECT rowid AS sequence,timezone,completed_utc,payload FROM focus_sessions WHERE rowid>? ORDER BY rowid LIMIT 500',
      )
      .all(after) as {
      sequence: number;
      timezone: string;
      completed_utc: number;
      payload: string;
    }[];
    if (!rows.length) break;
    for (const row of rows) {
      const session = timerSessionSchema.parse(JSON.parse(row.payload));
      update.run(civilDate(row.completed_utc, row.timezone), session.habitId ?? null, row.sequence);
    }
    after = rows.at(-1)!.sequence;
  }
  db.exec(`CREATE INDEX focus_completion_date ON focus_sessions(completion_date);
    CREATE INDEX focus_habit_date ON focus_sessions(habit_id,completion_date);
    CREATE INDEX focus_habit_history ON focus_sessions(habit_id,completed_utc,id);
    INSERT INTO schema_migrations VALUES (5);`);
}
