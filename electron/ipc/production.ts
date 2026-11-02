import { ipcMain, type BrowserWindow } from 'electron';
import {
  productionDayQuerySchema,
  productionQuerySchema,
  goalCommandSchema,
} from '../../shared/contracts/production';
import type { ProductionService } from '../services/ProductionService';
export function registerProduction(window: BrowserWindow, production: ProductionService) {
  const guard = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
  };
  ipcMain.handle('production:garden', (event) => {
    guard(event);
    return production.garden();
  });
  ipcMain.handle('production:day', (event, value: unknown) => {
    guard(event);
    return production.day(productionDayQuerySchema.parse(value));
  });
  ipcMain.handle('production:read', (event, value: unknown) => {
    guard(event);
    return production.read(productionQuerySchema.parse(value));
  });
  ipcMain.handle('production:goals', (event) => {
    guard(event);
    return production.goals();
  });
  ipcMain.handle('production:command', (event, value: unknown) => {
    guard(event);
    return production.command(goalCommandSchema.parse(value));
  });
  const off = production.subscribe(() => {
    if (!window.isDestroyed()) window.webContents.send('production:changed');
  });
  return () => {
    off();
    for (const name of ['read', 'day', 'goals', 'command', 'garden'])
      ipcMain.removeHandler(`production:${name}`);
  };
}
