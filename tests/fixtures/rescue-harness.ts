// Entrada exclusiva de teste: perfil sintético; nenhum diálogo/bandeja/áudio do host.
import { app } from 'electron';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMainWindow } from '../../electron/lifecycle/window';
import { openDatabase } from '../../electron/storage/database';
import { createBackup } from '../../electron/storage/backup';
import { openStorage } from '../../electron/storage/client';
import { runRescue } from '../../electron/storage/rescue-client';
import { assertStoragePresent, markStorageInitialized } from '../../electron/storage/startup';
import { workerTimerRepository } from '../../electron/storage/timer-client';
import { workerDesktopRepository } from '../../electron/storage/desktop-client';
import { validateBackup } from '../../electron/storage/backup-client';
import type { TimerRepository } from '../../electron/storage/timer-repository';
import type { DesktopRepository } from '../../electron/storage/desktop-repository';
import { TimerService } from '../../electron/services/TimerService';
import { HabitService } from '../../electron/services/HabitService';
import { ProductionService } from '../../electron/services/ProductionService';
import { BackupService } from '../../electron/services/BackupService';
import { DesktopService } from '../../electron/desktop/DesktopService';
import { registerTimer } from '../../electron/ipc/timer';
import { registerFoundation } from '../../electron/ipc/foundation';
import { registerHabits } from '../../electron/ipc/habits';
import { registerProduction } from '../../electron/ipc/production';
import { registerBackup } from '../../electron/ipc/backup';
import { registerDesktop } from '../../electron/ipc/desktop';

const profile = resolve(process.env.KRONO_TEST_PROFILE ?? '');
const location = relative(resolve('.test-data'), profile);
if (!location || location.startsWith('..') || isAbsolute(location))
  throw new Error('TEST_PROFILE_OUTSIDE_FIXTURES');
app.setPath('userData', profile);
void app.whenReady().then(async () => {
  const workerPath = resolve('dist-electron/worker.cjs'),
    rescuePath = resolve('dist-electron/rescue-worker.cjs'),
    source = join(profile, 'reference.krono-backup');
  const raw = {
    'krono.sqlite': 'synthetic-broken-primary',
    'krono.sqlite-wal': 'synthetic-WAL',
    'krono.sqlite-shm': 'synthetic-SHM',
    'krono.sqlite-journal': 'synthetic-journal',
  };
  if (process.env.KRONO_TEST_SEED === '1') {
    const db = openDatabase(join(profile, 'reference.sqlite')),
      id = randomUUID();
    db.prepare('INSERT INTO habits VALUES(?,?,?,?,?)').run(
      id,
      'Hábito preservado',
      'action',
      'UTC',
      '2026-01-01',
    );
    db.prepare('INSERT INTO habit_versions VALUES(?,?,?)').run(
      id,
      '2026-01-01',
      JSON.stringify({
        date: '2026-01-01',
        active: true,
        frequency: { kind: 'daily' },
        targetMinutes: 1,
      }),
    );
    await createBackup(db, source, Date.UTC(2026, 0, 2));
    db.close();
    await mkdir(join(profile, 'data'));
    for (const [name, value] of Object.entries(raw))
      await writeFile(join(profile, 'data', name), value);
    await markStorageInitialized(profile);
  }
  const unavailable = async (): Promise<never> => {
    throw new Error('STORAGE_UNAVAILABLE');
  };
  let repository: TimerRepository = { load: unavailable, lookup: unavailable, commit: unavailable },
    request: (type: string, value?: unknown) => Promise<unknown> = unavailable;
  let desktopRepository: DesktopRepository = {
    preferences: unavailable,
    update: unavailable,
    acknowledgeHide: unavailable,
    recoverAlerts: unavailable,
    pending: unavailable,
    claim: unavailable,
    outcome: unavailable,
    alerts: unavailable,
    dismiss: unavailable,
  };
  let storage: 'ready' | 'error' = 'error',
    stop = async () => {};
  try {
    await runRescue(rescuePath, { action: 'resume', root: profile });
    await assertStoragePresent(profile);
    const worker = await openStorage(workerPath, join(profile, 'data/krono.sqlite')),
      client = workerTimerRepository(worker);
    repository = client;
    request = client.request;
    desktopRepository = workerDesktopRepository(request);
    storage = 'ready';
    stop = async () => {
      client.dispose();
      await worker.terminate();
    };
    app.once('will-quit', () => {
      void stop();
    });
  } catch {
    /* A falha é apresentada pela UI e não cria uma base vazia. */
  }
  const timer = new TimerService(
    repository,
    { monotonic: () => 0, civil: () => Date.UTC(2026, 0, 2, 12) },
    'UTC',
    false,
  );
  await timer.initialize();
  const desktop = new DesktopService(desktopRepository, {
    notify: async () => 'requested',
    play: async () => 'finished',
  });
  await desktop.initialize();
  const state = { source: source as string | null, restarts: 0 };
  const backup = new BackupService(profile, request, timer, {
    save: async () => null,
    choose: async () => state.source,
    validate: (path) => validateBackup(resolve('dist-electron/backup-validator.cjs'), path),
    canRescue: () => timer.read().state === 'storage-error',
    rescue: async (path, digest) => {
      await stop();
      const result = await runRescue(rescuePath, {
        action: 'rescue',
        root: profile,
        source: path,
        digest,
        now: Date.now(),
      });
      if (result.state !== 'restored') throw new Error('RESCUE_FAILED');
      return 'restored';
    },
    restart: async () => {
      state.restarts++;
    },
  });
  await backup.cleanStaging();
  const window = createMainWindow(process.cwd(), false);
  registerFoundation(window, () => storage);
  registerTimer(window, timer);
  registerDesktop(window, desktop);
  registerBackup(window, backup);
  registerHabits(window, new HabitService(request, () => Date.UTC(2026, 0, 2, 12), 'UTC'));
  registerProduction(window, new ProductionService(request));
  Object.assign(globalThis, {
    rescueTest: state,
    verifyOriginal: async (archived: boolean) => {
      const base = archived
        ? join(
            profile,
            'rescue',
            (await readdir(join(profile, 'rescue'))).find((name) => name !== 'pending.json')!,
            'original-data',
          )
        : join(profile, 'data');
      for (const [name, value] of Object.entries(raw))
        if ((await readFile(join(base, name), 'utf8')) !== value) return false;
      return true;
    },
    invalidBackup: async () => {
      const path = join(profile, 'invalid.krono-backup');
      await writeFile(path, 'invalid synthetic');
      state.source = path;
    },
    validBackup: () => {
      state.source = source;
    },
  });
  app.on('window-all-closed', () => app.quit());
  app.once('will-quit', () => {
    timer.dispose();
    desktop.dispose();
  });
});
