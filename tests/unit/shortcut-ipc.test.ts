import { expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { ShortcutController } from '../../electron/desktop/ShortcutController';
const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, value?: unknown) => unknown>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (key: string, handler: (event: unknown, value?: unknown) => unknown) =>
      state.handlers.set(key, handler),
    removeHandler: (key: string) => state.handlers.delete(key),
  },
}));
import { registerShortcut } from '../../electron/ipc/shortcut';
it('capacidade de atalho recusa outro remetente/frame e libera handlers e assinatura', async () => {
  const frame = {},
    contents = { mainFrame: frame, isDestroyed: () => false, send: vi.fn() },
    window = { webContents: contents, isDestroyed: () => false } as unknown as BrowserWindow;
  const off = vi.fn(),
    set = vi.fn(async () => ({ configured: 'off', active: 'off', status: 'off', message: null }));
  const controller = {
    read: () => ({ configured: 'off', active: 'off', status: 'off', message: null }),
    set,
    subscribe: () => off,
  } as unknown as ShortcutController;
  const release = registerShortcut(window, controller),
    read = state.handlers.get('shortcut:read')!,
    write = state.handlers.get('shortcut:set')!;
  expect(() => read({ sender: {}, senderFrame: frame })).toThrow('Origem recusada');
  expect(() => read({ sender: contents, senderFrame: {} })).toThrow('Origem recusada');
  expect(read({ sender: contents, senderFrame: frame })).toEqual({
    configured: 'off',
    active: 'off',
    status: 'off',
    message: null,
  });
  await expect(write({ sender: {}, senderFrame: frame }, 'Control+Alt+K')).rejects.toThrow(
    'Origem recusada',
  );
  expect(set).not.toHaveBeenCalled();
  release();
  expect(state.handlers.size).toBe(0);
  expect(off).toHaveBeenCalledOnce();
});
