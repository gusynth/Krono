import { EventEmitter } from 'node:events';
import { it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, value: unknown) => unknown>(),
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    app: { isPackaged: false },
    nativeImage: { createFromPath: vi.fn(() => ({})) },
    ipcMain: {
      handle: (name: string, handler: (event: unknown, value: unknown) => unknown) => {
        if (state.handlers.has(name)) throw Error('DUPLICATE_HANDLER');
        state.handlers.set(name, handler);
      },
      removeHandler: (name: string) => state.handlers.delete(name),
    },
    nativeTheme: Object.assign(new EventEmitter(), {
      shouldUseHighContrastColors: false,
      shouldUseDarkColors: true,
    }),
    session: {
      defaultSession: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        webRequest: { onBeforeRequest: vi.fn() },
      },
    },
    BrowserWindow: class extends EventEmitter {
      webContents = Object.assign(new EventEmitter(), {
        mainFrame: {},
        send: vi.fn(),
        isDestroyed: () => false,
        setWindowOpenHandler: vi.fn(),
      });
      isDestroyed() {
        return false;
      }
      setAppDetails = vi.fn();
      setIcon = vi.fn();
      setBackgroundColor = vi.fn();
      loadURL = vi.fn();
      show = vi.fn();
      minimize = vi.fn();
      maximize = vi.fn();
      unmaximize = vi.fn();
      close = vi.fn();
      isFullScreen() {
        return false;
      }
      isMaximized() {
        return false;
      }
    },
  };
});
import { createMainWindow } from '../../electron/lifecycle/window';
import { nativeTheme } from 'electron';

it('tema valida remetente/enum e closed antigo não remove o canal da janela nova', () => {
  const before = nativeTheme.listenerCount('updated'),
    old = createMainWindow('synthetic', false),
    current = createMainWindow('synthetic', false);
  (old as unknown as EventEmitter).emit('closed');
  expect(state.handlers.has('window:theme')).toBe(true);
  expect(state.handlers.has('window:control')).toBe(true);
  const apply = state.handlers.get('window:theme')!;
  const sender = { sender: current.webContents, senderFrame: current.webContents.mainFrame };
  expect(() =>
    apply({ sender: old.webContents, senderFrame: old.webContents.mainFrame }, 'aero'),
  ).toThrow('Origem recusada');
  expect(() => apply({ ...sender, senderFrame: {} }, 'aero')).toThrow('Origem recusada');
  expect(() => apply(sender, 'external-script')).toThrow();
  apply(sender, 'aero');
  expect(current.setBackgroundColor).toHaveBeenLastCalledWith('#10232b');
  const control = state.handlers.get('window:control')!;
  expect(() =>
    control({ sender: old.webContents, senderFrame: old.webContents.mainFrame }, 'minimize'),
  ).toThrow('Origem recusada');
  control(sender, 'minimize');
  expect(current.minimize).toHaveBeenCalled();
  control(sender, 'maximize');
  expect(current.maximize).toHaveBeenCalled();
  control(sender, 'close');
  expect(current.close).toHaveBeenCalled();
  expect(control(sender, 'state')).toEqual({ maximized: false, fullscreen: false });
  (current as unknown as EventEmitter).emit('closed');
  expect(state.handlers.has('window:theme')).toBe(false);
  expect(state.handlers.has('window:control')).toBe(false);
  expect(nativeTheme.listenerCount('updated')).toBe(before);
});
