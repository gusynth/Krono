import { removeProductionSchema } from './legacy-fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { timerRepository } from '../../electron/storage/timer-repository';
import { desktopRepository } from '../../electron/storage/desktop-repository';
import { TimerService } from '../../electron/services/TimerService';
export async function verifyDesktopStorage(dir: string) {
  const path = join(dir, 'desktop.sqlite');
  let db = openDatabase(path);
  const timerRepo = timerRepository(db);
  let now = Date.UTC(2026, 0, 1);
  const timer = new TimerService(
    {
      load: async () => timerRepo.load(),
      lookup: async (id) => timerRepo.lookup(id),
      commit: async (value) => timerRepo.commit(value),
    },
    { monotonic: () => now, civil: () => now },
    'UTC',
    false,
  );
  await timer.initialize();
  const start = async () =>
    timer.command({
      commandId: randomUUID(),
      expectedRevision: timer.read().revision,
      sessionId: timer.read().sessionId,
      action: 'start',
      phase: 'focus',
      preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    });
  await start();
  now += 1000;
  await timer.wake();
  const first = timer.read().sessionId!;
  // Reconstitui somente o delta aditivo ausente de uma fixture schema 2, preservando sessão/crédito.
  removeProductionSchema(db);
  db.exec(
    'DROP TABLE habit_contributions; DROP TABLE habit_checks; DROP TABLE habit_versions; DROP TABLE habit_commands; DROP TABLE habit_state; DROP TABLE habits; DELETE FROM schema_migrations WHERE version=4; DROP TABLE desktop_alerts; DROP TABLE desktop_preferences; DROP INDEX focus_events_pending; DELETE FROM schema_migrations WHERE version = 3',
  );
  db.pragma('user_version = 2');
  db.close();
  db = openDatabase(path);
  assert.equal(db.pragma('user_version', { simple: true }), 5);
  let desktop = desktopRepository(db);
  desktop.recoverAlerts();
  assert.equal(desktop.alerts().alerts[0].sessionId, first);
  assert.equal(desktop.alerts().alerts[0].notification, 'ambiguous');
  assert.equal(desktop.pending().length, 0);
  assert.equal(
    (db.prepare('SELECT SUM(eligible_ms) AS total FROM focus_sessions').get() as { total: number })
      .total,
    1000,
  );
  const order = [randomUUID(), randomUUID()];
  const prefs = desktop.preferences();
  desktop.update({
    expectedRevision: prefs.revision,
    patch: {
      habitOrder: order,
      garden: { version: 1, introductionSeen: true, enabled: false },
      volume: 0.2,
      pauseOnLock: true,
      soundEnabled: false,
      introduction: { version: 1, step: 4, completed: true },
      globalShortcut: 'off',
    },
  });
  desktop.acknowledgeHide();
  assert.throws(() => desktop.update({ expectedRevision: 0, patch: { volume: 0.8 } }));
  assert.throws(() =>
    desktop.update({ expectedRevision: desktop.preferences().revision, patch: { volume: NaN } }),
  );
  assert.throws(() =>
    desktop.update({
      expectedRevision: desktop.preferences().revision,
      patch: { habitOrder: [order[0]!, order[0]!] },
    }),
  );
  assert.deepEqual(desktop.preferences().habitOrder, order);
  // Novo resultado real após bootstrap: claim único antes de qualquer efeito externo.
  const freshTimerRepo = timerRepository(db);
  const freshTimer = new TimerService(
    {
      load: async () => freshTimerRepo.load(),
      lookup: async (id) => freshTimerRepo.lookup(id),
      commit: async (value) => freshTimerRepo.commit(value),
    },
    { monotonic: () => now, civil: () => now },
    'UTC',
    false,
  );
  await freshTimer.initialize();
  await freshTimer.command({
    commandId: randomUUID(),
    expectedRevision: freshTimer.read().revision,
    sessionId: freshTimer.read().sessionId,
    action: 'start',
    phase: 'focus',
  });
  now += 1000;
  await freshTimer.wake();
  const second = freshTimer.read().sessionId!;
  assert.equal(desktop.pending().length, 1);
  assert.equal(desktop.claim(second), true);
  assert.equal(desktop.claim(second), false);
  assert.equal(desktop.pending().length, 0);
  // Falha real ao confirmar a entrega depois de claim; não muda a contabilidade.
  db.exec(
    "CREATE TRIGGER fail_delivery BEFORE UPDATE ON desktop_alerts BEGIN SELECT RAISE(ABORT, 'injected'); END",
  );
  assert.throws(() =>
    desktop.outcome({ sessionId: second, notification: 'shown', sound: 'finished' }),
  );
  db.exec('DROP TRIGGER fail_delivery');
  timer.dispose();
  freshTimer.dispose();
  db.close();
  db = openDatabase(path);
  desktop = desktopRepository(db);
  desktop.recoverAlerts();
  assert.equal(
    desktop.alerts().alerts.find((e) => e.sessionId === second)?.notification,
    'ambiguous',
  );
  assert.equal(desktop.pending().length, 0);
  assert.deepEqual(desktop.preferences().habitOrder, order);
  assert.equal(desktop.preferences().volume, 0.2);
  assert.equal(desktop.preferences().soundEnabled, false);
  assert.equal(desktop.preferences().firstHideSeen, true);
  assert.equal(desktop.preferences().pauseOnLock, true);
  desktop.dismiss(first);
  desktop.dismiss(second);
  assert.equal(desktop.alerts().unread, 0);
  assert.deepEqual(desktop.preferences().garden, {
    version: 1,
    introductionSeen: true,
    enabled: false,
  });
  assert.deepEqual(desktop.preferences().introduction, { version: 1, step: 4, completed: true });
  assert.equal(desktop.preferences().globalShortcut, 'off');
  assert.equal(
    (db.prepare('SELECT SUM(eligible_ms) AS total FROM focus_sessions').get() as { total: number })
      .total,
    2000,
  );
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  db.close();
  return {
    schema: '2->3 preserves sessions and credit',
    preferences: 'validated/CAS/persisted',
    alerts: 'unique claim; ambiguous crash; no replay; persistent dismissal',
    integrity: 'ok',
  };
}
