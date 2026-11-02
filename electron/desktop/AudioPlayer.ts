import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const resultSchema = z
  .object({ id: z.string().uuid(), status: z.enum(['finished', 'failed']) })
  .strict();
export class AudioPlayer {
  private window: BrowserWindow | null = null;
  private ready = false;
  private pending: {
    id: string;
    volume: number;
    sent: boolean;
    resolve: (value: 'finished' | 'failed') => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  private disposed = false;
  constructor(private root: string) {
    ipcMain.on('audio:ready', this.onReady);
    ipcMain.on('audio:result', this.onResult);
  }
  private authorized(event: Electron.IpcMainEvent) {
    return (
      this.window &&
      !this.window.isDestroyed() &&
      event.sender === this.window.webContents &&
      event.senderFrame === this.window.webContents.mainFrame
    );
  }
  private onReady = (event: Electron.IpcMainEvent) => {
    if (!this.authorized(event)) return;
    this.ready = true;
    this.send();
  };
  private onResult = (event: Electron.IpcMainEvent, value: unknown) => {
    if (!this.authorized(event)) return;
    const result = resultSchema.safeParse(value);
    if (result.success && result.data.id === this.pending?.id) this.finish(result.data.status);
  };
  private send() {
    if (
      this.ready &&
      this.pending &&
      !this.pending.sent &&
      this.window &&
      !this.window.isDestroyed()
    ) {
      this.pending.sent = true;
      this.window.webContents.send('audio:play', {
        id: this.pending.id,
        volume: this.pending.volume,
      });
    }
  }
  private finish(status: 'finished' | 'failed') {
    const pending = this.pending;
    this.pending = null;
    const window = this.window;
    this.window = null;
    this.ready = false;
    if (window && !window.isDestroyed()) window.destroy();
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(status);
    }
  }
  play(volume: number): Promise<'finished' | 'failed'> {
    if (this.disposed || this.pending || !Number.isFinite(volume) || volume <= 0 || volume > 1)
      return Promise.resolve('failed');
    return new Promise((resolve) => {
      const id = randomUUID();
      this.pending = {
        id,
        volume,
        sent: false,
        resolve,
        timeout: setTimeout(() => {
          if (this.pending?.id === id) this.finish('failed');
        }, 4000),
      };
      try {
        if (!this.window || this.window.isDestroyed()) {
          this.ready = false;
          const folder = join(this.root, 'dist-electron/audio');
          const window = new BrowserWindow({
            show: false,
            width: 1,
            height: 1,
            webPreferences: {
              preload: join(folder, 'preload.cjs'),
              partition: 'krono-audio',
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              autoplayPolicy: 'no-user-gesture-required',
            },
          });
          this.window = window;
          const prefix = pathToFileURL(folder).href + '/';
          window.webContents.session.setPermissionRequestHandler((_web, _permission, callback) =>
            callback(false),
          );
          window.webContents.session.setPermissionCheckHandler(() => false);
          window.webContents.session.webRequest.onBeforeRequest((details, callback) =>
            callback({ cancel: !details.url.startsWith(prefix) }),
          );
          window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
          window.webContents.on('will-navigate', (event) => event.preventDefault());
          window.once('closed', () => {
            if (this.window === window) {
              this.ready = false;
              this.window = null;
              this.finish('failed');
            }
          });
          void window.loadFile(join(folder, 'index.html')).catch(() => {
            if (this.window === window) this.finish('failed');
          });
        } else this.send();
      } catch {
        this.finish('failed');
      }
    });
  }
  dispose() {
    this.disposed = true;
    ipcMain.off('audio:ready', this.onReady);
    ipcMain.off('audio:result', this.onResult);
    this.finish('failed');
    this.window?.destroy();
    this.window = null;
  }
}
