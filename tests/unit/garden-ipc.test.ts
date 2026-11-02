import { it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { ProductionService } from '../../electron/services/ProductionService';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, callback: (...args: unknown[]) => unknown) =>
      handlers.set(name, callback),
    removeHandler: (name: string) => handlers.delete(name),
  },
}));
import { registerProduction } from '../../electron/ipc/production';
it('jardim só aceita janela/frame principal e libera todos os handlers ao sair', () => {
  const mainFrame = {},
    webContents = { mainFrame },
    garden = vi.fn(() => ({ version: 1, eligibleMs: 0, sessions: 0 })),
    unsubscribe = vi.fn();
  const off = registerProduction(
      { webContents } as BrowserWindow,
      { garden, subscribe: () => unsubscribe } as unknown as ProductionService,
    ),
    invoke = handlers.get('production:garden')!;
  expect(() => invoke({ sender: {}, senderFrame: mainFrame })).toThrow('Origem recusada');
  expect(() => invoke({ sender: webContents, senderFrame: {} })).toThrow('Origem recusada');
  expect(garden).not.toHaveBeenCalled();
  expect(invoke({ sender: webContents, senderFrame: mainFrame })).toEqual({
    version: 1,
    eligibleMs: 0,
    sessions: 0,
  });
  expect(garden).toHaveBeenCalledOnce();
  off();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(handlers.size).toBe(0);
});
