import assert from 'node:assert/strict';
import { appVersion } from '../../shared/version';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { copyFile, writeFile, readFile, stat, mkdir } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { openDatabase } from '../../electron/storage/database';
import {
  createBackup,
  writeBackup,
  inspectBackup,
  restoreBackup,
  replaceFromBackup,
} from '../../electron/storage/backup';
import { validateBackup } from '../../electron/storage/backup-client';
import { timerRepository } from '../../electron/storage/timer-repository';
import { habitRepository } from '../../electron/storage/habit-repository';
import { productionRepository } from '../../electron/storage/production-repository';
import { desktopRepository } from '../../electron/storage/desktop-repository';
import { TimerService } from '../../electron/services/TimerService';
import { openStorage } from '../../electron/storage/client';
import { workerTimerRepository } from '../../electron/storage/timer-client';
import { defaultPreset, defaultTimerConfiguration } from '../../shared/contracts/timer';
import { Worker } from 'node:worker_threads';

export async function verifyBackupStorage(dir: string) {
  const validatorPath = process.env.KRONO_PACKAGED_WORKER
    ? join(resolve(process.env.KRONO_PACKAGED_WORKER), '..', 'backup-validator.cjs')
    : resolve('dist-electron/backup-validator.cjs');
  const path = join(dir, 'backup-live.sqlite'),
    file = join(dir, 'confirmed.krono-backup'),
    previous = join(dir, 'previous.krono-backup');
  let db = openDatabase(path);
  db.pragma('wal_autocheckpoint=0');
  const timer = timerRepository(db),
    habits = habitRepository(db),
    production = productionRepository(db),
    desktop = desktopRepository(db);
  const now = Date.parse('2026-01-02T12:00:00Z'),
    habitId = randomUUID();
  habits.command(
    {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: 'create',
      habitId,
      input: {
        name: 'Dados do backup',
        kind: 'time',
        frequency: { kind: 'daily' },
        targetMinutes: 1,
      },
    },
    now - 86_400_000,
    'UTC',
  );
  const session = {
    id: randomUUID(),
    phase: 'focus' as const,
    timezone: 'UTC',
    startedUtcMs: Date.parse('2026-01-01T23:59:30Z'),
    preset: { ...defaultPreset, focusMs: 60_000 },
    habitId,
    segments: [{ startUtcMs: Date.parse('2026-01-01T23:59:30Z'), durationMs: 60_000 }],
  };
  const configuration = { ...defaultTimerConfiguration, focusMinutes: 30 };
  timer.commit({
    expectedRevision: 0,
    record: { ...timer.load(), revision: 1, configuration },
    command: { id: 'backup-reference', fingerprint: 'synthetic' },
    result: { session, outcome: 'completed', completedUtcMs: session.startedUtcMs + 60_000 },
  });
  production.command(
    {
      commandId: randomUUID(),
      expectedRevision: 0,
      expectedDate: '2026-01-02',
      habitId: null,
      cadence: 'daily',
      targetMinutes: 2,
      applyCurrent: true,
    },
    now,
    'UTC',
  );
  desktop.update({
    expectedRevision: 0,
    patch: {
      garden: { version: 1, introductionSeen: true, enabled: false },
      habitOrder: [habitId],
      soundEnabled: false,
      volume: 0.3,
      introduction: { version: 1, step: 3, completed: false },
      globalShortcut: 'Control+Alt+K',
    },
  });
  assert.ok((await stat(`${path}-wal`)).size > 0);
  const summary = await createBackup(db, file, now);
  assert.equal(summary.sessions, 1);
  assert.equal(summary.habits, 1);
  assert.equal(summary.appVersion, appVersion);
  const legacyFile = join(dir, 'legacy-010.krono-backup');
  await copyFile(file, legacyFile);
  const legacyBackup = new Database(legacyFile);
  try {
    legacyBackup.prepare('UPDATE backup_manifest SET app_version=?').run('0.1.0');
  } finally {
    legacyBackup.close();
  }
  assert.equal((await inspectBackup(legacyFile)).appVersion, '0.1.0');
  assert.equal((await validateBackup(validatorPath, legacyFile)).appVersion, '0.1.0');
  const prev100File = join(dir, 'legacy-100.krono-backup');
  await copyFile(file, prev100File);
  const prev100Backup = new Database(prev100File);
  try {
    prev100Backup.prepare('UPDATE backup_manifest SET app_version=?').run('1.0.0');
  } finally {
    prev100Backup.close();
  }
  assert.equal((await inspectBackup(prev100File)).appVersion, '1.0.0');
  assert.equal((await validateBackup(validatorPath, prev100File)).appVersion, '1.0.0');
  for (const version of ['1.3.0', '1.3.1']) {
    const legacy = join(dir, `legacy-${version}.krono-backup`);
    await copyFile(file, legacy);
    const source = new Database(legacy);
    try {
      source.prepare('UPDATE backup_manifest SET app_version=?').run(version);
    } finally {
      source.close();
    }
    assert.equal((await inspectBackup(legacy)).appVersion, version);
    assert.equal((await validateBackup(validatorPath, legacy)).appVersion, version);
  }
  const copy = new Database(file, { readonly: true });
  assert.equal(
    (copy.prepare('SELECT SUM(duration_ms) AS n FROM focus_daily_credit').get() as { n: number }).n,
    60_000,
  );
  assert.equal(copy.pragma('journal_mode', { simple: true }), 'delete');
  copy.close();
  // Uma alteração posterior deve desaparecer no restore e continuar na cópia anterior.
  habits.command(
    {
      commandId: randomUUID(),
      expectedRevision: 2,
      action: 'edit',
      habitId,
      input: {
        name: 'Estado posterior',
        kind: 'time',
        frequency: { kind: 'daily' },
        targetMinutes: 1,
      },
    },
    now,
    'UTC',
  );
  assert.equal(
    (db.prepare('SELECT name FROM habits').get() as { name: string }).name,
    'Estado posterior',
  );
  const corrupt = join(dir, 'invalid.krono-backup');
  await writeFile(corrupt, 'not sqlite');
  await assert.rejects(() => inspectBackup(corrupt));
  assert.equal(await readFile(corrupt, 'utf8'), 'not sqlite');
  const invalid = async (name: string, mutate: (value: Database.Database) => void) => {
    const target = join(dir, `${name}.krono-backup`);
    await copyFile(file, target);
    const value = new Database(target);
    mutate(value);
    value.close();
    await assert.rejects(() => inspectBackup(target));
  };
  await invalid('future-schema', (value) => {
    value.pragma('user_version=99');
  });
  await invalid('future-format', (value) => {
    value.prepare('UPDATE backup_manifest SET format=99').run();
  });
  await invalid('foreign-product', (value) => {
    value.pragma('application_id=0');
  });
  await invalid('bad-json', (value) => {
    value.prepare("UPDATE focus_sessions SET payload='{}'").run();
  });
  await invalid('bad-credit', (value) => {
    value
      .prepare(
        "UPDATE focus_daily_credit SET local_date='2025-01-01' WHERE local_date='2026-01-01'",
      )
      .run();
  });
  await invalid('bad-fk', (value) => {
    value.pragma('foreign_keys=OFF');
    value.prepare('DELETE FROM habits').run();
  });
  await invalid('trigger', (value) => {
    value.exec(
      "CREATE TRIGGER reject_copy BEFORE DELETE ON habits BEGIN SELECT RAISE(ABORT,'unexpected'); END",
    );
  });
  await assert.rejects(() => restoreBackup(db, file, '0'.repeat(64), previous, now));
  const tampered = join(dir, 'tampered.krono-backup');
  await copyFile(file, tampered);
  const changed = new Database(tampered);
  changed.prepare('UPDATE backup_manifest SET created_utc=created_utc+1').run();
  changed.close();
  await assert.rejects(() => restoreBackup(db, tampered, summary.digest, previous, now));
  const blocked = join(dir, 'blocked-folder');
  await mkdir(blocked);
  await assert.rejects(() => restoreBackup(db, file, summary.digest, blocked, now));
  assert.equal(
    (db.prepare('SELECT name FROM habits').get() as { name: string }).name,
    'Estado posterior',
  );
  // Rollback após deletes/inserts iniciados, sem relaxar constraints.
  db.exec(
    "CREATE TRIGGER fail_restore BEFORE INSERT ON habits BEGIN SELECT RAISE(ABORT,'synthetic-write-failure'); END",
  );
  assert.throws(() => replaceFromBackup(db, file));
  assert.equal(
    (db.prepare('SELECT name FROM habits').get() as { name: string }).name,
    'Estado posterior',
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS n FROM focus_sessions').get() as { n: number }).n,
    1,
  );
  db.exec('DROP TRIGGER fail_restore');
  const lock = new Database(path);
  lock.exec('BEGIN IMMEDIATE');
  await assert.rejects(() =>
    restoreBackup(db, file, summary.digest, join(dir, 'busy-previous.krono-backup'), now),
  );
  lock.exec('ROLLBACK');
  lock.close();
  await restoreBackup(db, file, summary.digest, previous, now);
  assert.deepEqual(desktop.preferences().habitOrder, [habitId]);
  assert.deepEqual(desktop.preferences().garden, {
    version: 1,
    introductionSeen: true,
    enabled: false,
  });
  assert.deepEqual(timer.load().configuration, configuration);
  assert.equal(
    (db.prepare('SELECT name FROM habits').get() as { name: string }).name,
    'Dados do backup',
  );
  assert.equal(production.read({ days: 2 }, now, 'UTC').metrics.eligibleMs, 60_000);
  assert.equal(desktop.preferences().volume, 0.3);
  assert.deepEqual(desktop.preferences().introduction, { version: 1, step: 3, completed: false });
  assert.equal(desktop.preferences().globalShortcut, 'Control+Alt+K');
  desktop.recoverAlerts();
  assert.equal(desktop.pending().length, 0);
  assert.equal(desktop.alerts().alerts[0].notification, 'ambiguous');
  const old = new Database(previous, { readonly: true });
  assert.equal(
    (old.prepare('SELECT name FROM habits').get() as { name: string }).name,
    'Estado posterior',
  );
  old.close();
  await restoreBackup(
    db,
    previous,
    (await inspectBackup(previous)).digest,
    join(dir, 'undo-previous.krono-backup'),
    now,
  );
  assert.equal(
    (db.prepare('SELECT name FROM habits').get() as { name: string }).name,
    'Estado posterior',
  );
  // Backup em execução só conserva segmentos confirmados; retomada é explícita.
  const service = new TimerService(
    {
      load: async () => timer.load(),
      lookup: async (id) => timer.lookup(id),
      commit: async (value) => {
        timer.commit(value);
      },
    },
    { monotonic: () => 0, civil: () => now },
    'UTC',
    false,
  );
  await service.initialize();
  await service.command({
    commandId: randomUUID(),
    expectedRevision: service.read().revision,
    sessionId: null,
    action: 'start',
  });
  const running = join(dir, 'running.krono-backup');
  await createBackup(db, running, now);
  await assert.rejects(() =>
    restoreBackup(db, file, summary.digest, join(dir, 'active-previous.krono-backup'), now),
  );
  await service.command({
    commandId: randomUUID(),
    expectedRevision: service.read().revision,
    sessionId: service.read().sessionId,
    action: 'cancel',
  });
  service.dispose();
  await restoreBackup(
    db,
    running,
    (await inspectBackup(running)).digest,
    join(dir, 'running-previous.krono-backup'),
    now,
  );
  db.close();
  db = openDatabase(path);
  const reloaded = timerRepository(db);
  const resumed = new TimerService(
    {
      load: async () => reloaded.load(),
      lookup: async (id) => reloaded.lookup(id),
      commit: async (value) => {
        reloaded.commit(value);
      },
    },
    { monotonic: () => 100_000, civil: () => now + 86_400_000 },
    'UTC',
    false,
  );
  await resumed.initialize();
  assert.equal(resumed.read().state, 'recovering');
  assert.equal(resumed.read().elapsedMs, 0);
  resumed.dispose();
  db.close();
  // Worker distribuído: fence impede todo comando antigo após commit.
  const worker = await openStorage(
      resolve(process.env.KRONO_PACKAGED_WORKER ?? 'dist-electron/worker.cjs'),
      join(dir, 'backup-worker.sqlite'),
    ),
    client = workerTimerRepository(worker);
  try {
    const workerCopy = join(dir, 'worker-copy.krono-backup');
    await assert.rejects(() => client.request('backup:copy', {}));
    await client.request('backup:copy', { path: workerCopy, now });
    assert.equal((await validateBackup(validatorPath, workerCopy)).sessions, 0);
    await client.request('backup:restore', {
      path: file,
      digest: summary.digest,
      previousPath: join(dir, 'worker-previous.krono-backup'),
      now,
    });
    assert.deepEqual(await client.request('backup:status'), { restored: true });
    await assert.rejects(() => client.request('timer:load'));
    await assert.rejects(() => client.request('habits:command', {}));
  } finally {
    client.dispose();
    await worker.terminate();
  }
  // Crash no meio do núcleo transacional real, em entrada separada de testes.
  const crashPath = join(dir, 'crash-restore.sqlite');
  const crashDb = openDatabase(crashPath);
  crashDb.prepare('INSERT INTO timer_commands VALUES (?,?)').run('survive-crash', 'sentinel');
  crashDb.close();
  const crashWorker = new Worker(resolve('.test-data/restore-crash-worker.cjs'), {
    workerData: { path: crashPath, source: file },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      crashWorker.once('message', () => resolve());
      crashWorker.once('error', reject);
    });
  } finally {
    await crashWorker.terminate();
  }
  const afterCrash = openDatabase(crashPath);
  assert.equal(
    (
      afterCrash
        .prepare('SELECT fingerprint FROM timer_commands WHERE id=?')
        .get('survive-crash') as { fingerprint: string }
    ).fingerprint,
    'sentinel',
  );
  assert.equal(
    (afterCrash.prepare('SELECT COUNT(*) AS n FROM habits').get() as { n: number }).n,
    0,
  );
  assert.equal(afterCrash.pragma('integrity_check', { simple: true }), 'ok');
  afterCrash.close();
  // Completa a fixture SQL de escala com os segmentos que a consulta de métricas não exige.
  const scale = openDatabase(join(dir, 'production-100k.sqlite'));
  scale.exec('INSERT INTO focus_segments SELECT id,0,started_utc,active_ms FROM focus_sessions');
  const scaleFile = join(dir, 'scale.krono-backup'),
    scaleStart = performance.now();
  await writeBackup(scale, scaleFile, now);
  const snapshotMs = performance.now() - scaleStart;
  scale.close();
  const scaleSummary = await validateBackup(validatorPath, scaleFile);
  const exportAndValidationMs = performance.now() - scaleStart;
  assert.equal(scaleSummary.sessions, 100_001);
  assert.equal(scaleSummary.habits, 100);
  const target = join(dir, 'scale-restored.sqlite');
  const scaleWorker = await openStorage(
      resolve(process.env.KRONO_PACKAGED_WORKER ?? 'dist-electron/worker.cjs'),
      target,
    ),
    scaleClient = workerTimerRepository(scaleWorker);
  const restoreStart = performance.now();
  try {
    await scaleClient.request('backup:restore', {
      path: scaleFile,
      digest: scaleSummary.digest,
      previousPath: join(dir, 'scale-before.krono-backup'),
      now,
    });
  } finally {
    scaleClient.dispose();
    await scaleWorker.terminate();
  }
  const restoreAndValidationMs = performance.now() - restoreStart;
  const restoredScale = openDatabase(target);
  assert.equal(
    productionRepository(restoredScale).read(
      { days: 365, endDate: '2025-12-31' },
      Date.parse('2026-01-01T12:00:00Z'),
      'UTC',
    ).metrics.eligibleMs,
    4_800_001_000,
  );
  assert.equal(
    (restoredScale.prepare('SELECT COUNT(*) AS n FROM focus_segments').get() as { n: number }).n,
    100_001,
  );
  restoredScale.close();
  return {
    onlineBackup:
      'confirmed WAL; standalone DELETE journal; validated format 1/schema 5; separate readonly validator',
    roundtrip:
      'sessions/credits/habits/goals/preferences exact; previous backup restores the prior state',
    invalid: 'corrupt/future/product/JSON/credit/FK/trigger/hash rejected without replacement',
    failures: 'backup failure; SQLite busy; transaction rollback; worker killed inside transaction',
    restart: 'worker fenced; running snapshot recovers without offline credit',
    scale: {
      sessions: scaleSummary.sessions,
      habits: scaleSummary.habits,
      bytes: scaleSummary.bytes,
      snapshotMs,
      exportAndValidationMs,
      restoreAndValidationMs,
      measurement: 'local wall time; OS cache uncontrolled; no CPU/FPS claim',
    },
    integrity: 'ok',
  };
}
