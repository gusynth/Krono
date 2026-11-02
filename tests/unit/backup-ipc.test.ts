import { it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { BackupService } from '../../electron/services/BackupService';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, callback: (...args: unknown[]) => unknown) =>
      handlers.set(name, callback),
    removeHandler: (name: string) => handlers.delete(name),
  },
}));
import { registerBackup } from '../../electron/ipc/backup';
it('backup IPC recusa outra janela e iframe antes de abrir diálogo ou tocar dados', () => {
  const mainFrame = {},
    webContents = { mainFrame },
    service = { export: vi.fn(), inspect: vi.fn(), cancel: vi.fn(), restore: vi.fn() };
  const off = registerBackup({ webContents } as BrowserWindow, service as unknown as BackupService);
  for (const name of ['export', 'inspect', 'cancel', 'restore']) {
    const invoke = handlers.get(`backup:${name}`)!;
    expect(() => invoke({ sender: {}, senderFrame: mainFrame })).toThrow('Origem recusada');
    expect(() => invoke({ sender: webContents, senderFrame: {} })).toThrow('Origem recusada');
  }
  expect(service.export).not.toHaveBeenCalled();
  expect(service.restore).not.toHaveBeenCalled();
  off();
  expect(handlers.size).toBe(0);
});
it('backup IPC só aceita restauração confirmada por token e não expõe caminho arbitrário', () => {
  const mainFrame = {},
    webContents = { mainFrame },
    event = { sender: webContents, senderFrame: mainFrame };
  const service = { export: vi.fn(), inspect: vi.fn(), cancel: vi.fn(), restore: vi.fn() };
  const off = registerBackup({ webContents } as BrowserWindow, service as unknown as BackupService);
  handlers.get('backup:export')!(event, { path: 'untrusted.sqlite' });
  expect(service.export).toHaveBeenCalledWith();
  expect(() =>
    handlers.get('backup:restore')!(event, {
      token: crypto.randomUUID(),
      confirmReplacement: true,
      path: 'untrusted.sqlite',
    }),
  ).toThrow();
  expect(() => handlers.get('backup:restore')!(event, { token: crypto.randomUUID() })).toThrow();
  expect(service.restore).not.toHaveBeenCalled();
  off();
});
