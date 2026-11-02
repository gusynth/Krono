import { AutomaticBackup } from '../../electron/services/AutomaticBackup';
import { HistoryExport } from '../../electron/services/HistoryExport';
import { registerMaintenance } from '../../electron/ipc/maintenance';
import { ProductionService } from '../../electron/services/ProductionService';
import { registerProduction } from '../../electron/ipc/production';
import { registerBackup } from '../../electron/ipc/backup';
import { BackupService } from '../../electron/services/BackupService';
import { validateBackup } from '../../electron/storage/backup-client';
import { HabitService } from '../../electron/services/HabitService';
import { registerHabits } from '../../electron/ipc/habits';
import { DesktopService } from '../../electron/desktop/DesktopService';
import { DesktopController } from '../../electron/desktop/DesktopController';
import { ShellDialogs } from '../../electron/desktop/ShellDialogs';
import { MiniMode } from '../../electron/desktop/MiniMode';
import { ShortcutController } from '../../electron/desktop/ShortcutController';
import { registerShortcut } from '../../electron/ipc/shortcut';
import Database from 'better-sqlite3';
import { workerDesktopRepository } from '../../electron/storage/desktop-client';
import { registerDesktop } from '../../electron/ipc/desktop';
import { TimerService } from '../../electron/services/TimerService';
import { workerTimerRepository } from '../../electron/storage/timer-client';
import { registerTimer } from '../../electron/ipc/timer';
// Entrada separada de testes. Nunca empacotada no aplicativo.
import { app, BrowserWindow, ipcMain } from 'electron';
import { AudioPlayer } from '../../electron/desktop/AudioPlayer';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { writeFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { createMainWindow } from '../../electron/lifecycle/window';
import { openStorage } from '../../electron/storage/client';
import { ActiveTime } from '../../shared/domain/active-time';
import { registerFoundation } from '../../electron/ipc/foundation';

mkdirSync('.test-data', { recursive: true });
const requestedProfile = process.env.KRONO_TEST_PROFILE;
if (requestedProfile) {
  const path = resolve(requestedProfile),
    location = relative(resolve('.test-data'), path);
  if (!location || location.startsWith('..') || isAbsolute(location))
    throw new Error('TEST_PROFILE_OUTSIDE_FIXTURES');
  app.setPath('userData', path);
} else app.setPath('userData', mkdtempSync(resolve('.test-data/electron-')));
void app.whenReady().then(async () => {
  const root = process.cwd();
  const worker = await openStorage(
    join(root, 'dist-electron/worker.cjs'),
    join(app.getPath('userData'), 'synthetic.sqlite'),
  );
  const timerRepository = workerTimerRepository(worker);
  let timerMono = 0,
    timerCivil = Date.UTC(2026, 0, 1);
  let loseHabitAck = false;
  Object.assign(globalThis, {
    loseHabitAckOnce: () => {
      loseHabitAck = true;
    },
  });
  const habits = new HabitService(
    async (type, value) => {
      const reply = await timerRepository.request(type, value);
      if (loseHabitAck && type === 'habits:command') {
        loseHabitAck = false;
        throw new Error('SYNTHETIC_LOST_ACK');
      }
      return reply;
    },
    () => timerCivil,
    'UTC',
  );
  let timer = new TimerService(
    timerRepository,
    { monotonic: () => timerMono, civil: () => timerCivil },
    'UTC',
    false,
    undefined,
    () => habits.selected(),
  );
  await timer.initialize();
  // As in production, preferences initialize before the renderer can request them.
  const desktopRepository = workerDesktopRepository(timerRepository.request);
  // Falha real de escrita somente no banco UUID sintético desta fixture.
  Object.assign(globalThis, {
    setPreferenceWriteFailure: (enabled: boolean) => {
      const db = new Database(join(app.getPath('userData'), 'synthetic.sqlite'));
      try {
        db.exec(
          enabled
            ? "CREATE TRIGGER fail_preference_write BEFORE UPDATE ON desktop_preferences BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_PREFERENCE_WRITE_FAILURE'); END"
            : 'DROP TRIGGER IF EXISTS fail_preference_write',
        );
      } finally {
        db.close();
      }
    },
  });
  const desktopCalls = {
    customDialogs: false,
    notifications: 0,
    notificationResult: 'requested' as 'requested' | 'failed',
    sounds: 0,
    shown: 0,
    hidden: 0,
    exited: 0,
    informs: 0,
    healthy: true,
    choice: 'cancel' as 'hide' | 'quit' | 'cancel',
    menu: [] as import('../../electron/desktop/DesktopController').MenuEntry[],
  };
  const desktop = new DesktopService(desktopRepository, {
    notify: async () => {
      desktopCalls.notifications++;
      return desktopCalls.notificationResult;
    },
    play: async () => {
      desktopCalls.sounds++;
      return 'finished';
    },
    startup: () => {},
  });
  await desktop.initialize();
  if (process.env.KRONO_TEST_WELCOME !== '1' && !desktop.preferences().introduction)
    await desktop.update({
      expectedRevision: desktop.preferences().revision,
      patch: { introduction: { version: 1, step: 0, completed: true } },
    });
  const window = createMainWindow(root, false);
  const mini = new MiniMode(window);
  window.once('closed', () => mini.dispose());
  let storage: 'ready' | 'error' = 'ready';
  registerFoundation(window, () => storage);
  registerHabits(window, habits);
  let loseGoalAck = false,
    failDay = false;
  Object.assign(globalThis, {
    failNextDay: () => {
      failDay = true;
    },
  });
  Object.assign(globalThis, {
    loseGoalAckOnce: () => {
      loseGoalAck = true;
    },
  });
  const production = new ProductionService(
    async (type, value) => {
      if (type === 'production:day' && failDay) {
        failDay = false;
        throw new Error('SYNTHETIC_DAY_FAILURE');
      }
      const reply = await timerRepository.request(type, value);
      if (loseGoalAck && type === 'production:command') {
        loseGoalAck = false;
        throw new Error('SYNTHETIC_LOST_ACK');
      }
      return reply;
    },
    () => timerCivil,
    'UTC',
  );
  registerProduction(window, production);
  const backupDir = mkdtempSync(resolve('.test-data/backup-e2e-files-'));
  Object.assign(globalThis, {
    backupProfile: () => {
      const db = new Database(join(backupDir, 'synthetic.krono-backup'), { readonly: true });
      try {
        const row = db.prepare('SELECT payload FROM desktop_preferences WHERE id=1').get() as {
          payload: string;
        };
        return JSON.parse(row.payload).profile;
      } finally {
        db.close();
      }
    },
  });
  const backupTest = {
    destination: join(backupDir, 'synthetic.krono-backup') as string | null,
    source: join(backupDir, 'synthetic.krono-backup') as string | null,
    restarts: 0,
    loseAck: false,
    holdValidation: false,
    validating: false,
  };
  let releaseValidation = () => {};
  const backup = new BackupService(
    app.getPath('userData'),
    async (type, value) => {
      const result = await timerRepository.request(type, value);
      if (type === 'backup:restore' && backupTest.loseAck) {
        backupTest.loseAck = false;
        throw new Error('SYNTHETIC_LOST_ACK');
      }
      return result;
    },
    timer,
    {
      save: async () => backupTest.destination,
      choose: async () => backupTest.source,
      validate: async (path) => {
        const pending = validateBackup(join(root, 'dist-electron/backup-validator.cjs'), path);
        if (backupTest.holdValidation) {
          backupTest.validating = true;
          await new Promise<void>((resolve) => {
            releaseValidation = resolve;
          });
        }
        return pending;
      },
      restart: async () => {
        backupTest.restarts++;
      },
    },
    () => timerCivil,
  );
  registerBackup(window, backup);
  const automatic = new AutomaticBackup(
    app.getPath('userData'),
    (path, now) => timerRepository.request('backup:copy', { path, now }),
    (path) => validateBackup(join(root, 'dist-electron/backup-validator.cjs'), path),
  );
  const csvPath = join(backupDir, 'history.csv');
  const csv = new HistoryExport(production, app.getPath('userData'), async () => csvPath);
  registerMaintenance(window, {
    status: () => automatic.status(),
    openBackups: async () => {},
    exportCSV: () => csv.export(),
  });
  Object.assign(globalThis, {
    maintenanceCSV: () => csvPath,
    runAutomaticBackup: () => automatic.run(),
  });
  Object.assign(globalThis, {
    backupTest,
    releaseBackupValidation: () => releaseValidation(),
    corruptBackup: async () => {
      await writeFile(join(backupDir, 'corrupt.krono-backup'), 'synthetic invalid');
      backupTest.source = join(backupDir, 'corrupt.krono-backup');
    },
    backupPreviousFiles: () => readdir(join(app.getPath('userData'), 'backups')),
  });
  let unregisterTimer = registerTimer(window, timer);
  const dialogs = new ShellDialogs();
  const unregisterDialogs = dialogs.register(window);
  Object.assign(globalThis, {
    verifyDestroyedDialogCleanup: async () => {
      unregisterDialogs();
      const target = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      const contents = target.webContents,
        events = ['render-process-gone', 'unresponsive', 'did-start-loading'];
      const baseline = events.map((name) => contents.listenerCount(name));
      const probe = new ShellDialogs(),
        release = probe.register(target);
      const pending = probe.request(target, {
        kind: 'quit',
        canHide: true,
        running: false,
        storageError: false,
      });
      let error: string | null = null;
      target.once('closed', () => {
        try {
          release();
        } catch (value) {
          error = String(value);
          probe.cancel();
        }
      });
      target.destroy();
      return {
        error,
        choice: await pending,
        destroyed: target.isDestroyed(),
        listeners: events.map((name, index) => contents.listenerCount(name) - baseline[index]!),
      };
    },
  });
  desktop.setTrayAvailable(true);
  registerDesktop(window, desktop);
  const shortcutTest = {
    occupied: [] as string[],
    registered: new Map<string, () => void>(),
    reveal: 0,
  };
  const shortcuts = new ShortcutController(
    desktop,
    {
      register: (key, callback) => {
        if (shortcutTest.occupied.includes(key)) return false;
        shortcutTest.registered.set(key, callback);
        return true;
      },
      unregister: (key) => {
        shortcutTest.registered.delete(key);
      },
    },
    () => {
      shortcutTest.reveal++;
      window.showInactive();
    },
  );
  registerShortcut(window, shortcuts);
  window.once('closed', () => shortcuts.dispose());
  Object.assign(globalThis, { shortcutTest });
  const controllerPorts = {
    trayHealthy: () => desktopCalls.healthy,
    hide: () => {
      desktopCalls.hidden++;
      window.hide();
    },
    show: (focus: boolean) => {
      desktopCalls.shown++;
      if (focus) window.webContents.send('desktop:focus');
    },
    informHide: async () => {
      desktopCalls.informs++;
      return desktopCalls.customDialogs
        ? (await dialogs.request(window, {
            kind: 'hide',
            canHide: desktopCalls.healthy,
            running: timer.read().state === 'running',
            storageError: false,
          })) === 'hide'
        : true;
    },
    confirmQuit: async () =>
      desktopCalls.customDialogs
        ? dialogs.request(window, {
            kind: 'quit',
            canHide: desktopCalls.healthy,
            running: timer.read().state === 'running',
            storageError: timer.read().state === 'storage-error',
          })
        : desktopCalls.choice,
    exit: () => {
      desktopCalls.exited++;
    },
    menuChanged: (menu: import('../../electron/desktop/DesktopController').MenuEntry[]) => {
      desktopCalls.menu = menu;
    },
  };
  let controller = new DesktopController(timer, desktop, controllerPorts);
  Object.assign(globalThis, {
    desktopCalls,
    desktopService: desktop,
    desktopClose: () => controller.close(),
    desktopQuit: () => controller.quit(),
    desktopLock: () => controller.lock(),
    desktopSuspend: () => controller.suspend(),
    desktopResume: () => controller.resume(),
    desktopFlush: () => desktop.flush(),
    desktopMenu: (label: string) =>
      desktopCalls.menu.find((entry) => entry.label === label)?.click?.(),
  });

  Object.assign(globalThis, {
    verifyMutedAudioLifecycle: async () => {
      const player = new AudioPlayer(root),
        baseline = BrowserWindow.getAllWindows().length;
      const listeners = ipcMain.listenerCount('audio:result'),
        windows: number[] = [];
      try {
        for (let index = 0; index < 3; index++) {
          const before = new Set(BrowserWindow.getAllWindows().map((item) => item.id));
          const result = player.play(0.1);
          const audio = BrowserWindow.getAllWindows().find((item) => !before.has(item.id));
          if (!audio) throw new Error('AUDIO_WINDOW_MISSING');
          audio.webContents.setAudioMuted(true); // Só esta janela sintética; não muda o volume do host.
          if ((await result) !== 'finished') throw new Error('MUTED_AUDIO_DID_NOT_FINISH');
          windows.push(BrowserWindow.getAllWindows().length);
        }
      } finally {
        player.dispose();
      }
      return {
        baseline,
        windows,
        listenersReleased: ipcMain.listenerCount('audio:result') === listeners - 1,
      };
    },
    seedProductionSessions: async (count: number) => {
      for (let i = 0; i < count; i++) {
        const state = timer.read();
        await timer.command({
          commandId: crypto.randomUUID(),
          expectedRevision: state.revision,
          sessionId: state.sessionId,
          action: 'start',
          phase: 'focus',
          preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
        });
        timerMono += 1000;
        timerCivil += 1000;
        await timer.wake();
      }
    },
    seedGardenMinutes: async (minutes: number) => {
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 3000)
        throw new Error('INVALID_FIXTURE');
      while (minutes > 0) {
        const duration = Math.min(240, minutes) * 60_000,
          s = timer.read();
        const reply = await timer.command({
          commandId: crypto.randomUUID(),
          expectedRevision: s.revision,
          sessionId: s.sessionId,
          action: 'start',
          phase: 'focus',
          preset: { focusMs: duration, shortBreakMs: 60_000, longBreakMs: 60_000, longEvery: 4 },
        });
        if (reply.code !== 'ok') throw new Error('FIXTURE_START_REJECTED');
        for (let elapsed = 0; elapsed < duration; elapsed += 30_000) {
          timerMono += 30_000;
          timerCivil += 30_000;
          await timer.wake();
        }
        minutes -= duration / 60_000;
      }
    },
    advanceTimer: async (ms: number) => {
      timerMono += ms;
      timerCivil += ms;
      await timer.wake();
    },
    restartTimer: async () => {
      controller.dispose();
      timer.dispose();
      unregisterTimer();
      timerCivil += 86_400_000;
      timer = new TimerService(
        timerRepository,
        { monotonic: () => timerMono, civil: () => timerCivil },
        'UTC',
        false,
        undefined,
        () => habits.selected(),
      );
      await timer.initialize();
      unregisterTimer = registerTimer(window, timer);
      controller = new DesktopController(timer, desktop, controllerPorts);
      return timer.read();
    },
  });
  worker.on('exit', () => {
    storage = 'error';
    timer.storageLost();
  });
  worker.on('error', () => {
    storage = 'error';
    timer.storageLost();
  });
  (globalThis as unknown as { stopStorage: () => Promise<number> }).stopStorage = () =>
    worker.terminate();
  // Prova mínima: relógio no main continua com janela oculta e sem renderer como autoridade.
  const probe = new ActiveTime(
    { monotonic: () => performance.now(), civil: () => Date.now() },
    1200,
  );
  const generation = probe.start();
  setTimeout(() => {
    probe.wake(generation);
    (globalThis as unknown as { probeResult: unknown }).probeResult = probe.snapshot();
  }, 1500);
  app.on('window-all-closed', () => app.quit());
  app.once('will-quit', () => {
    controller.dispose();
    desktop.dispose();
    timer.dispose();
    timerRepository.dispose();
    void worker.terminate();
  });
});
