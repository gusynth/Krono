// Harness externo ao produto. Executar SOMENTE no Windows Sandbox criado para Krono.
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openStorage } from '../../electron/storage/client';
import { workerTimerRepository } from '../../electron/storage/timer-client';
import { workerDesktopRepository } from '../../electron/storage/desktop-client';
import { TimerService } from '../../electron/services/TimerService';
import { DesktopService } from '../../electron/desktop/DesktopService';
import { AudioPlayer } from '../../electron/desktop/AudioPlayer';
import { NativeNotifier } from '../../electron/desktop/NativeNotifier';
import { NativeShell } from '../../electron/desktop/NativeShell';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const output = 'C:/KronoEvidence';
if (!existsSync('C:/KronoValidation/sandbox-only.marker') || !existsSync(output))
  throw new Error('VM_ONLY_GUARD');
app.setName('KronoSandboxTest');
app.setPath('userData', 'C:/KronoValidation/profile');
app.setAppUserModelId('com.krono.desktop');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else
  void app.whenReady().then(async () => {
    const root = 'C:/KronoSource';
    mkdirSync('C:/KronoValidation/profile', { recursive: true });
    const worker = await openStorage(
      join(root, 'dist-electron/worker.cjs'),
      'C:/KronoValidation/profile/native.sqlite',
    );
    const client = workerTimerRepository(worker),
      repo = workerDesktopRepository(client.request);
    const timer = new TimerService(
      client,
      { monotonic: () => performance.now(), civil: () => Date.now() },
      'UTC',
    );
    await timer.initialize();
    const audio = new AudioPlayer(root);
    let reveal = () => {};
    const notifier = new NativeNotifier(() => reveal());
    const desktop = new DesktopService(repo, {
      notify: (phase) => notifier.notify(phase),
      play: (volume) => audio.play(volume),
    });
    await desktop.initialize();
    await desktop.update({
      expectedRevision: desktop.preferences().revision,
      patch: { soundEnabled: false, notificationsEnabled: true },
    });
    await desktop.acknowledgeHide();
    const shell = new NativeShell(root, timer, desktop, () => 'ready');
    reveal = () => shell.show(true);
    try {
      assert.equal(desktop.read().trayAvailable, true);
      const window = BrowserWindow.getAllWindows()[0];
      await new Promise<void>((resolve) => {
        if (!window.webContents.isLoading()) resolve();
        else window.webContents.once('did-finish-load', () => resolve());
      });
      await timer.command({
        commandId: randomUUID(),
        expectedRevision: timer.read().revision,
        sessionId: null,
        action: 'start',
        preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
      });
      const id = timer.read().sessionId;
      await shell.controller.close();
      assert.equal(window.isVisible(), false);
      assert.equal(timer.read().sessionId, id);
      shell.show(true);
      assert.equal(window.isVisible(), true);
      await new Promise<void>((resolve, reject) => {
        if (timer.read().state === 'awaiting-next') {
          resolve();
          return;
        }
        const timeout = setTimeout(() => reject(new Error('VM_DEADLINE')), 8000);
        const unsubscribe = timer.subscribe((value) => {
          if (value.state === 'awaiting-next') {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          }
        });
      });
      await desktop.flush();
      const report = {
        result: 'passed',
        environment: 'Windows Sandbox isolado',
        tray: 'native created; hide/show via real BrowserWindow',
        timer: 'same session; real scheduler',
        alert: desktop.read().alerts,
        audible: 'not tested',
        installedToastClick: 'not tested; unpackaged smoke only',
        physicalEnergy: 'not tested',
        runtime: process.versions,
      };
      writeFileSync(join(output, 'native-smoke.json'), JSON.stringify(report, null, 2));
    } catch (error) {
      writeFileSync(
        join(output, 'native-smoke.json'),
        JSON.stringify({ result: 'failed', error: String(error) }),
      );
    } finally {
      shell.dispose();
      desktop.dispose();
      notifier.dispose();
      audio.dispose();
      timer.dispose();
      client.dispose();
      await worker.terminate();
      app.exit(0);
    }
  });
