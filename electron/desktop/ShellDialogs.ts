import { randomUUID } from 'node:crypto';
import { ipcMain, type BrowserWindow } from 'electron';
import {
  shellReplySchema,
  type ShellChoice,
  type ShellDialogRequest,
} from '../../shared/contracts/shell-dialog';

// Uma solicitação limitada e vinculada à janela principal; nunca um comando genérico de sistema.
export class ShellDialogs {
  private pending: { request: ShellDialogRequest; resolve: (choice: ShellChoice) => void } | null =
    null;
  request(window: BrowserWindow, input: Omit<ShellDialogRequest, 'id'>): Promise<ShellChoice> {
    if (this.pending || window.isDestroyed() || window.webContents.isCrashed())
      return Promise.resolve('cancel');
    return new Promise((resolve) => {
      this.pending = { request: { ...input, id: randomUUID() }, resolve };
      try {
        window.webContents.send('shell-dialog:changed', this.pending.request);
      } catch {
        this.pending = null;
        resolve('cancel');
      }
    });
  }
  register(window: BrowserWindow) {
    // A propriedade nativa window.webContents deixa de ser acessível após closed.
    const contents = window.webContents;
    const guard = (event: Electron.IpcMainInvokeEvent) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('Origem recusada');
    };
    const clear = () => {
      this.cancel();
      if (!window.isDestroyed()) {
        try {
          window.webContents.send('shell-dialog:changed', null);
        } catch {
          /* Janela em encerramento; a ação permanece cancelada. */
        }
      }
    };
    ipcMain.handle('shell-dialog:read', (event) => {
      guard(event);
      return this.pending?.request ?? null;
    });
    ipcMain.handle('shell-dialog:respond', (event, input: unknown) => {
      guard(event);
      const reply = shellReplySchema.parse(input),
        pending = this.pending;
      if (
        !pending ||
        reply.id !== pending.request.id ||
        (reply.choice === 'quit' && pending.request.kind !== 'quit') ||
        (reply.choice === 'hide' && !pending.request.canHide)
      )
        return false;
      this.pending = null;
      pending.resolve(reply.choice);
      if (!window.isDestroyed()) window.webContents.send('shell-dialog:changed', null);
      return true;
    });
    contents.on('render-process-gone', clear);
    contents.on('unresponsive', clear);
    contents.on('did-start-loading', clear);
    return () => {
      clear();
      contents.off('render-process-gone', clear);
      contents.off('unresponsive', clear);
      contents.off('did-start-loading', clear);
      ipcMain.removeHandler('shell-dialog:read');
      ipcMain.removeHandler('shell-dialog:respond');
    };
  }
  cancel() {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve('cancel');
  }
}
