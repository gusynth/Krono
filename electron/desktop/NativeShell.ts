import { registerMaintenance, type MaintenancePorts } from '../ipc/maintenance';
import { registerProduction } from '../ipc/production';
import { registerBackup } from '../ipc/backup';
import type { BackupService } from '../services/BackupService';
import type { ProductionService } from '../services/ProductionService';
import { registerHabits } from '../ipc/habits';
import type { HabitService } from '../services/HabitService';
import {
  app,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  powerMonitor,
  globalShortcut,
  type BrowserWindow,
} from 'electron';
import { ShortcutController } from './ShortcutController';
import { registerShortcut } from '../ipc/shortcut';
import { ShellDialogs } from './ShellDialogs';
import { MiniMode } from './MiniMode';
import { join } from 'node:path';
import { createMainWindow } from '../lifecycle/window';
import { registerFoundation } from '../ipc/foundation';
import { registerTimer } from '../ipc/timer';
import { registerDesktop } from '../ipc/desktop';
import { DesktopController, type MenuEntry } from './DesktopController';
import type { DesktopService } from './DesktopService';
import type { TimerService } from '../services/TimerService';

export class NativeShell {
  private window: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private exiting = false;
  private unregister = () => {};
  private dialogs = new ShellDialogs();
  private mini: MiniMode | null = null;
  private shortcuts: ShortcutController;
  readonly controller: DesktopController;
  constructor(
    private root: string,
    private timer: TimerService,
    private desktop: DesktopService,
    private storage: () => 'ready' | 'error',
    private habits?: HabitService,
    private production?: ProductionService,
    private backup?: BackupService,
    private maintenance?: MaintenancePorts,
  ) {
    this.shortcuts = new ShortcutController(
      desktop,
      {
        register: (key, callback) => globalShortcut.register(key, callback),
        unregister: (key) => globalShortcut.unregister(key),
      },
      () => this.show(),
    );
    this.controller = new DesktopController(timer, desktop, {
      trayHealthy: () => this.healthy(),
      hide: () => this.window?.hide(),
      show: (focus) => this.show(focus),
      informHide: async () => {
        this.show();
        return (
          (await this.dialogs.request(this.ensureWindow(), {
            kind: 'hide',
            canHide: this.healthy(),
            running: this.timer.read().state === 'running',
            storageError: this.timer.read().state === 'storage-error',
          })) === 'hide'
        );
      },
      confirmQuit: async (canHide) => {
        return this.dialogs.request(this.ensureWindow(), {
          kind: 'quit',
          canHide,
          running: this.timer.read().state === 'running',
          storageError: this.timer.read().state === 'storage-error',
        });
      },
      exit: () => {
        this.exiting = true;
        app.quit();
      },
      menuChanged: (menu) => this.updateMenu(menu),
    });
    try {
      const path = this.trayIconPath();
      const image = nativeImage.createFromPath(path);
      if (image.isEmpty()) throw new Error('TRAY_IMAGE_UNAVAILABLE');
      this.tray = new Tray(path);
      this.tray.setToolTip('Krono · Temporizador');
      this.tray.on('click', () => this.show());
      this.tray.on('double-click', () => this.show());
      this.tray.on('right-click', () => this.controller.refresh());
      this.desktop.setTrayAvailable(true);
      this.controller.refresh();
    } catch {
      this.tray?.destroy();
      this.tray = null;
      this.desktop.setTrayAvailable(false);
    }
    this.ensureWindow();
    nativeTheme.on('updated', this.onThemeChanged);
    powerMonitor.on('suspend', this.onSuspend);
    powerMonitor.on('resume', this.onResume);
    powerMonitor.on('lock-screen', this.onLock);
    app.on('second-instance', this.onSecondInstance);
    app.on('before-quit', this.onBeforeQuit);
    app.on('window-all-closed', this.onAllClosed);
  }
  private healthy() {
    return this.tray !== null && !this.tray.isDestroyed();
  }
  private trayIconPath() {
    const dark = nativeTheme.shouldUseHighContrastColors
      ? nativeTheme.shouldUseDarkColors
      : nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
    return join(this.root, `dist-electron/assets/tray-${dark ? 'light' : 'dark'}.ico`);
  }
  private onThemeChanged = () => {
    if (!this.healthy()) return;
    try {
      const path = this.trayIconPath();
      if (nativeImage.createFromPath(path).isEmpty()) throw new Error('TRAY_IMAGE_UNAVAILABLE');
      this.tray!.setImage(path);
    } catch {
      this.tray?.destroy();
      this.tray = null;
      this.desktop.setTrayAvailable(false);
      this.show();
    }
  };
  private updateMenu(menu: MenuEntry[]) {
    if (!this.healthy()) return;
    try {
      this.tray!.setContextMenu(Menu.buildFromTemplate(menu));
    } catch {
      this.tray?.destroy();
      this.tray = null;
      this.desktop.setTrayAvailable(false);
      this.window?.show();
    }
  }
  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;
    this.unregister();
    const window = createMainWindow(this.root);
    this.window = window;
    const mini = new MiniMode(window);
    this.mini = mini;
    const foundation = registerFoundation(window, this.storage),
      timer = registerTimer(window, this.timer),
      desktop = registerDesktop(window, this.desktop);
    const habits = this.habits ? registerHabits(window, this.habits) : () => {};
    const production = this.production ? registerProduction(window, this.production) : () => {};
    const maintenance = this.maintenance ? registerMaintenance(window, this.maintenance) : () => {};
    const backup = this.backup ? registerBackup(window, this.backup) : () => {};
    const dialogs = this.dialogs.register(window);
    const shortcut = registerShortcut(window, this.shortcuts);
    let unregistered = false;
    const unregister = () => {
      if (unregistered) return;
      unregistered = true;
      shortcut();
      mini.dispose();
      maintenance();
      dialogs();
      foundation();
      timer();
      desktop();
      habits();
      production();
      backup();
    };
    this.unregister = unregister;
    window.on('close', (event) => {
      if (!this.exiting) {
        event.preventDefault();
        void this.controller.close().catch(() => this.show());
      }
    });
    window.once('closed', () => {
      unregister();
      if (this.window === window) {
        this.unregister = () => {};
        this.window = null;
      }
    });
    window.on('session-end', () => {
      void this.controller.quit(true);
    });
    return window;
  }
  mainWindowForProgress() {
    return this.window;
  }
  show(focus = false) {
    if (focus) this.mini?.leave();
    const window = this.ensureWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    if (focus) {
      const reveal = () => {
        if (!window.isDestroyed()) window.webContents.send('desktop:focus');
      };
      if (window.webContents.isLoadingMainFrame())
        window.webContents.once('did-finish-load', reveal);
      else reveal();
    }
  }
  private onSuspend = () => {
    void this.controller.suspend();
  };
  private onResume = () => this.controller.resume();
  private onLock = () => {
    void this.controller.lock();
  };
  private onSecondInstance = () => this.show(true);
  private onBeforeQuit = (event: Electron.Event) => {
    if (!this.exiting) {
      event.preventDefault();
      void this.controller.quit(true);
    }
  };
  private onAllClosed = () => {
    if (!this.healthy()) void this.controller.quit(true);
  };
  dispose() {
    this.exiting = true;
    this.shortcuts.dispose();
    this.controller.dispose();
    this.unregister();
    this.tray?.destroy();
    this.tray = null;
    nativeTheme.off('updated', this.onThemeChanged);
    powerMonitor.off('suspend', this.onSuspend);
    powerMonitor.off('resume', this.onResume);
    powerMonitor.off('lock-screen', this.onLock);
    app.off('second-instance', this.onSecondInstance);
    app.off('before-quit', this.onBeforeQuit);
    app.off('window-all-closed', this.onAllClosed);
  }
}
