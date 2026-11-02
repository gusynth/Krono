import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      state.handlers.set(name, handler),
    removeHandler: (name: string) => state.handlers.delete(name),
  },
}));
import { ShellDialogs } from '../../electron/desktop/ShellDialogs';

it('diálogo valida frame, token e escolha; reload/cancelamento liberam a solicitação', async () => {
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    send: vi.fn(),
    isCrashed: () => false,
  });
  const window = {
    isDestroyed: () => false,
    webContents: contents,
  } as unknown as Electron.BrowserWindow;
  const dialogs = new ShellDialogs(),
    unregister = dialogs.register(window),
    event = { sender: contents, senderFrame: contents.mainFrame };
  const promise = dialogs.request(window, {
    kind: 'hide',
    canHide: true,
    running: false,
    storageError: false,
  });
  expect(
    await dialogs.request(window, {
      kind: 'hide',
      canHide: true,
      running: false,
      storageError: false,
    }),
  ).toBe('cancel');
  const read = state.handlers.get('shell-dialog:read')!,
    respond = state.handlers.get('shell-dialog:respond')!;
  const request = read(event) as { id: string };
  expect(() => read({ sender: {}, senderFrame: contents.mainFrame })).toThrow('Origem');
  expect(() =>
    respond({ sender: contents, senderFrame: {} }, { id: request.id, choice: 'hide' }),
  ).toThrow('Origem');
  expect(respond(event, { id: crypto.randomUUID(), choice: 'hide' })).toBe(false);
  expect(respond(event, { id: request.id, choice: 'quit' })).toBe(false);
  expect(respond(event, { id: request.id, choice: 'hide' })).toBe(true);
  expect(await promise).toBe('hide');
  expect(respond(event, { id: request.id, choice: 'hide' })).toBe(false);
  const canceled = dialogs.request(window, {
    kind: 'quit',
    canHide: false,
    running: true,
    storageError: true,
  });
  const next = read(event) as { id: string };
  expect(respond(event, { id: next.id, choice: 'hide' })).toBe(false);
  contents.emit('did-start-loading');
  expect(await canceled).toBe('cancel');
  const stalled = dialogs.request(window, {
    kind: 'hide',
    canHide: true,
    running: false,
    storageError: false,
  });
  contents.emit('unresponsive');
  expect(await stalled).toBe('cancel');
  expect(read(event)).toBeNull();
  contents.send.mockImplementationOnce(() => {
    throw new Error('CHANNEL_CLOSED');
  });
  expect(
    await dialogs.request(window, {
      kind: 'hide',
      canHide: true,
      running: false,
      storageError: false,
    }),
  ).toBe('cancel');
  expect(read(event)).toBeNull();
  unregister();
  expect(state.handlers.size).toBe(0);
  expect(contents.listenerCount('render-process-gone')).toBe(0);
});

it('desregistra após closed sem consultar a propriedade nativa da janela destruída', async () => {
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    send: vi.fn(),
    isCrashed: () => false,
  });
  let destroyed = false;
  const window = {
    isDestroyed: () => destroyed,
    get webContents() {
      if (destroyed) throw new TypeError('Object has been destroyed');
      return contents;
    },
  } as unknown as Electron.BrowserWindow;
  const dialogs = new ShellDialogs(),
    unregister = dialogs.register(window);
  const pending = dialogs.request(window, {
    kind: 'quit',
    canHide: true,
    running: true,
    storageError: false,
  });
  destroyed = true;
  expect(() => unregister()).not.toThrow();
  expect(await pending).toBe('cancel');
  expect(state.handlers.size).toBe(0);
  for (const name of ['render-process-gone', 'unresponsive', 'did-start-loading'])
    expect(contents.listenerCount(name)).toBe(0);
  expect(() => unregister()).not.toThrow();
});
