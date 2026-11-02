import { EventEmitter } from 'node:events';
import { it, expect, vi } from 'vitest';
import type { TimerService } from '../../electron/services/TimerService';
import type { DesktopService } from '../../electron/desktop/DesktopService';
const state = vi.hoisted(() => ({
  windows: [] as unknown[],
  unregistered: [] as string[],
  sequence: 0,
  imagePaths: [] as string[],
  trayPaths: [] as string[],
  failImage: false,
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    app: new EventEmitter(),
    powerMonitor: new EventEmitter(),
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
    nativeTheme: Object.assign(new EventEmitter(), {
      shouldUseDarkColorsForSystemIntegratedUI: true,
      shouldUseDarkColors: true,
      shouldUseHighContrastColors: false,
    }),
    Menu: { buildFromTemplate: (value: unknown) => value },
    nativeImage: {
      createFromPath: (path: string) => {
        state.imagePaths.push(path);
        return { isEmpty: () => state.failImage };
      },
    },
    Tray: class extends EventEmitter {
      constructor(path: string) {
        super();
        state.trayPaths.push(path);
      }
      destroyed = false;
      isDestroyed() {
        return this.destroyed;
      }
      destroy() {
        this.destroyed = true;
      }
      setToolTip() {}
      setContextMenu() {}
      setImage(path: string) {
        state.trayPaths.push(path);
      }
    },
  };
});
vi.mock('../../electron/lifecycle/window', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    createMainWindow: () => {
      const contents = Object.assign(new EventEmitter(), {
        isLoadingMainFrame: () => false,
        send: vi.fn(),
      });
      const window = Object.assign(new EventEmitter(), {
        destroyed: false,
        isDestroyed() {
          return this.destroyed;
        },
        isMinimized: () => false,
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        hide: vi.fn(),
        get webContents() {
          if (this.destroyed) throw new TypeError('Object has been destroyed');
          return contents;
        },
      });
      Object.defineProperty(window, 'webContents', {
        get() {
          if (window.destroyed) throw new TypeError('Object has been destroyed');
          return contents;
        },
      });
      state.windows.push(window);
      return window;
    },
  };
});
vi.mock('../../electron/ipc/foundation', () => ({
  registerFoundation: () => {
    const id = `foundation:${++state.sequence}`;
    return () => state.unregistered.push(id);
  },
}));
vi.mock('../../electron/ipc/timer', () => ({
  registerTimer: () => {
    const id = `timer:${++state.sequence}`;
    return () => state.unregistered.push(id);
  },
}));
vi.mock('../../electron/ipc/desktop', () => ({
  registerDesktop: () => {
    const id = `desktop:${++state.sequence}`;
    return () => state.unregistered.push(id);
  },
}));
vi.mock('../../electron/desktop/DesktopController', () => ({
  DesktopController: class {
    refresh() {}
    close() {
      return Promise.resolve();
    }
    quit() {
      return Promise.resolve();
    }
    suspend() {}
    resume() {}
    lock() {}
    dispose() {}
  },
}));
import { NativeShell } from '../../electron/desktop/NativeShell';
import { nativeTheme } from 'electron';
it('recriar janela não deixa closed antigo remover IPC ou referência da nova janela', () => {
  const desktop = {
    setTrayAvailable: vi.fn(),
    preferences: () => ({ globalShortcut: 'off' }),
  } as unknown as DesktopService;
  const shell = new NativeShell('synthetic', {} as TimerService, desktop, () => 'ready');
  const old = state.windows[0] as EventEmitter & { destroyed: boolean };
  old.destroyed = true;
  shell.show();
  expect(state.windows).toHaveLength(2);
  expect(state.unregistered).toHaveLength(3);
  old.emit('closed');
  shell.show();
  expect(state.windows).toHaveLength(2);
  expect(state.unregistered).toHaveLength(3);
  shell.dispose();
  shell.dispose();
  expect(state.unregistered).toHaveLength(6);
});
it('K da bandeja acompanha tema do sistema/contraste, remove listener e preserva janela se asset falha', () => {
  const desktop = {
    setTrayAvailable: vi.fn(),
    preferences: () => ({ globalShortcut: 'off' }),
  } as unknown as DesktopService;
  const before = nativeTheme.listenerCount('updated');
  const shell = new NativeShell('synthetic', {} as TimerService, desktop, () => 'ready');
  expect(state.trayPaths.at(-1)).toMatch(/tray-light\.ico$/);
  Object.assign(nativeTheme, { shouldUseDarkColorsForSystemIntegratedUI: false });
  nativeTheme.emit('updated');
  expect(state.trayPaths.at(-1)).toMatch(/tray-dark\.ico$/);
  Object.assign(nativeTheme, { shouldUseHighContrastColors: true, shouldUseDarkColors: true });
  nativeTheme.emit('updated');
  expect(state.trayPaths.at(-1)).toMatch(/tray-light\.ico$/);
  Object.assign(nativeTheme, { shouldUseDarkColors: false });
  nativeTheme.emit('updated');
  expect(state.trayPaths.at(-1)).toMatch(/tray-dark\.ico$/);
  state.failImage = true;
  nativeTheme.emit('updated');
  expect(desktop.setTrayAvailable).toHaveBeenLastCalledWith(false);
  expect((state.windows.at(-1) as { show: ReturnType<typeof vi.fn> }).show).toHaveBeenCalled();
  shell.dispose();
  expect(nativeTheme.listenerCount('updated')).toBe(before);
  state.failImage = false;
});
