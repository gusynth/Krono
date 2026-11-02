import { it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, callback: (...args: unknown[]) => unknown) =>
      handlers.set(name, callback),
    removeHandler: (name: string) => handlers.delete(name),
  },
}));
import { registerMaintenance } from '../../electron/ipc/maintenance';
it('manutenção recusa outra janela, iframe e caminhos arbitrários antes de executar', () => {
  const mainFrame = {},
    webContents = { mainFrame };
  const ports = { status: vi.fn(), openBackups: vi.fn(), exportCSV: vi.fn() };
  const off = registerMaintenance({ webContents } as BrowserWindow, ports);
  const invoke = handlers.get('maintenance:command')!;
  expect(() => invoke({ sender: {}, senderFrame: mainFrame }, 'export-csv')).toThrow(
    'Origem recusada',
  );
  expect(() => invoke({ sender: webContents, senderFrame: {} }, 'open-backups')).toThrow(
    'Origem recusada',
  );
  expect(() =>
    invoke(
      { sender: webContents, senderFrame: mainFrame },
      { action: 'open-backups', path: 'C:/arbitrary' },
    ),
  ).toThrow();
  expect(ports.exportCSV).not.toHaveBeenCalled();
  expect(ports.openBackups).not.toHaveBeenCalled();
  invoke({ sender: webContents, senderFrame: mainFrame }, 'status');
  expect(ports.status).toHaveBeenCalledOnce();
  off();
  expect(handlers.size).toBe(0);
});
