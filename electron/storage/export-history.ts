import type Database from 'better-sqlite3';
import {
  productionQuerySchema,
  productionHistoryPageSchema,
} from '../../shared/contracts/production';
import { civilDate, addDays } from '../../shared/domain/habits';
import { dateRange } from '../../shared/domain/production';
import { dataCeiling } from './production-queries';
import { productionGoals } from './production-goals';

/** Leitura interna em lotes, sem agregados de gráficos/metas a cada página. */
export function exportHistory(
  db: Database.Database,
  input: unknown,
  now: number,
  timezone: string,
) {
  const query = productionQuerySchema.parse(input);
  if (query.habitId !== null) throw new Error('EXPORT_GLOBAL_ONLY');
  timezone = productionGoals(db).timezone(timezone, null);
  const today = civilDate(now, timezone),
    endDate = query.endDate ?? today;
  if (endDate > today) throw new Error('FUTURE_PERIOD');
  const startDate = dateRange(endDate, query.days)[0];
  const context = `${query.days}:${endDate}:global`,
    maximum = dataCeiling(db);
  const ceiling = query.cursor?.ceiling ?? query.ceiling ?? maximum;
  if (
    ceiling > maximum ||
    (query.cursor &&
      (query.cursor.context !== context ||
        (query.ceiling !== undefined && query.ceiling !== ceiling)))
  )
    throw new Error('INVALID_CURSOR');
  const params: unknown[] = [
    startDate,
    endDate,
    ceiling,
    Date.parse(`${startDate}T00:00:00Z`) - 36 * 3_600_000,
    Date.parse(`${addDays(endDate, 1)}T00:00:00Z`) + 36 * 3_600_000,
  ];
  const before = query.cursor ? ' AND (s.completed_utc<? OR (s.completed_utc=? AND s.id<?))' : '';
  if (query.cursor)
    params.push(query.cursor.beforeUtcMs, query.cursor.beforeUtcMs, query.cursor.beforeId);
  const rows = db
    .prepare(
      `SELECT s.id,s.phase,s.outcome,s.completed_utc AS completedUtcMs,s.completion_date AS completionDate,s.timezone,s.active_ms AS activeMs,s.eligible_ms AS eligibleMs,h.name AS habitName FROM focus_sessions s LEFT JOIN habits h ON h.id=s.habit_id WHERE s.completion_date BETWEEN ? AND ? AND s.rowid<=? AND s.completed_utc>=? AND s.completed_utc<? AND s.phase IN ('focus','free')${before} ORDER BY s.completed_utc DESC,s.id DESC LIMIT 501`,
    )
    .all(...params);
  const history = rows.slice(0, 500) as { id: string; completedUtcMs: number }[],
    last = history.at(-1);
  return productionHistoryPageSchema.parse({
    endDate,
    ceiling,
    history,
    nextCursor:
      rows.length > 500 && last
        ? { beforeUtcMs: last.completedUtcMs, beforeId: last.id, ceiling, context }
        : null,
  });
}
