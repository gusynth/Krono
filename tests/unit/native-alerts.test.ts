import { EventEmitter } from 'node:events';
import { it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  windows: [] as unknown[],
  notifications: [] as unknown[],
  supported: true,
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      destroyed = false;
      options: unknown;
      webContents = {
        mainFrame: {},
        send: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
        session: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
          webRequest: { onBeforeRequest: vi.fn() },
        },
      };
      constructor(options: unknown) {
        super();
        this.options = options;
        state.windows.push(this);
      }
      isDestroyed() {
        return this.destroyed;
      }
      loadFile() {
        return Promise.resolve();
      }
      destroy() {
        this.destroyed = true;
        this.emit('closed');
      }
    },
    Notification: class extends EventEmitter {
      static isSupported() {
        return state.supported;
      }
      options: unknown;
      closed = false;
      constructor(options: unknown) {
        super();
        this.options = options;
        state.notifications.push(this);
      }
      show() {}
      close() {
        this.closed = true;
        this.emit('close');
      }
    },
  };
});
import { ipcMain } from 'electron';
import { AudioPlayer } from '../../electron/desktop/AudioPlayer';
import { NativeNotifier } from '../../electron/desktop/NativeNotifier';
type Window = EventEmitter & {
  options: { webPreferences: Record<string, unknown>; show: boolean };
  webContents: { mainFrame: unknown; send: ReturnType<typeof vi.fn> };
  destroyed: boolean;
};
type Notification = EventEmitter & { options: { silent: boolean }; closed: boolean };
it('áudio tem janela própria isolada, sender/frame/token validados e ready duplicado não repete', async () => {
  const player = new AudioPlayer('synthetic');
  const before = state.windows.length;
  const result = player.play(0.3);
  const window = state.windows[before] as Window;
  expect(window.options.show).toBe(false);
  expect(window.options.webPreferences).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    partition: 'krono-audio',
  });
  const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  ipcMain.emit('audio:ready', { sender: {}, senderFrame: {} });
  expect(window.webContents.send).not.toHaveBeenCalled();
  ipcMain.emit('audio:ready', sender);
  ipcMain.emit('audio:ready', sender);
  expect(window.webContents.send).toHaveBeenCalledTimes(1);
  const value = window.webContents.send.mock.calls[0][1] as { id: string; volume: number };
  expect(value.volume).toBe(0.3);
  ipcMain.emit('audio:result', sender, { id: crypto.randomUUID(), status: 'finished' });
  ipcMain.emit(
    'audio:result',
    { ...sender, senderFrame: {} },
    { id: value.id, status: 'finished' },
  );
  expect(await player.play(0.4)).toBe('failed'); // Enquanto o token correto está pendente.
  ipcMain.emit('audio:result', sender, { id: value.id, status: 'finished' });
  expect(await result).toBe('finished');
  expect(window.destroyed).toBe(true); // O renderer de áudio não fica residente depois do som.
  const next = player.play(0.4),
    fresh = state.windows.at(-1) as Window;
  expect(fresh).not.toBe(window);
  expect(fresh.destroyed).toBe(false);
  ipcMain.emit('audio:result', sender, { id: value.id, status: 'finished' });
  expect(fresh.destroyed).toBe(false);
  player.dispose();
  expect(await next).toBe('failed');
  expect(fresh.destroyed).toBe(true);
});
it('timeout/volume inválido do áudio não deixa promises, janela ou listeners acumulados', async () => {
  vi.useFakeTimers();
  const player = new AudioPlayer('synthetic');
  expect(await player.play(NaN)).toBe('failed');
  expect(await player.play(2)).toBe('failed');
  const result = player.play(0.2);
  const window = state.windows.at(-1) as Window;
  await vi.advanceTimersByTimeAsync(4000);
  expect(await result).toBe('failed');
  expect(window.destroyed).toBe(true);
  player.dispose();
  expect(ipcMain.listenerCount('audio:ready')).toBe(0);
  expect(ipcMain.listenerCount('audio:result')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
it('notificação é silenciosa, show é só evento observável e clique restaura sem comando temporal', async () => {
  const reveal = vi.fn(),
    notifier = new NativeNotifier(reveal);
  const result = notifier.notify('focus');
  const notification = state.notifications.at(-1) as Notification;
  expect(notification.options.silent).toBe(true);
  notification.emit('show');
  expect(await result).toBe('shown');
  notification.emit('click');
  expect(reveal).toHaveBeenCalledTimes(1);
  expect(notification.closed).toBe(true);
  notifier.dispose();
});
it('notificação sem confirmação fica requested e expira, sem loop; unsupported é explícito', async () => {
  vi.useFakeTimers();
  const notifier = new NativeNotifier(vi.fn());
  const result = notifier.notify('short-break');
  const notification = state.notifications.at(-1) as Notification;
  await vi.advanceTimersByTimeAsync(1500);
  expect(await result).toBe('requested');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(notification.closed).toBe(true);
  state.supported = false;
  expect(await notifier.notify('focus')).toBe('unsupported');
  state.supported = true;
  notifier.dispose();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
