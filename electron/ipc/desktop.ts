import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { desktopSnapshotSchema, preferenceUpdateSchema } from '../../shared/contracts/desktop';
import type { DesktopService } from '../desktop/DesktopService';
export function registerDesktop(window: BrowserWindow, desktop: DesktopService) {
  const guard = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
  };
  ipcMain.handle('desktop:read', (event) => {
    guard(event);
    return desktopSnapshotSchema.parse(desktop.read());
  });
  ipcMain.handle('desktop:update', async (event, value: unknown) => {
    guard(event);
    const update = preferenceUpdateSchema.parse(value);
    if ('globalShortcut' in update.patch)
      throw new Error('Use a configuração específica de atalho');
    return desktopSnapshotSchema.parse(await desktop.update(update));
  });
  ipcMain.handle('desktop:dismiss', async (event, value: unknown) => {
    guard(event);
    return desktopSnapshotSchema.parse(await desktop.dismiss(z.string().uuid().parse(value)));
  });
  ipcMain.handle('desktop:preview', (event) => {
    guard(event);
    return desktop.preview();
  });
  const unsubscribe = desktop.subscribe((value) => {
    if (!window.isDestroyed())
      window.webContents.send('desktop:snapshot', desktopSnapshotSchema.parse(value));
  });
  return () => {
    unsubscribe();
    for (const name of ['read', 'update', 'dismiss', 'preview'])
      ipcMain.removeHandler(`desktop:${name}`);
  };
}
