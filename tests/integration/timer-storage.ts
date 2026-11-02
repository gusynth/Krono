import assert from 'node:assert/strict';
import { createBackup, inspectBackup, restoreBackup } from '../../electron/storage/backup';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { timerRepository, type TimerRepository } from '../../electron/storage/timer-repository';
import { TimerService } from '../../electron/services/TimerService';
import type { TimerCommand } from '../../shared/contracts/timer';

export async function verifyTimerStorage(dir: string) {
  const path = join(dir, 'focus.sqlite');
  // Migração aditiva de uma base schema 1 real, sem perder conteúdo existente.
  const old = new Database(path);
  old.exec(
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (1); CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES ('synthetic')",
  );
  old.pragma('user_version = 1');
  old.close();
  const db = openDatabase(path);
  assert.equal(db.pragma('user_version', { simple: true }), 5);
  assert.deepEqual(db.prepare('SELECT * FROM preserved').all(), [{ value: 'synthetic' }]);
  const repository = timerRepository(db);
  const asyncRepository: TimerRepository = {
    load: async () => repository.load(),
    lookup: async (id) => repository.lookup(id),
    commit: async (value) => repository.commit(value),
  };
  let mono = 0,
    utc = Date.parse('2026-01-01T23:59:59.500Z');
  const timer = new TimerService(
    asyncRepository,
    { monotonic: () => mono, civil: () => utc },
    'UTC',
    false,
  );
  const command = (action: TimerCommand['action'], rest: Partial<TimerCommand> = {}) => ({
    commandId: randomUUID(),
    expectedRevision: timer.read().revision,
    sessionId: timer.read().sessionId,
    action,
    ...rest,
  });
  const advance = (ms: number) => {
    mono += ms;
    utc += ms;
  };
  await timer.initialize();
  const start = command('start', {
    preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
  });
  assert.equal((await timer.command(start)).code, 'ok');
  assert.equal((await timer.command(start)).code, 'ok');
  advance(1000);
  // Falha real dentro da transação: resultado/segmentos/credito/ciclo/evento/comando devem dar rollback.
  db.exec(
    "CREATE TRIGGER fail_credit BEFORE INSERT ON focus_daily_credit BEGIN SELECT RAISE(ABORT, 'injected'); END",
  );
  await timer.wake();
  assert.equal(timer.read().state, 'storage-error');
  for (const table of ['focus_sessions', 'focus_segments', 'focus_daily_credit', 'focus_events'])
    assert.equal(
      (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total,
      0,
    );
  assert.equal(repository.load().cycle, 0);
  assert.equal(repository.load().state, 'running');
  db.exec('DROP TRIGGER fail_credit');
  await timer.command(command('retry'));
  assert.equal(timer.read().cycle, 1);
  const credits = db
    .prepare('SELECT local_date, duration_ms FROM focus_daily_credit ORDER BY local_date')
    .all();
  assert.deepEqual(credits, [
    { local_date: '2026-01-01', duration_ms: 500 },
    { local_date: '2026-01-02', duration_ms: 500 },
  ]);
  assert.deepEqual(db.prepare('SELECT active_ms, eligible_ms, outcome FROM focus_sessions').all(), [
    { active_ms: 1000, eligible_ms: 1000, outcome: 'completed' },
  ]);
  assert.deepEqual(db.prepare('SELECT delivery FROM focus_events').all(), [
    { delivery: 'pending' },
  ]);
  await timer.wake();
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS total FROM focus_sessions').get() as { total: number }).total,
    1,
  );
  // Constraint UNIQUE por sessão impede crédito/conclusão duplicados mesmo fora do serviço.
  assert.throws(() => db.exec('INSERT INTO focus_sessions SELECT * FROM focus_sessions'));
  // Pausa concluída não gera foco elegível nem incremento de ciclo.
  assert.equal(timer.read().state, 'idle');
  assert.equal(timer.read().focusNumber, 1); // Meia-noite encerrou somente o conjunto.
  await timer.command(
    command('start', {
      phase: 'short-break',
      preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    }),
  );
  advance(1000);
  await timer.wake();
  assert.equal(timer.read().cycle, 1);
  assert.deepEqual(
    db.prepare("SELECT eligible_ms FROM focus_sessions WHERE phase = 'short-break'").all(),
    [{ eligible_ms: 0 }],
  );
  // Checkpoint ativo sobrevive reabertura. Intervalo offline e fração não confirmada não entram.
  await timer.command(
    command('start', {
      preset: { focusMs: 5000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    }),
  );
  advance(2000);
  await timer.wake();
  advance(1000);
  timer.dispose();
  db.close();
  const reopened = openDatabase(path);
  const recovered = timerRepository(reopened);
  const service = new TimerService(
    {
      load: async () => recovered.load(),
      lookup: async (id) => recovered.lookup(id),
      commit: async (value) => recovered.commit(value),
    },
    { monotonic: () => 0, civil: () => utc + 86_400_000 },
    'UTC',
    false,
  );
  await service.initialize();
  assert.equal(service.read().state, 'recovering');
  assert.equal(service.read().elapsedMs, 2000);
  await service.command({
    commandId: randomUUID(),
    expectedRevision: service.read().revision,
    sessionId: service.read().sessionId,
    action: 'discard',
  });
  assert.equal(service.read().cycle, 1);
  assert.equal(
    (
      reopened
        .prepare("SELECT eligible_ms FROM focus_sessions WHERE outcome = 'interrupted'")
        .get() as { eligible_ms: number }
    ).eligible_ms,
    0,
  );
  assert.equal(reopened.pragma('integrity_check', { simple: true }), 'ok');
  service.dispose();
  reopened.close();
  // Prova curta com relógio/scheduler reais; não substitui ensaio de 25 minutos ou energia.
  const realtimeDb = openDatabase(join(dir, 'realtime.sqlite'));
  const realtimeRepo = timerRepository(realtimeDb);
  const realtime = new TimerService(
    {
      load: async () => realtimeRepo.load(),
      lookup: async (id) => realtimeRepo.lookup(id),
      commit: async (value) => realtimeRepo.commit(value),
    },
    { monotonic: () => performance.now(), civil: () => Date.now() },
    'UTC',
  );
  try {
    await realtime.initialize();
    const done = new Promise<void>((resolve, reject) => {
      const guard = setTimeout(() => {
        unsubscribe();
        reject(new Error('REALTIME_DEADLINE_TIMEOUT'));
      }, 8000);
      const unsubscribe = realtime.subscribe((value) => {
        if (value.state === 'awaiting-next') {
          clearTimeout(guard);
          unsubscribe();
          resolve();
        }
      });
    });
    await realtime.command({
      commandId: randomUUID(),
      expectedRevision: 0,
      sessionId: null,
      action: 'start',
      preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    });
    await done;
    assert.deepEqual(realtimeDb.prepare('SELECT eligible_ms FROM focus_sessions').all(), [
      { eligible_ms: 1000 },
    ]);
  } finally {
    realtime.dispose();
    realtimeDb.close();
  }
  const dailyDb = openDatabase(join(dir, 'daily-cycle.sqlite')),
    dailyRepo = timerRepository(dailyDb);
  let dailyUtc = Date.parse('2026-10-28T23:59:59.500Z'),
    dailyMono = 0;
  const daily = new TimerService(
    {
      load: async () => dailyRepo.load(),
      lookup: async (id) => dailyRepo.lookup(id),
      commit: async (value) => dailyRepo.commit(value),
    },
    { civil: () => dailyUtc, monotonic: () => dailyMono },
    'UTC',
    false,
  );
  const sendDaily = (
    action: import('../../shared/contracts/timer').TimerCommand['action'],
    extra = {},
  ) =>
    daily.command({
      commandId: randomUUID(),
      expectedRevision: daily.read().revision,
      sessionId: daily.read().sessionId,
      action,
      ...extra,
    });
  const short = { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 };
  try {
    await daily.initialize();
    await sendDaily('set-single-focus', { singleFocus: true });
    await sendDaily('start', { preset: short });
    dailyUtc += 1000;
    dailyMono += 1000;
    await daily.wake();
    assert.equal(daily.read().state, 'idle');
    assert.equal(daily.read().cycle, 1);
    assert.equal(daily.read().focusCompleted, true);
    assert.deepEqual(
      dailyDb
        .prepare('SELECT local_date,duration_ms FROM focus_daily_credit ORDER BY local_date')
        .all(),
      [
        { local_date: '2026-10-28', duration_ms: 500 },
        { local_date: '2026-10-29', duration_ms: 500 },
      ],
    );
    assert.equal(dailyRepo.load().session, null);
    await sendDaily('start', { preset: short });
    dailyUtc += 1000;
    dailyMono += 1000;
    await daily.wake();
    const end = {
      commandId: randomUUID(),
      expectedRevision: daily.read().revision,
      sessionId: daily.read().sessionId,
      action: 'end-cycle',
    };
    assert.equal((await daily.command(end)).code, 'ok');
    assert.equal((await daily.command(end)).code, 'ok');
    await sendDaily('start', { preset: short });
    dailyUtc += 200;
    dailyMono += 200;
    await sendDaily('end-cycle');
    assert.deepEqual(
      dailyDb
        .prepare('SELECT outcome,active_ms,eligible_ms FROM focus_sessions ORDER BY completed_utc')
        .all(),
      [
        { outcome: 'completed', active_ms: 1000, eligible_ms: 1000 },
        { outcome: 'completed', active_ms: 1000, eligible_ms: 1000 },
        { outcome: 'interrupted', active_ms: 200, eligible_ms: 0 },
      ],
    );
    assert.equal(
      (dailyDb.prepare('SELECT count(*) n FROM focus_events').get() as { n: number }).n,
      2,
    );
    dailyUtc += 7 * 86_400_000;
    await daily.wake();
    assert.equal(daily.read().focusNumber, 1);
    assert.equal(daily.read().cycle, 2);
    const reloaded = timerRepository(dailyDb).load();
    assert.equal(reloaded.cycleBase, 2);
    assert.equal(reloaded.cycleDate, '2026-11-05');
    assert.equal(dailyDb.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(dailyDb.pragma('foreign_key_check'), []);
    await sendDaily('set-single-focus', { singleFocus: true });
    await sendDaily('start', { preset: short });
    dailyUtc += 200;
    dailyMono += 200;
    await sendDaily('pause');
    daily.dispose();
    const file = join(dir, 'single-focus.krono-backup');
    await createBackup(dailyDb, file, dailyUtc);
    const summary = await inspectBackup(file);
    const roundtrip = openDatabase(join(dir, 'single-focus-restored.sqlite'));
    try {
      await restoreBackup(
        roundtrip,
        file,
        summary.digest,
        join(dir, 'single-focus-previous.krono-backup'),
        dailyUtc,
      );
      const restored = timerRepository(roundtrip).load();
      assert.equal(restored.session?.singleFocus, true);
      assert.equal(restored.state, 'paused');
      assert.equal(restored.cycleDate, '2026-11-05');
      assert.equal(roundtrip.pragma('integrity_check', { simple: true }), 'ok');
    } finally {
      roundtrip.close();
    }
  } finally {
    daily.dispose();
    dailyDb.close();
  }
  return {
    dailyCycle:
      'single focus and cross-midnight credit; end-cycle idempotency; interrupted partial; durable reset; no duplicated events',
    realtimeScheduler: '1000 ms eligible with real clock/wake',
    migration: '1→2 preserved',
    rollback: 'result/segments/credit/event/cycle/command',
    credit: 'exact midnight split',
    recovery: 'checkpoint only; no offline credit',
    integrity: 'ok',
  };
}
