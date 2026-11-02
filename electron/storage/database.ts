import Database from 'better-sqlite3';
import { migrateProduction } from './production-schema';

export function openDatabase(path: string) {
  const db = new Database(path, { timeout: 1500 });
  try {
    const schema = db.pragma('user_version', { simple: true }) as number;
    if (![0, 1, 2, 3, 4, 5].includes(schema)) throw new Error('SCHEMA_UNSUPPORTED');
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.transaction(() => {
      db.exec(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY CHECK(version > 0))',
      );
      if (schema < 1) db.prepare('INSERT INTO schema_migrations VALUES (1)').run();
      if (schema < 2) {
        db.exec(`
          CREATE TABLE timer_head (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL);
          CREATE TABLE timer_commands (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
          CREATE TABLE focus_sessions (
            id TEXT PRIMARY KEY, phase TEXT NOT NULL CHECK(phase IN ('focus','short-break','long-break','free')),
            outcome TEXT NOT NULL CHECK(outcome IN ('completed','interrupted')), timezone TEXT NOT NULL,
            started_utc INTEGER NOT NULL, completed_utc INTEGER NOT NULL,
            active_ms INTEGER NOT NULL CHECK(active_ms >= 0), eligible_ms INTEGER NOT NULL CHECK(eligible_ms >= 0 AND eligible_ms <= active_ms), payload TEXT NOT NULL
          );
          CREATE INDEX focus_sessions_period ON focus_sessions(completed_utc, id);
          CREATE TABLE focus_segments (session_id TEXT NOT NULL REFERENCES focus_sessions(id), ordinal INTEGER NOT NULL, start_utc INTEGER NOT NULL, duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0), PRIMARY KEY(session_id, ordinal));
          CREATE TABLE focus_daily_credit (session_id TEXT NOT NULL REFERENCES focus_sessions(id), local_date TEXT NOT NULL, duration_ms INTEGER NOT NULL CHECK(duration_ms > 0), PRIMARY KEY(session_id, local_date));
          CREATE INDEX focus_credit_period ON focus_daily_credit(local_date);
          CREATE TABLE focus_events (session_id TEXT NOT NULL REFERENCES focus_sessions(id), kind TEXT NOT NULL, delivery TEXT NOT NULL CHECK(delivery IN ('pending','delivered')), PRIMARY KEY(session_id, kind));
        `);
        db.prepare('INSERT INTO schema_migrations VALUES (2)').run();
      }
      if (schema < 3) {
        db.exec(`CREATE TABLE desktop_preferences (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL);
          CREATE TABLE desktop_alerts (session_id TEXT PRIMARY KEY REFERENCES focus_sessions(id), notification TEXT NOT NULL, sound TEXT NOT NULL, dismissed INTEGER NOT NULL CHECK(dismissed IN (0,1)));
          CREATE INDEX desktop_alerts_unread ON desktop_alerts(dismissed);
          CREATE INDEX focus_events_pending ON focus_events(delivery, session_id);`);
        db.prepare('INSERT INTO schema_migrations VALUES (3)').run();
      }
      if (schema < 4) {
        db.exec(`CREATE TABLE habits (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('action','time')), timezone TEXT NOT NULL, created_date TEXT NOT NULL);
          CREATE TABLE habit_versions (habit_id TEXT NOT NULL REFERENCES habits(id), effective_date TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(habit_id,effective_date));
          CREATE TABLE habit_checks (habit_id TEXT NOT NULL REFERENCES habits(id), local_date TEXT NOT NULL, PRIMARY KEY(habit_id,local_date));
          CREATE TABLE habit_contributions (session_id TEXT NOT NULL REFERENCES focus_sessions(id), habit_id TEXT NOT NULL REFERENCES habits(id), local_date TEXT NOT NULL, duration_ms INTEGER NOT NULL CHECK(duration_ms > 0), PRIMARY KEY(session_id,habit_id,local_date));
          CREATE INDEX habit_credit_period ON habit_contributions(habit_id,local_date);
          CREATE TABLE habit_commands (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, created_utc INTEGER NOT NULL);
          CREATE TABLE habit_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, selected_id TEXT REFERENCES habits(id));
          INSERT INTO habit_state VALUES (1,0,NULL);`);
        db.prepare('INSERT INTO schema_migrations VALUES (4)').run();
      }
      if (schema < 5) migrateProduction(db);
      db.pragma('user_version = 5');
    })();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
