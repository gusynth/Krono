import { AutomaticBackup } from './services/AutomaticBackup';
import { HistoryExport } from './services/HistoryExport';
import { RoutineScheduler } from './desktop/RoutineScheduler';
import { ProductionService } from './services/ProductionService';
import { BackupService } from './services/BackupService';
import { validateBackup } from './storage/backup-client';
import { runRescue } from './storage/rescue-client';
import { assertStoragePresent, markStorageInitialized } from './storage/startup';
import { HabitService } from './services/HabitService';
import { app, dialog, Menu, shell as osShell } from 'electron';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openStorage } from './storage/client';
import { workerTimerRepository } from './storage/timer-client';
import { workerDesktopRepository } from './storage/desktop-client';
import { TimerService } from './services/TimerService';
import { DesktopService } from './desktop/DesktopService';
import { AudioPlayer } from './desktop/AudioPlayer';
import { NativeNotifier } from './desktop/NativeNotifier';
import { NativeShell } from './desktop/NativeShell';
import { resolveIconPath } from './lifecycle/taskbar';
import type { TimerRepository } from './storage/timer-repository';
import type { DesktopRepository } from './storage/desktop-repository';

app.setName('Krono');
app.setAppUserModelId(app.isPackaged ? 'com.krono.desktop' : 'com.krono.desktop.dev');
if (!app.isPackaged) app.setPath('userData', join(app.getAppPath(), '.test-data/development'));
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const root = app.getAppPath();
    let storage: 'ready' | 'error' = 'error';
    let failTimer = () => {};
    const unavailable = async (): Promise<never> => {
      throw new Error('STORAGE_UNAVAILABLE');
    };
    let habitRequest: (type: string, value?: unknown) => Promise<unknown> = unavailable;
    let closeStorage = async () => {};
    let stopStorage = async () => {};
    let rescueAllowed = true;
    let repository: TimerRepository = {
      load: unavailable,
      commit: unavailable,
      lookup: unavailable,
    };
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
    try {
      await mkdir(app.getPath('userData'), { recursive: true });
      await runRescue(join(root, 'dist-electron/rescue-worker.cjs'), {
        action: 'resume',
        root: app.getPath('userData'),
      });
      await assertStoragePresent(app.getPath('userData'));
      const dataPath = join(app.getPath('userData'), 'data');
      await mkdir(dataPath, { recursive: true });
      const worker = await openStorage(
        join(root, 'dist-electron/worker.cjs'),
        join(dataPath, 'krono.sqlite'),
      );
      try {
        await markStorageInitialized(app.getPath('userData'));
      } catch (error) {
        try {
          await worker.terminate();
        } catch {
          throw new Error('STORAGE_STOP_FAILED');
        }
        throw error;
      }
      const client = workerTimerRepository(worker);
      repository = client;
      habitRequest = client.request;
      desktopRepository = workerDesktopRepository(client.request);
      closeStorage = async () => {
        await client.request('close');
        client.dispose();
        await worker.terminate();
      };
      stopStorage = async () => {
        storage = 'error';
        client.dispose();
        await worker.terminate();
        closeStorage = async () => {};
      };
      storage = 'ready';
      worker.on('error', () => {
        storage = 'error';
        failTimer();
      });
      worker.on('exit', () => {
        storage = 'error';
        failTimer();
      });
      app.once('will-quit', () => {
        client.dispose();
        void worker.terminate();
      });
    } catch (error) {
      storage = 'error';
      if (
        error instanceof Error &&
        ['STORAGE_STOP_FAILED', 'RESCUE_STOP_FAILED'].includes(error.message)
      )
        rescueAllowed = false;
    }
    const habits = new HabitService(habitRequest);
    const production = new ProductionService(habitRequest);
    const timer = new TimerService(
      repository,
      { monotonic: () => performance.now(), civil: () => Date.now() },
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      true,
      undefined,
      () => habits.selected(),
    );
    failTimer = () => timer.storageLost();
    await timer.initialize();
    const audio = new AudioPlayer(root);
    const notifier = new NativeNotifier(
      () => shell.show(true),
      resolveIconPath(root, app.isPackaged),
    );
    const desktop = new DesktopService(desktopRepository, {
      notify: (phase) => notifier.notify(phase),
      play: (volume) => audio.play(volume),
      startup: (enabled) => {
        if (!app.isPackaged) throw new Error('STARTUP_REQUIRES_INSTALLED_APP');
        app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [] });
        if (app.getLoginItemSettings({ path: process.execPath, args: [] }).openAtLogin !== enabled)
          throw new Error('STARTUP_NOT_CONFIRMED');
      },
    });
    await desktop.initialize();
    const backup = new BackupService(app.getPath('userData'), habitRequest, timer, {
      canRescue: () => rescueAllowed && timer.read().state === 'storage-error',
      rescue: async (source, digest) => {
        await stopStorage();
        desktop.dispose();
        try {
          const value = await runRescue(join(root, 'dist-electron/rescue-worker.cjs'), {
            action: 'rescue',
            root: app.getPath('userData'),
            source,
            digest,
            now: Date.now(),
          });
          if (value.state !== 'restored') throw new Error('RESCUE_FAILED');
          return 'restored';
        } catch (error) {
          if (error instanceof Error && error.message === 'RESCUE_STOP_FAILED') return 'uncertain';
          let value;
          try {
            value = await runRescue(join(root, 'dist-electron/rescue-worker.cjs'), {
              action: 'resume',
              root: app.getPath('userData'),
            });
          } catch {
            return 'uncertain';
          }
          if (value.state === 'restored') return 'restored';
          throw error;
        }
      },
      validate: (path) => validateBackup(join(root, 'dist-electron/backup-validator.cjs'), path),
      save: async () => {
        const result = await dialog.showSaveDialog({
          title: 'Salvar backup do Krono',
          defaultPath: `Krono-${new Date().toISOString().slice(0, 10)}.krono-backup`,
          filters: [{ name: 'Backup do Krono', extensions: ['krono-backup'] }],
          properties: ['showOverwriteConfirmation'],
        });
        return result.canceled ? null : (result.filePath ?? null);
      },
      choose: async () => {
        const result = await dialog.showOpenDialog({
          title: 'Selecionar backup do Krono',
          defaultPath: join(app.getPath('userData'), 'backups'),
          filters: [{ name: 'Backup do Krono', extensions: ['krono-backup'] }],
          properties: ['openFile'],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      restart: async () => {
        shell.dispose();
        desktop.dispose();
        notifier.dispose();
        audio.dispose();
        timer.dispose();
        await closeStorage().catch(() => undefined);
        try {
          app.relaunch();
        } finally {
          app.exit(0);
        }
      },
    });
    await backup.cleanStaging().catch(() => undefined);
    const automatic = new AutomaticBackup(
      app.getPath('userData'),
      (path, now) => habitRequest('backup:copy', { path, now }),
      (path) => validateBackup(join(root, 'dist-electron/backup-validator.cjs'), path),
    );
    const historyExport = new HistoryExport(production, app.getPath('userData'), async () => {
      const chosen = await dialog.showSaveDialog({
        title: 'Exportar histórico dos últimos 365 dias',
        defaultPath: 'Krono-historico.csv',
        filters: [{ name: 'Histórico CSV', extensions: ['csv'] }],
        properties: ['showOverwriteConfirmation'],
      });
      return chosen.canceled ? null : (chosen.filePath ?? null);
    });
    const shell = new NativeShell(root, timer, desktop, () => storage, habits, production, backup, {
      status: () => automatic.status(),
      openBackups: async () => {
        const error = await osShell.openPath(await automatic.directory());
        if (error) throw new Error('OPEN_BACKUPS_FAILED');
      },
      exportCSV: () => historyExport.export(),
    });
    const routines = new RoutineScheduler(
      async () => {
        if (storage === 'ready' && timer.read().state !== 'running') await automatic.run();
      },
      async () => {
        if (!desktop.preferences().notificationsEnabled) return;
        try {
          const state = await habits.read();
          if (state.habits.some((h) => !h.archived && h.today.status === 'pending'))
            await notifier.notify('focus', true);
        } catch {
          /* Sem aviso quando dados indisponíveis. */
        }
      },
    );
    let routineKey = '';
    const applyRoutines = () => {
      const p = desktop.preferences(),
        key = JSON.stringify([p.autoBackup, p.habitReminder]);
      if (key !== routineKey) {
        routineKey = key;
        routines.update(p);
      }
    };
    const offRoutine = desktop.subscribe(applyRoutines);
    applyRoutines();
    let lastTimerState = timer.read().state;
    const offTaskbar = timer.subscribe((value) => {
      const window = shell.mainWindowForProgress();
      if (window && !window.isDestroyed())
        window.setProgressBar(
          value.state === 'running' && value.durationMs
            ? Math.min(1, value.elapsedMs / value.durationMs)
            : -1,
        );
      if (
        lastTimerState === 'running' &&
        value.state !== 'running' &&
        desktop.preferences().autoBackup &&
        storage === 'ready'
      )
        void automatic.run();
      lastTimerState = value.state;
    });
    app.once('will-quit', () => {
      routines.dispose();
      offRoutine();
      offTaskbar();
    });
    app.once('will-quit', () => {
      shell.dispose();
      desktop.dispose();
      notifier.dispose();
      audio.dispose();
      timer.dispose();
    });
  });
