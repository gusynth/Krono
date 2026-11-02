import { ipcMain, type BrowserWindow } from 'electron';
import type { BackupService } from '../services/BackupService';
import { restoreRequestSchema } from '../../shared/contracts/backup';
export function registerBackup(window: BrowserWindow, service: BackupService) {
  const guard = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
  };
  ipcMain.handle('backup:export', (event) => {
    guard(event);
    return service.export();
  });
  ipcMain.handle('backup:inspect', (event) => {
    guard(event);
    return service.inspect();
  });
  ipcMain.handle('backup:cancel', (event) => {
    guard(event);
    return service.cancel();
  });
  ipcMain.handle('backup:restore', (event, input: unknown) => {
    guard(event);
    return service.restore(restoreRequestSchema.parse(input));
  });
  return () => {
    for (const name of ['export', 'inspect', 'cancel', 'restore'])
      ipcMain.removeHandler(`backup:${name}`);
  };
}
