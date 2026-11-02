import { ipcMain, type BrowserWindow } from 'electron';
import { shortcutSnapshotSchema } from '../../shared/contracts/welcome';
import type { ShortcutController } from '../desktop/ShortcutController';
export function registerShortcut(window: BrowserWindow, controller: ShortcutController) {
  const guard = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
  };
  ipcMain.handle('shortcut:read', (event) => {
    guard(event);
    return shortcutSnapshotSchema.parse(controller.read());
  });
  ipcMain.handle('shortcut:set', async (event, input: unknown) => {
    guard(event);
    return shortcutSnapshotSchema.parse(await controller.set(input));
  });
  const off = controller.subscribe((value) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('shortcut:changed', value);
  });
  return () => {
    off();
    ipcMain.removeHandler('shortcut:read');
    ipcMain.removeHandler('shortcut:set');
  };
}
