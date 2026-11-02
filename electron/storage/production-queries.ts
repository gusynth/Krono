import type Database from 'better-sqlite3';

export function dataCeiling(db: Database.Database) {
  return (
    db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM focus_sessions').get() as { n: number }
  ).n;
}
export function creditDays(
  db: Database.Database,
  start: string,
  end: string,
  habitId: string | null,
  ceiling: number,
  habitCalendar = false,
) {
  const table = habitId && habitCalendar ? 'habit_contributions' : 'focus_daily_credit';
  const filter = habitId ? ` AND ${habitCalendar ? 'c' : 's'}.habit_id=?` : '';
  const params: unknown[] = [start, end, ceiling];
  if (habitId) params.push(habitId);
  return db
    .prepare(
      `SELECT c.local_date AS date,SUM(c.duration_ms) AS durationMs FROM ${table} c JOIN focus_sessions s ON s.id=c.session_id WHERE c.local_date BETWEEN ? AND ? AND s.rowid<=? AND s.outcome='completed' AND s.phase IN ('focus','free')${filter} GROUP BY c.local_date ORDER BY c.local_date`,
    )
    .all(...params) as { date: string; durationMs: number }[];
}
export function creditTotal(
  db: Database.Database,
  start: string,
  end: string,
  habitId: string | null,
  ceiling: number,
  habitCalendar = false,
): number {
  return creditDays(db, start, end, habitId, ceiling, habitCalendar).reduce(
    (sum, day) => sum + day.durationMs,
    0,
  );
}
