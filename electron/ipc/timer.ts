import { ipcMain, type BrowserWindow } from 'electron';
import {
  timerCommandSchema,
  timerReplySchema,
  timerSnapshotSchema,
} from '../../shared/contracts/timer';
import type { TimerService } from '../services/TimerService';

export function registerTimer(window: BrowserWindow, timer: TimerService) {
  const assertSender = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
  };
  ipcMain.handle('timer:read', (event) => {
    assertSender(event);
    return timerSnapshotSchema.parse(timer.read());
  });
  ipcMain.handle('timer:command', async (event, input: unknown) => {
    assertSender(event);
    const parsed = timerCommandSchema.safeParse(input);
    if (!parsed.success) return timerReplySchema.parse({ code: 'invalid', snapshot: timer.read() });
    return timerReplySchema.parse(await timer.command(parsed.data));
  });
  const unsubscribe = timer.subscribe((value) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('timer:snapshot', timerSnapshotSchema.parse(value));
  });
  return () => {
    unsubscribe();
    ipcMain.removeHandler('timer:read');
    ipcMain.removeHandler('timer:command');
  };
}
