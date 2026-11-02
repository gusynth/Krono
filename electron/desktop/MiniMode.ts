import { ipcMain, screen, type BrowserWindow, type Rectangle } from 'electron';
import { miniActionSchema, type MiniState } from '../../shared/contracts/mini';

/** Compacta a janela existente: não cria renderer nem autoridade temporal extra. */
export class MiniMode {
  private state: MiniState = { active: false, pinned: false };
  private bounds: Rectangle | null = null;
  private maximized = false;
  private compactBounds: Rectangle | null = null;
  constructor(private window: BrowserWindow) {
    ipcMain.handle('mini:command', (event, input: unknown) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('Origem recusada');
      const action = miniActionSchema.parse(input);
      if (action === 'enter') this.enter();
      if (action === 'leave') this.leave();
      if (action === 'size' && this.state.active) {
        this.state.comfortable = !this.state.comfortable;
        const bounds = window.getBounds(),
          work = screen.getDisplayMatching(bounds).workArea,
          width = this.state.comfortable ? 460 : 380,
          height = this.state.comfortable ? 320 : 280;
        window.setBounds({
          width,
          height,
          x: Math.max(work.x, Math.min(bounds.x, work.x + work.width - width)),
          y: Math.max(work.y, Math.min(bounds.y, work.y + work.height - height)),
        });
        this.publish();
      }
      if (action === 'pin' && this.state.active) {
        this.state.pinned = !this.state.pinned;
        window.setAlwaysOnTop(this.state.pinned);
        this.publish();
      }
      return { ...this.state };
    });
  }
  private publish() {
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed())
      this.window.webContents.send('mini:changed', { ...this.state });
  }
  private enter() {
    if (this.state.active || this.window.isFullScreen()) return;
    this.maximized = this.window.isMaximized();
    this.bounds = this.window.getNormalBounds();
    if (this.maximized) this.window.unmaximize();
    this.window.setMaximizable(false);
    this.window.setMinimumSize(360, 250);
    const work = screen.getDisplayMatching(this.bounds).workArea;
    const compact = this.compactBounds ?? this.bounds;
    this.window.setBounds({
      x: Math.max(work.x, Math.min(compact.x, work.x + work.width - 380)),
      y: Math.max(work.y, Math.min(compact.y, work.y + work.height - 280)),
      width: 380,
      height: 280,
    });
    this.state = { active: true, pinned: false };
    this.publish();
  }
  leave() {
    if (!this.state.active || this.window.isDestroyed()) return;
    this.compactBounds = this.window.getBounds();
    this.window.setMaximizable(true);
    this.window.setAlwaysOnTop(false);
    this.window.setMinimumSize(800, 640);
    if (this.bounds) {
      const work = screen.getDisplayMatching(this.bounds).workArea;
      const width = Math.min(Math.max(800, this.bounds.width), work.width),
        height = Math.min(Math.max(640, this.bounds.height), work.height);
      this.window.setBounds({
        width,
        height,
        x: Math.max(work.x, Math.min(this.bounds.x, work.x + work.width - width)),
        y: Math.max(work.y, Math.min(this.bounds.y, work.y + work.height - height)),
      });
    }
    if (this.maximized) this.window.maximize();
    this.state = { active: false, pinned: false };
    this.publish();
  }
  dispose() {
    ipcMain.removeHandler('mini:command');
    if (this.state.pinned && !this.window.isDestroyed()) this.window.setAlwaysOnTop(false);
    this.state.pinned = false;
  }
}
