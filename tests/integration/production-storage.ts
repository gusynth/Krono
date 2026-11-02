import { exportHistory } from '../../electron/storage/export-history';
import { readGarden } from '../../electron/storage/garden';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { timerRepository } from '../../electron/storage/timer-repository';
import { productionRepository } from '../../electron/storage/production-repository';
import { habitRepository } from '../../electron/storage/habit-repository';
import { complete } from '../../shared/domain/timer';
import { defaultPreset, type TimerSession } from '../../shared/contracts/timer';
import type { GoalCommand } from '../../shared/contracts/production';
import { removeProductionSchema } from './legacy-fixture';
import Database from 'better-sqlite3';

export async function verifyProductionStorage(dir: string) {
  const badPath = join(dir, 'production-invalid-migration.sqlite'),
    bad = openDatabase(badPath);
  removeProductionSchema(bad);
  bad.pragma('user_version=4');
  const badId = randomUUID();
  bad
    .prepare('INSERT INTO focus_sessions VALUES (?,?,?,?,?,?,?,?,?)')
    .run(badId, 'focus', 'completed', 'UTC', 1000, 2000, 1000, 1000, '{}');
  bad.prepare('INSERT INTO focus_daily_credit VALUES (?,?,?)').run(badId, '1970-01-01', 1000);
  bad.close();
  assert.throws(() => openDatabase(badPath));
  const preserved = new Database(badPath);
  assert.equal(preserved.pragma('user_version', { simple: true }), 4);
  assert.equal(
    (
      preserved.prepare('SELECT SUM(duration_ms) AS n FROM focus_daily_credit').get() as {
        n: number;
      }
    ).n,
    1000,
  );
  assert.equal(
    (preserved.prepare('PRAGMA table_info(focus_sessions)').all() as { name: string }[]).some(
      (column) => column.name === 'completion_date',
    ),
    false,
  );
  preserved.close();
  const path = join(dir, 'production-reference.sqlite');
  let db = openDatabase(path);
  let repository = productionRepository(db);
  let timer = timerRepository(db);
  let now = Date.parse('2026-01-02T16:00:00Z');
  const habits = habitRepository(db),
    habitId = randomUUID();
  habits.command(
    {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: 'create',
      habitId,
      input: {
        name: 'Leitura de referência',
        kind: 'time',
        targetMinutes: 1,
        frequency: { kind: 'daily' },
      },
    },
    Date.parse('2026-01-01T00:00:00Z'),
    'UTC',
  );
  const insert = (
    start: string,
    durationMs: number,
    phase: TimerSession['phase'] = 'focus',
    outcome: 'completed' | 'interrupted' = 'completed',
    timezone = 'UTC',
    linked: string | null = null,
  ) => {
    const old = timer.load(),
      startedUtcMs = Date.parse(start);
    const session: TimerSession = {
      id: randomUUID(),
      phase,
      timezone,
      startedUtcMs,
      segments: [{ startUtcMs: startedUtcMs, durationMs }],
      preset: {
        ...defaultPreset,
        ...(phase === 'focus' && outcome === 'completed' ? { focusMs: durationMs } : {}),
      },
      habitId: linked,
    };
    const active = { ...old, state: 'running' as const, phase, session };
    const next =
      outcome === 'completed'
        ? complete(active)
        : { ...active, state: 'idle' as const, session: null };
    timer.commit({
      expectedRevision: old.revision,
      record: { ...next, revision: old.revision + 1 },
      command: { id: randomUUID(), fingerprint: 'reference' },
      result: { session, outcome, completedUtcMs: startedUtcMs + durationMs },
    });
  };
  insert('2026-01-01T23:50:00Z', 25 * 60_000, 'focus', 'completed', 'UTC', habitId);
  insert('2026-01-02T12:00:00Z', 10 * 60_000);
  insert('2026-01-02T13:00:00Z', 2 * 60_000, 'focus', 'interrupted');
  insert('2026-01-02T13:05:00Z', 5 * 60_000, 'short-break');
  insert('2026-01-02T13:15:00Z', 50_000, 'long-break', 'interrupted');
  insert('2026-01-02T01:00:00Z', 5 * 60_000, 'focus', 'completed', 'America/New_York', habitId);
  insert('2026-01-02T14:00:00Z', 30_000, 'free');
  const read = (endDate = '2026-01-02', days = 2, scope: string | null = null) =>
    repository.read({ days, endDate, habitId: scope }, now, 'UTC');
  let value = read();
  assert.equal(value.metrics.eligibleMs, 2_430_000);
  assert.equal(value.metrics.interruptedMs, 120_000);
  assert.equal(value.metrics.sessions, 4);
  assert.deepEqual(readGarden(db), {
    version: 1,
    eligibleMs: value.metrics.eligibleMs,
    sessions: value.metrics.sessions,
  });
  assert.deepEqual(readGarden(db), readGarden(db)); // leitura repetida não premia nem escreve.
  assert.equal(value.previous.currentMs, 900_000); // Janela de hoje aberto exclui o crédito de 02/01.
  assert.deepEqual(value.daysData, [
    { date: '2026-01-01', durationMs: 900_000 },
    { date: '2026-01-02', durationMs: 1_530_000 },
  ]);
  assert.equal(read('2026-01-01', 1).metrics.sessions, 1);
  assert.equal(read('2026-01-02', 1).metrics.sessions, 3);
  assert.equal(value.metrics.averagePerDayMs, 1_215_000);
  assert.equal(value.metrics.averagePerActiveDayMs, 1_215_000);
  assert.equal(read('2026-01-02', 100).metrics.averagePerDayMs, 24_300);
  const firstDay = repository.day(
    { date: '2026-01-01', habitId: null, ceiling: value.ceiling },
    now,
    'UTC',
  );
  assert.equal(firstDay.eligibleMs, 900_000);
  assert.equal(
    firstDay.history.reduce((sum, item) => sum + item.dayCreditMs, 0),
    900_000,
  );
  const crossing = firstDay.history.find((item) => item.eligibleMs === 1_500_000)!;
  assert.equal(crossing.dayCreditMs, 600_000);
  assert.equal(crossing.completionDate, '2026-01-02');
  const secondDay = repository.day(
    { date: '2026-01-02', habitId: null, ceiling: value.ceiling },
    now,
    'UTC',
  );
  assert.equal(secondDay.eligibleMs, 1_530_000);
  assert.equal(secondDay.interruptedMs, 120_000);
  assert.equal(
    secondDay.history.reduce((sum, item) => sum + item.dayCreditMs, 0),
    secondDay.eligibleMs,
  );
  assert.equal(secondDay.history.find((item) => item.id === crossing.id)!.dayCreditMs, 900_000);
  assert.throws(() =>
    repository.day({ date: '2026-01-03', habitId: null, ceiling: value.ceiling }, now, 'UTC'),
  );
  assert.throws(() =>
    repository.day({ date: '2026-01-01', habitId: null, ceiling: value.ceiling + 999 }, now, 'UTC'),
  );
  const filtered = read('2026-01-02', 2, habitId);
  assert.equal(filtered.metrics.eligibleMs, 1_800_000);
  assert.equal(filtered.metrics.sessions, 2);
  const exported = exportHistory(db, { days: 2, endDate: '2026-01-02', habitId: null }, now, 'UTC');
  assert.deepEqual(exported.history, value.history);
  assert.equal(exported.nextCursor, null);
  assert.throws(() =>
    exportHistory(
      db,
      {
        days: 2,
        endDate: '2026-01-02',
        habitId: null,
        cursor: {
          beforeUtcMs: 1,
          beforeId: randomUUID(),
          ceiling: value.ceiling,
          context: 'invalid',
        },
      },
      now,
      'UTC',
    ),
  );
  assert.equal(value.history.length, 5);
  assert.ok(value.history.every((row) => row.phase === 'focus' || row.phase === 'free'));
  assert.throws(() => read('2026-01-03'));
  assert.throws(() => read('2026-01-02', 367));
  assert.throws(() => read('2026-01-02', 2, randomUUID()));
  const command = (rest: Partial<GoalCommand> = {}) => ({
    commandId: randomUUID(),
    expectedRevision: read().goals.revision,
    expectedDate: '2026-01-02',
    habitId: null,
    cadence: 'daily' as const,
    targetMinutes: 20,
    applyCurrent: true,
    ...rest,
  });
  const send = (input: GoalCommand) => repository.command(input, now, 'UTC');
  const first = command();
  assert.equal(send(first).code, 'ok');
  assert.equal(send(first).code, 'ok');
  assert.equal(read().goals.revision, 1);
  assert.equal(send({ ...first, targetMinutes: 10 }).code, 'conflict');
  assert.equal(read().goals.daily.percent, 127.5);
  assert.equal(read().goals.daily.ringPercent, 100);
  assert.equal(read('2026-01-01', 1).goals.daily.definition, null);
  assert.equal(repository.goals(now, 'Pacific/Kiritimati').timezone, 'UTC');
  assert.equal(repository.goals(now, 'Pacific/Kiritimati').today, '2026-01-02');
  send(command({ targetMinutes: 30, applyCurrent: false }));
  assert.equal(read().goals.daily.definition?.targetMs, 20 * 60_000);
  assert.equal(read().goals.daily.pending?.effectiveDate, '2026-01-03');
  send(command({ cadence: 'weekly', targetMinutes: 100, applyCurrent: false }));
  assert.equal(read().goals.weekly.definition, null);
  assert.equal(read().goals.weekly.pending?.effectiveDate, '2026-01-05');
  send(command({ cadence: 'weekly', targetMinutes: 60, applyCurrent: true }));
  assert.equal(read().goals.weekly.percent, 67.5);
  assert.equal(read('2026-01-01', 1).goals.weekly.definition, null);
  send(command({ habitId, targetMinutes: 10 }));
  const habitGoal = read('2026-01-02', 2, habitId).goals.daily;
  assert.equal(habitGoal.actualMs, 20 * 60_000);
  assert.equal(habitGoal.percent, 200); // Meta usa calendário congelado do hábito; filtro conserva datas da sessão.
  for (const targetMinutes of [0, -1, NaN, Infinity])
    assert.equal(send(command({ targetMinutes })).code, 'invalid');
  assert.equal(send(command({ expectedDate: '2026-01-01' })).code, 'conflict');
  db.exec(
    "CREATE TRIGGER fail_goal BEFORE INSERT ON production_goal_versions BEGIN SELECT RAISE(ABORT,'injected'); END",
  );
  const failed = command({ targetMinutes: 45, applyCurrent: false }),
    revision = read().goals.revision;
  assert.throws(() => send(failed));
  assert.equal(read().goals.revision, revision);
  assert.equal(read().goals.daily.pending?.targetMs, 30 * 60_000);
  db.exec('DROP TRIGGER fail_goal');
  assert.equal(send(failed).code, 'ok');
  send(command({ targetMinutes: null, applyCurrent: false }));
  assert.equal(read().goals.daily.pending?.targetMs, null);
  now = Date.parse('2026-01-03T16:00:00Z');
  value = read('2026-01-03', 1);
  assert.equal(value.metrics.averagePerActiveDayMs, null);
  assert.equal(value.metrics.eligibleMs, 0);
  assert.equal(value.previous.percentChange, null);
  assert.equal(value.previous.days, 0);
  assert.equal(value.goals.daily.definition?.targetMs, null);
  assert.equal(value.goals.daily.percent, null);
  assert.equal(read('2026-01-02', 1).previous.percentChange, 70);
  assert.equal(read().metrics.eligibleMs, 2_430_000);
  assert.equal(read().previous.currentMs, 2_430_000); // Com ambos os dias encerrados, usa o período completo.
  db.close();
  db = openDatabase(path);
  repository = productionRepository(db);
  assert.equal(read().metrics.eligibleMs, 2_430_000);
  assert.equal(read('2026-01-02', 1).goals.daily.definition?.targetMs, 20 * 60_000);
  // Reconstrói schema 4 sem alterar sessões, créditos ou contexto; migração deriva apenas os índices/metadados novos.
  removeProductionSchema(db);
  db.pragma('user_version=4');
  db.close();
  db = openDatabase(path);
  repository = productionRepository(db);
  assert.equal(read().metrics.eligibleMs, 2_430_000);
  assert.equal(read('2026-01-02', 2, habitId).metrics.eligibleMs, 1_800_000);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  timer = timerRepository(db);
  db.transaction(() => {
    for (let i = 0; i < 501; i++) insert('2026-01-02T15:00:00Z', 1000, 'free');
  })();
  const firstExport = exportHistory(
    db,
    { days: 2, endDate: '2026-01-02', habitId: null },
    now,
    'UTC',
  );
  assert.equal(firstExport.history.length, 500);
  assert.ok(firstExport.nextCursor);
  insert('2026-01-02T15:30:00Z', 1000, 'free');
  const second = exportHistory(
    db,
    {
      days: 2,
      endDate: firstExport.endDate,
      habitId: null,
      ceiling: firstExport.ceiling,
      cursor: firstExport.nextCursor,
    },
    now,
    'UTC',
  );
  assert.equal(second.nextCursor, null);
  assert.equal(firstExport.history.length + second.history.length, 506);
  const dayScope = { date: '2026-01-02', habitId: null, ceiling: firstExport.ceiling };
  let dayPage = repository.day(dayScope, now, 'UTC');
  const dayRows = [...dayPage.history];
  while (dayPage.nextCursor) {
    dayPage = repository.day({ ...dayScope, cursor: dayPage.nextCursor }, now, 'UTC');
    dayRows.push(...dayPage.history);
  }
  assert.equal(dayRows.length, 505);
  assert.equal(new Set(dayRows.map((row) => row.id)).size, 505);
  assert.equal(
    dayRows.reduce((sum, row) => sum + row.dayCreditMs, 0),
    2_031_000,
  );
  const scopedDay = repository.day({ ...dayScope, habitId }, now, 'UTC');
  assert.equal(scopedDay.eligibleMs, 900_000);
  assert.equal(scopedDay.history.length, 1);
  assert.throws(() =>
    repository.day(
      {
        ...dayScope,
        cursor: {
          beforeUtcMs: 1,
          beforeId: randomUUID(),
          ceiling: dayScope.ceiling,
          context: 'wrong-day',
        },
      },
      now,
      'UTC',
    ),
  );

  assert.equal(new Set([...firstExport.history, ...second.history].map((row) => row.id)).size, 506);
  db.close();
  return {
    referenceMs: 2_430_000,
    dailyMs: [900_000, 1_530_000],
    eligibleSessions: 4,
    interruptedMs: 120_000,
    dayDetails: 'midnight/frozen dates/scope/tied pagination/watermark',
    goals: 'versioned/idempotent/rollback/retry/no-base/over-target',
    migration: '4->5 retains exact credit and link',
    integrity: 'ok',
  };
}
