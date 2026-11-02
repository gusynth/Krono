import { app, ipcMain, type BrowserWindow } from 'electron';
import { foundationSchema } from '../../shared/contracts/foundation';

export function registerFoundation(window: BrowserWindow, readStorage: () => 'ready' | 'error') {
  ipcMain.handle('foundation:read', (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
    return foundationSchema.parse({
      version: app.getVersion(),
      runtime: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        abi: process.versions.modules,
      },
      storage: readStorage(),
    });
  });
  return () => ipcMain.removeHandler('foundation:read');
}
