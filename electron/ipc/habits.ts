import { ipcMain, type BrowserWindow } from 'electron';
import type { HabitService } from '../services/HabitService';
import { habitCommandSchema } from '../../shared/contracts/habits';
export function registerHabits(window: BrowserWindow, habits: HabitService) {
  const guard = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
  };
  ipcMain.handle('habits:read', (event) => {
    guard(event);
    return habits.read();
  });
  ipcMain.handle('habits:command', (event, value: unknown) => {
    guard(event);
    return habits.command(habitCommandSchema.parse(value));
  });
  return () => {
    ipcMain.removeHandler('habits:read');
    ipcMain.removeHandler('habits:command');
  };
}
