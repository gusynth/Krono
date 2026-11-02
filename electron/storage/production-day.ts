import type Database from 'better-sqlite3';
import {
  productionDayQuerySchema,
  productionDaySchema,
  type ProductionSnapshot,
} from '../../shared/contracts/production';

export function readProductionDay(
  db: Database.Database,
  input: unknown,
  read: (query: unknown, now: number, timezone: string) => ProductionSnapshot,
  now: number,
  timezone: string,
) {
  const q = productionDayQuerySchema.parse(input),
    context = `day:${q.date}:${q.habitId ?? 'global'}`;
  if (q.cursor && (q.cursor.context !== context || q.cursor.ceiling !== q.ceiling))
    throw new Error('INVALID_CURSOR');
  const meta = read(
    { days: 1, endDate: q.date, habitId: q.habitId, ceiling: q.ceiling },
    now,
    timezone,
  );
  const params: unknown[] = [q.date, q.ceiling, q.date, q.date];
  let filter = '';
  if (q.habitId) {
    filter += ' AND s.habit_id=?';
    params.push(q.habitId);
  }
  if (q.cursor) {
    filter += ' AND (s.completed_utc<? OR (s.completed_utc=? AND s.id<?))';
    params.push(q.cursor.beforeUtcMs, q.cursor.beforeUtcMs, q.cursor.beforeId);
  }
  const rows = db
    .prepare(
      `SELECT s.id,s.phase,s.outcome,s.started_utc AS startedUtcMs,s.completed_utc AS completedUtcMs,s.completion_date AS completionDate,s.timezone,s.active_ms AS activeMs,s.eligible_ms AS eligibleMs,h.name AS habitName,COALESCE(c.duration_ms,0) AS dayCreditMs FROM focus_sessions s LEFT JOIN habits h ON h.id=s.habit_id LEFT JOIN focus_daily_credit c ON c.session_id=s.id AND c.local_date=? WHERE s.rowid<=? AND s.phase IN ('focus','free') AND (s.id IN (SELECT session_id FROM focus_daily_credit WHERE local_date=?) OR s.completion_date=?)${filter} ORDER BY s.completed_utc DESC,s.id DESC LIMIT 21`,
    )
    .all(...params) as (ProductionSnapshot['history'][number] & {
    startedUtcMs: number;
    dayCreditMs: number;
  })[];
  const history = rows.slice(0, 20),
    last = history.at(-1);
  return productionDaySchema.parse({
    date: q.date,
    eligibleMs: meta.metrics.eligibleMs,
    interruptedMs: meta.metrics.interruptedMs,
    history,
    nextCursor:
      rows.length > 20 && last
        ? { beforeUtcMs: last.completedUtcMs, beforeId: last.id, ceiling: q.ceiling, context }
        : null,
  });
}
