import { readProductionDay } from './production-day';
import type Database from 'better-sqlite3';
import {
  productionQuerySchema,
  productionSnapshotSchema,
  type ProductionSnapshot,
} from '../../shared/contracts/production';
import { addDays, civilDate, nextCivilDay } from '../../shared/domain/habits';
import { changePercent, comparisonWindow, dateRange } from '../../shared/domain/production';
import { creditDays, creditTotal, dataCeiling } from './production-queries';
import { productionGoals } from './production-goals';

export function productionRepository(db: Database.Database) {
  const goals = productionGoals(db);
  const read = (input: unknown, now: number, timezone: string): ProductionSnapshot => {
    const query = productionQuerySchema.parse(input);
    const habits = (
      db
        .prepare("SELECT id,name,timezone FROM habits WHERE kind='time' ORDER BY name,id")
        .all() as { id: string; name: string; timezone: string }[]
    ).map((habit) => {
      const row = db
        .prepare(
          'SELECT payload FROM habit_versions WHERE habit_id=? AND effective_date<=? ORDER BY effective_date DESC LIMIT 1',
        )
        .get(habit.id, civilDate(now, habit.timezone)) as { payload: string } | undefined;
      return {
        ...habit,
        archived: !row || !(JSON.parse(row.payload) as { active: boolean }).active,
      };
    });
    if (query.habitId) {
      const habit = habits.find((h) => h.id === query.habitId);
      if (!habit) throw new Error('INVALID_HABIT');
      timezone = habit.timezone;
    } else timezone = goals.timezone(timezone, null);
    const today = civilDate(now, timezone),
      endDate = query.endDate ?? today,
      dates = dateRange(endDate, query.days),
      startDate = dates[0];
    if (endDate > today) throw new Error('FUTURE_PERIOD');
    const context = `${query.days}:${endDate}:${query.habitId ?? 'global'}`,
      maximum = dataCeiling(db);
    const ceiling = query.cursor?.ceiling ?? query.ceiling ?? maximum;
    if (
      ceiling > maximum ||
      (query.cursor &&
        (query.cursor.context !== context ||
          (query.ceiling !== undefined && query.ceiling !== ceiling)))
    )
      throw new Error('INVALID_CURSOR');
    const totals = new Map(
      creditDays(db, startDate, endDate, query.habitId, ceiling).map((day) => [
        day.date,
        day.durationMs,
      ]),
    );
    const daysData = dates.map((date) => ({ date, durationMs: totals.get(date) ?? 0 }));
    const eligibleMs = daysData.reduce((sum, day) => sum + day.durationMs, 0),
      activeDays = daysData.filter((day) => day.durationMs > 0).length;
    const scope = query.habitId ? ' AND habit_id=?' : '',
      params: unknown[] = [startDate, endDate, ceiling];
    if (query.habitId) params.push(query.habitId);
    const counts = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN outcome='completed' AND eligible_ms>0 THEN 1 ELSE 0 END),0) AS sessions,COALESCE(SUM(CASE WHEN outcome='interrupted' THEN active_ms ELSE 0 END),0) AS interruptedMs FROM focus_sessions WHERE completion_date BETWEEN ? AND ? AND rowid<=? AND phase IN ('focus','free')${scope}`,
      )
      .get(...params) as { sessions: number; interruptedMs: number };
    const comparison = comparisonWindow(startDate, query.days, endDate, today);
    // A janela comparável atual já está neste agregado, com o mesmo recorte/watermark.
    // Evita reler todos os créditos e continua excluindo hoje quando ainda aberto.
    const currentMs = comparison.days
      ? daysData.reduce(
          (sum, day) => sum + (day.date <= comparison.currentEnd ? day.durationMs : 0),
          0,
        )
      : 0;
    const previousMs = comparison.days
      ? creditTotal(db, comparison.previousStart, comparison.previousEnd, query.habitId, ceiling)
      : 0;
    // Faixa UTC conservadora permite buscar o índice sem reinterpretar as datas civis gravadas.
    const historyParams: unknown[] = [
      startDate,
      endDate,
      ceiling,
      Date.parse(`${startDate}T00:00:00Z`) - 36 * 3_600_000,
      Date.parse(`${addDays(endDate, 1)}T00:00:00Z`) + 36 * 3_600_000,
    ];
    if (query.habitId) historyParams.push(query.habitId);
    const before = query.cursor ? ' AND (s.completed_utc<? OR (s.completed_utc=? AND s.id<?))' : '';
    if (query.cursor)
      historyParams.push(query.cursor.beforeUtcMs, query.cursor.beforeUtcMs, query.cursor.beforeId);
    const historyRows = db
      .prepare(
        `SELECT s.id,s.phase,s.outcome,s.completed_utc AS completedUtcMs,s.completion_date AS completionDate,s.timezone,s.active_ms AS activeMs,s.eligible_ms AS eligibleMs,h.name AS habitName FROM focus_sessions s LEFT JOIN habits h ON h.id=s.habit_id WHERE s.completion_date BETWEEN ? AND ? AND s.rowid<=? AND s.completed_utc>=? AND s.completed_utc<? AND s.phase IN ('focus','free')${query.habitId ? ' AND s.habit_id=?' : ''}${before} ORDER BY s.completed_utc DESC,s.id DESC LIMIT 21`,
      )
      .all(...historyParams) as ProductionSnapshot['history'];
    const history = historyRows.slice(0, 20),
      last = history.at(-1);
    return productionSnapshotSchema.parse({
      version: 1,
      today,
      timezone,
      startDate,
      endDate,
      days: query.days,
      habitId: query.habitId,
      ceiling,
      refreshAfterMs: nextCivilDay(now, timezone),
      metrics: {
        eligibleMs,
        interruptedMs: counts.interruptedMs,
        sessions: counts.sessions,
        activeDays,
        averagePerDayMs: eligibleMs / query.days,
        averagePerActiveDayMs: activeDays ? eligibleMs / activeDays : null,
      },
      previous: {
        days: comparison.days,
        currentMs,
        previousMs,
        percentChange: comparison.days ? changePercent(currentMs, previousMs) : null,
      },
      daysData,
      goals: goals.read(endDate, today, timezone, query.habitId, ceiling, now),
      habits: habits.map(({ id, name, archived }) => ({ id, name, archived })),
      history,
      nextCursor:
        historyRows.length > 20 && last
          ? { beforeUtcMs: last.completedUtcMs, beforeId: last.id, ceiling, context }
          : null,
    });
  };
  return {
    read,
    day: (input: unknown, now: number, timezone: string) =>
      readProductionDay(db, input, read, now, timezone),
    command: goals.command,
    goals: (now: number, timezone: string) => {
      timezone = goals.timezone(timezone, null);
      const today = civilDate(now, timezone);
      return goals.read(today, today, timezone, null, dataCeiling(db), now);
    },
  };
}
