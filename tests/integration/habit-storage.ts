import { removeProductionSchema } from './legacy-fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { habitRepository } from '../../electron/storage/habit-repository';
import { timerRepository } from '../../electron/storage/timer-repository';
import { TimerService } from '../../electron/services/TimerService';
import type { HabitCommand, HabitInput } from '../../shared/contracts/habits';
import { defaultPreset } from '../../shared/contracts/timer';
import { createBackup } from '../../electron/storage/backup';

export async function verifyHabitStorage(dir: string) {
  const migrationPath = join(dir, 'schema-three.sqlite');
  let legacy = openDatabase(migrationPath);
  const legacySession = {
    id: randomUUID(),
    phase: 'focus',
    preset: defaultPreset,
    timezone: 'UTC',
    startedUtcMs: 1000,
    segments: [{ startUtcMs: 1000, durationMs: 1000 }],
  };
  legacy.prepare('INSERT INTO timer_head VALUES (1,?)').run(
    JSON.stringify({
      version: 1,
      revision: 1,
      state: 'paused',
      phase: 'focus',
      nextPhase: 'focus',
      cycle: 0,
      session: legacySession,
    }),
  );
  removeProductionSchema(legacy);
  legacy.exec(
    'DROP TABLE habit_contributions; DROP TABLE habit_checks; DROP TABLE habit_versions; DROP TABLE habit_commands; DROP TABLE habit_state; DROP TABLE habits; DELETE FROM schema_migrations WHERE version=4',
  );
  legacy.pragma('user_version=3');
  legacy.close();
  legacy = openDatabase(migrationPath);
  assert.equal(legacy.pragma('user_version', { simple: true }), 5);
  assert.deepEqual(timerRepository(legacy).load().session, legacySession);
  assert.equal(habitRepository(legacy).read(Date.UTC(2026, 0, 1), 'UTC').habits.length, 0);
  legacy.close();
  const path = join(dir, 'habits.sqlite');
  let db = openDatabase(path),
    habits = habitRepository(db);
  let now = Date.parse('2026-01-01T23:59:30Z'),
    mono = 0;
  const read = () => habits.read(now, 'UTC');
  const action = (
    action: HabitCommand['action'],
    id: string | null,
    extra: Partial<HabitCommand> = {},
  ) => ({
    commandId: randomUUID(),
    expectedRevision: read().revision,
    action,
    habitId: id,
    ...(['check', 'undo'].includes(action)
      ? { expectedDate: new Date(now).toISOString().slice(0, 10) }
      : {}),
    ...extra,
  });
  const send = (command: HabitCommand) => habits.command(command, now, 'UTC');
  const input: HabitInput = {
    name: 'Leitura',
    kind: 'action',
    frequency: { kind: 'daily' },
    targetMinutes: 1,
  };
  const id = randomUUID();
  assert.equal(send(action('create', id, { input })).code, 'ok');
  const check = action('check', id);
  assert.equal(send(check).code, 'ok');
  assert.equal(send(check).code, 'ok');
  assert.equal(read().habits[0].streak, 1);
  assert.equal(read().habits[0].completed, 1);
  assert.equal(send({ ...check, action: 'undo' }).code, 'conflict');
  assert.equal(send(action('undo', id)).code, 'ok');
  assert.equal(read().habits[0].today.status, 'pending');
  send(action('check', id));
  const staleDay = action('undo', id); // Tela antiga não pode alterar a data seguinte.
  // Frequência muda amanhã, histórico anterior permanece diário e concluído.
  send(action('edit', id, { input: { ...input, frequency: { kind: 'specific', days: [0] } } }));
  assert.equal(read().habits[0].today.status, 'completed');
  assert.equal(read().habits[0].pendingChange, true);
  now = Date.parse('2026-01-02T23:59:30Z');
  assert.equal(send({ ...staleDay, expectedRevision: read().revision }).code, 'conflict');
  assert.equal(send(check).code, 'ok'); // Retry mantém o efeito original, sem novo check.
  assert.equal(read().habits[0].today.status, 'rest');
  assert.equal(send(action('check', id)).code, 'invalid');
  send(action('archive', id));
  now = Date.parse('2026-01-04T12:00:00Z');
  send(action('restore', id));
  assert.equal(read().habits[0].today.status, 'pending');
  assert.equal(
    read().habits[0].history.find((day) => day.date === '2026-01-02')?.status,
    'not-applicable',
  );
  assert.equal(read().habits[0].streak, 1);
  // Erro real de disco/constraint não aplica nome, vigência ou comando parcialmente.
  db.exec(
    "CREATE TRIGGER fail_habit BEFORE INSERT ON habit_versions BEGIN SELECT RAISE(ABORT,'injected'); END",
  );
  const failed = action('edit', id, { input: { ...input, name: 'Novo nome' } });
  assert.throws(() => send(failed));
  assert.equal(read().habits[0].name, 'Leitura');
  db.exec('DROP TRIGGER fail_habit');
  assert.equal(send(failed).code, 'ok');
  // Link congelado ao iniciar, troca durante execução só afeta o próximo.
  now = Date.parse('2026-01-05T23:59:30Z');
  const timed = randomUUID(),
    other = randomUUID();
  for (const habitId of [timed, other])
    send(action('create', habitId, { input: { ...input, kind: 'time', name: habitId } }));
  assert.equal(send(action('check', timed)).code, 'invalid');
  send(action('select', timed));
  const repo = timerRepository(db);
  const timer = new TimerService(
    {
      load: async () => repo.load(),
      lookup: async (id) => repo.lookup(id),
      commit: async (value) => repo.commit(value),
    },
    { civil: () => now, monotonic: () => mono },
    'UTC',
    false,
    undefined,
    async () => habits.selected(now),
  );
  await timer.initialize();
  const timerCommand = (action: 'start' | 'retry' | 'cancel') =>
    timer.command({
      commandId: randomUUID(),
      expectedRevision: timer.read().revision,
      sessionId: timer.read().sessionId,
      action,
      ...(action === 'start'
        ? {
            phase: 'focus',
            preset: { focusMs: 60_000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
          }
        : {}),
    });
  await timerCommand('start');
  assert.equal(send(action('delete', timed, { confirmPermanent: true })).code, 'invalid');
  send(action('select', other));
  now += 60_000;
  mono += 60_000;
  db.exec(
    "CREATE TRIGGER fail_contribution BEFORE INSERT ON habit_contributions BEGIN SELECT RAISE(ABORT,'injected'); END",
  );
  await timer.wake();
  assert.equal(timer.read().state, 'storage-error');
  for (const table of [
    'focus_sessions',
    'focus_daily_credit',
    'habit_contributions',
    'focus_events',
  ])
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0);
  db.exec('DROP TRIGGER fail_contribution');
  await timerCommand('retry');
  await timer.wake();
  assert.equal(timer.read().cycle, 1);
  // A conclusão atravessou a meia-noite: o conjunto acabou e não há sessão atual vinculada.
  assert.equal(timer.read().state, 'idle');
  assert.equal(timer.read().sessionId, null);
  assert.deepEqual(
    db
      .prepare(
        'SELECT habit_id,local_date,duration_ms FROM habit_contributions ORDER BY local_date',
      )
      .all(),
    [
      { habit_id: timed, local_date: '2026-01-05', duration_ms: 30_000 },
      { habit_id: timed, local_date: '2026-01-06', duration_ms: 30_000 },
    ],
  );
  assert.equal(read().habits.find((h) => h.id === other)?.today.durationMs, 0);
  await timerCommand('start');
  now += 10_000;
  mono += 10_000;
  await timerCommand('cancel');
  assert.equal(read().habits.find((h) => h.id === other)?.today.durationMs, 0);
  timer.dispose();
  db.close();
  db = openDatabase(path);
  habits = habitRepository(db);
  assert.equal(read().selectedId, other);
  assert.equal(read().habits.find((h) => h.id === timed)?.today.durationMs, 30_000);
  send(action('archive', other));
  assert.equal(read().selectedId, null);
  send(action('restore', other));
  assert.equal(read().selectedId, null);
  const totals = db
    .prepare('SELECT id,eligible_ms,active_ms FROM focus_sessions ORDER BY id')
    .all();
  const credits = db
    .prepare('SELECT * FROM focus_daily_credit ORDER BY session_id,local_date')
    .all();
  assert.equal(send(action('delete', timed)).code, 'invalid');
  db.prepare('INSERT INTO production_goal_versions VALUES (?,?,?,?,?,?)').run(
    `habit:${timed}`,
    'daily',
    '2026-01-01',
    'UTC',
    60000,
    now,
  );
  const deletion = action('delete', timed, { confirmPermanent: true });
  db.exec(
    "CREATE TRIGGER fail_delete BEFORE DELETE ON habits BEGIN SELECT RAISE(ABORT,'injected'); END",
  );
  assert.throws(() => send(deletion));
  assert.ok(read().habits.some((h) => h.id === timed));
  assert.equal(
    (
      db.prepare('SELECT COUNT(*) AS n FROM habit_contributions WHERE habit_id=?').get(timed) as {
        n: number;
      }
    ).n,
    2,
  );
  db.exec('DROP TRIGGER fail_delete');
  assert.equal(send(deletion).code, 'ok');
  assert.equal(send(deletion).code, 'ok');
  assert.ok(!read().habits.some((h) => h.id === timed));
  assert.equal(
    (
      db
        .prepare('SELECT COUNT(*) AS n FROM production_goal_versions WHERE scope=?')
        .get(`habit:${timed}`) as { n: number }
    ).n,
    0,
  );
  assert.deepEqual(
    db.prepare('SELECT id,eligible_ms,active_ms FROM focus_sessions ORDER BY id').all(),
    totals,
  );
  assert.deepEqual(
    db.prepare('SELECT * FROM focus_daily_credit ORDER BY session_id,local_date').all(),
    credits,
  );
  const sessions = db.prepare('SELECT habit_id,payload FROM focus_sessions').all() as {
    habit_id: string | null;
    payload: string;
  }[];
  assert.ok(
    sessions.every(
      (session) => session.habit_id !== timed && JSON.parse(session.payload).habitId !== timed,
    ),
  );
  send(action('select', other));
  assert.equal(send(action('delete', other, { confirmPermanent: true })).code, 'ok');
  assert.equal(read().selectedId, null);
  assert.equal(send(action('delete', id, { confirmPermanent: true })).code, 'ok');
  assert.equal(read().habits.length, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  await createBackup(db, join(dir, 'deleted-habits.krono-backup'), now);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  db.close();
  return {
    calendar: 'versioned; archive/restore; scheduled checks only; historical credit preserved',
    commands: 'idempotent; CAS; rollback/retry',
    focus: 'frozen link; atomic contributions; exact midnight allocation; canceled time excluded',
    integrity: 'ok',
  };
}
