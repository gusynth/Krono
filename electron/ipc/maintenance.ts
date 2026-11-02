import { ipcMain, type BrowserWindow } from 'electron';
import { maintenanceActionSchema } from '../../shared/contracts/maintenance';
export interface MaintenancePorts {
  status: () => Promise<unknown>;
  openBackups: () => Promise<void>;
  exportCSV: () => Promise<unknown>;
}
export function registerMaintenance(window: BrowserWindow, ports: MaintenancePorts) {
  ipcMain.handle('maintenance:command', (event, input: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
    const action = maintenanceActionSchema.parse(input);
    return action === 'status'
      ? ports.status()
      : action === 'open-backups'
        ? ports.openBackups()
        : ports.exportCSV();
  });
  return () => ipcMain.removeHandler('maintenance:command');
}
