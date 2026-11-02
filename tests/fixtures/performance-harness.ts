// Teste isolado: UI/IPC/SQLite reais; nenhum adaptador de bandeja/toast/áudio do host.
import { app, BrowserWindow, session } from 'electron';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { openStorage } from '../../electron/storage/client';
import { workerTimerRepository } from '../../electron/storage/timer-client';
import { workerDesktopRepository } from '../../electron/storage/desktop-client';
import { MiniMode } from '../../electron/desktop/MiniMode';
import { TimerService } from '../../electron/services/TimerService';
import { DesktopService } from '../../electron/desktop/DesktopService';
import { HabitService } from '../../electron/services/HabitService';
import { ProductionService } from '../../electron/services/ProductionService';
import { registerTimer } from '../../electron/ipc/timer';
import { registerDesktop } from '../../electron/ipc/desktop';
import { registerHabits } from '../../electron/ipc/habits';
import { registerProduction } from '../../electron/ipc/production';
import { registerFoundation } from '../../electron/ipc/foundation';
const profile = resolve(process.env.KRONO_PERFORMANCE_PROFILE ?? ''),
  location = relative(resolve('.test-data'), profile);
if (!location || location.startsWith('..') || isAbsolute(location)) throw new Error('FIXTURE_ONLY');
app.setPath('userData', profile);
void app.whenReady().then(async () => {
  const root = process.cwd(),
    start = performance.now();
  const worker = await openStorage(
      resolve('dist-electron/worker.cjs'),
      join(profile, 'data/krono.sqlite'),
    ),
    client = workerTimerRepository(worker),
    startupMs = performance.now() - start;
  const clock = {
    monotonic: () => performance.now(),
    civil: () => Date.UTC(2026, 0, 1, 12) + Math.floor(performance.now()),
  };
  const timer = new TimerService(client, clock, 'UTC', true);
  await timer.initialize();
  const desktop = new DesktopService(workerDesktopRepository(client.request), {
    notify: async () => 'requested',
    play: async () => 'finished',
  });
  await desktop.initialize();
  desktop.setTrayAvailable(true);
  if (!desktop.preferences().introduction)
    await desktop.update({
      expectedRevision: desktop.preferences().revision,
      patch: { introduction: { version: 1, step: 0, completed: true } },
    });
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    backgroundColor: '#0c0c0e',
    webPreferences: {
      preload: resolve('.test-data/performance/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  const prefix = pathToFileURL(resolve('dist')).href + '/';
  session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !details.url.startsWith(prefix) }),
  );
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const mini = new MiniMode(window);
  window.once('closed', () => mini.dispose());
  registerFoundation(window, () => 'ready');
  registerTimer(window, timer);
  registerDesktop(window, desktop);
  registerHabits(window, new HabitService(client.request, clock.civil, 'UTC'));
  registerProduction(window, new ProductionService(client.request, clock.civil, 'UTC'));
  Object.assign(globalThis, {
    performanceFixture: {
      startupMs,
      dataset: '100 habits / 100000 sessions / 365 dates',
      workerListeners: () => ({
        message: worker.listenerCount('message'),
        error: worker.listenerCount('error'),
        exit: worker.listenerCount('exit'),
      }),
    },
  });
  if (process.env.KRONO_PERFORMANCE_UNCONTROLLED === '1')
    window.once('ready-to-show', () => {
      void (async () => {
        // Processo novo sem Playwright/CDP: medir hide real, sem emulação de foco.
        window.showInactive();
        // Exercitar o cancelamento com ambiente realmente ligado, não só com fundo estático.
        await window.webContents.executeJavaScript(
          `localStorage.setItem('krono.appearance.v1',JSON.stringify({...JSON.parse(localStorage.getItem('krono.appearance.v1')||'{}'),reducedMotion:false,reducedEffects:false,ambient:true}));`,
        );
        await window.loadFile(join(root, 'dist/index.html'));
        await wait(2200);
        const beforeHide = await window.webContents.executeJavaScript(
          'document.getAnimations().filter(a => a.id === "mineral-light-ambient" && a.playState === "running").length',
        );
        if (beforeHide !== 2) throw new Error('AMBIENT_NOT_ACTIVE_BEFORE_HIDE');
        window.hide();
        await wait(2200);
        const visibility = (await window.webContents.executeJavaScript(
          '({ visibility: document.visibilityState, effectsVisible: document.querySelector(".clean-study").dataset.visible, animations: document.getAnimations().filter(a => a.playState === "running").length })',
        )) as { visibility: string; effectsVisible: string; animations: number };
        if (
          visibility.visibility !== 'hidden' ||
          visibility.effectsVisible !== 'false' ||
          visibility.animations
        )
          throw new Error('NATIVE_HIDE_NOT_OBSERVED');
        const sample = async () => {
          app.getAppMetrics();
          const values = [];
          for (let index = 0; index < 3; index++) {
            const started = performance.now(),
              cpu = process.cpuUsage();
            await wait(5000);
            const wallMs = performance.now() - started,
              delta = process.cpuUsage(cpu);
            values.push({
              wallMs,
              mainPercentOfOneCore: ((delta.user + delta.system) / (wallMs * 1000)) * 100,
              processes: app.getAppMetrics().map((item) => ({
                type: item.type,
                cpuPercent: item.cpu.percentCPUUsage,
                cpuValid: item.cpu.percentCPUUsage >= 0,
                memoryKB: item.memory.workingSetSize,
                privateKB: item.memory.privateBytes,
              })),
            });
          }
          return values;
        };
        const idle = await sample();
        let value = timer.read();
        await timer.command({
          commandId: randomUUID(),
          expectedRevision: value.revision,
          sessionId: value.sessionId,
          action: 'start',
        });
        const running = await sample();
        value = timer.read();
        if (value.state !== 'running' || value.elapsedMs < 15000)
          throw new Error('HIDDEN_TIMER_STOPPED');
        await timer.command({
          commandId: randomUUID(),
          expectedRevision: value.revision,
          sessionId: value.sessionId,
          action: 'cancel',
        });
        await writeFile(
          join(profile, 'hidden-report.json'),
          JSON.stringify({
            result: 'passed',
            beforeHide,
            visibility,
            idle,
            running,
            confirmedElapsedMs: value.elapsedMs,
            scope:
              'Separate Electron process without debugger; synthetic profile, no tray/audio/toast or installed app claim',
          }),
        );
        app.quit();
      })().catch(async (error) => {
        await writeFile(
          join(profile, 'hidden-report.json'),
          JSON.stringify({ result: 'failed', error: String(error) }),
        );
        app.exit(1);
      });
    });
  void window.loadFile(join(root, 'dist/index.html'));
  app.on('window-all-closed', () => app.quit());
  app.once('will-quit', () => {
    timer.dispose();
    desktop.dispose();
    client.dispose();
    void worker.terminate();
  });
});
