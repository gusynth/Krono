import { contextBridge, ipcRenderer } from 'electron';

// Sinal unidirecional e apenas visual; não oferece comando de janela ao renderer.
ipcRenderer.on('window:fullscreen', (_event, value: unknown) => {
  if (typeof value === 'boolean')
    document.documentElement?.toggleAttribute('data-window-fullscreen', value);
});
ipcRenderer.on('window:visibility', (_event, value: unknown) => {
  if (typeof value !== 'boolean') return;
  document.documentElement.dataset.windowVisible = String(value);
  window.dispatchEvent(new Event('krono-visibility'));
});

contextBridge.exposeInMainWorld(
  'krono',
  Object.freeze({
    maintenance: Object.freeze({
      status: () => ipcRenderer.invoke('maintenance:command', 'status'),
      openBackups: () => ipcRenderer.invoke('maintenance:command', 'open-backups'),
      exportCSV: () => ipcRenderer.invoke('maintenance:command', 'export-csv'),
    }),
    shortcut: Object.freeze({
      read: () => ipcRenderer.invoke('shortcut:read'),
      set: (value: unknown) => ipcRenderer.invoke('shortcut:set', value),
      subscribe: (listener: (value: unknown) => void) => {
        const receive = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
        ipcRenderer.on('shortcut:changed', receive);
        return () => ipcRenderer.removeListener('shortcut:changed', receive);
      },
    }),
    windowTheme: (theme: unknown) => ipcRenderer.invoke('window:theme', theme),
    windowControl: Object.freeze({
      command: (action: unknown) => ipcRenderer.invoke('window:control', action),
      subscribeMaximized: (listener: (maximized: boolean) => void) => {
        const receive = (_event: Electron.IpcRendererEvent, value: unknown) => {
          if (typeof value === 'boolean') listener(value);
        };
        ipcRenderer.on('window:maximized', receive);
        return () => {
          ipcRenderer.removeListener('window:maximized', receive);
        };
      },
    }),
    mini: Object.freeze({
      command: (action: unknown) => ipcRenderer.invoke('mini:command', action),
      subscribe: (listener: (value: unknown) => void) => {
        const receive = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
        ipcRenderer.on('mini:changed', receive);
        return () => ipcRenderer.removeListener('mini:changed', receive);
      },
    }),
    shellDialog: Object.freeze({
      read: () => ipcRenderer.invoke('shell-dialog:read'),
      respond: (value: unknown) => ipcRenderer.invoke('shell-dialog:respond', value),
      subscribe: (listener: (value: unknown) => void) => {
        const receive = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
        ipcRenderer.on('shell-dialog:changed', receive);
        return () => {
          ipcRenderer.removeListener('shell-dialog:changed', receive);
        };
      },
    }),
    backup: Object.freeze({
      export: () => ipcRenderer.invoke('backup:export'),
      inspect: () => ipcRenderer.invoke('backup:inspect'),
      cancel: () => ipcRenderer.invoke('backup:cancel'),
      restore: (input: unknown) => ipcRenderer.invoke('backup:restore', input),
    }),
    production: Object.freeze({
      garden: () => ipcRenderer.invoke('production:garden'),
      day: (query: unknown) => ipcRenderer.invoke('production:day', query),
      read: (query: unknown) => ipcRenderer.invoke('production:read', query),
      goals: () => ipcRenderer.invoke('production:goals'),
      command: (value: unknown) => ipcRenderer.invoke('production:command', value),
      subscribe: (listener: () => void) => {
        const receive = () => listener();
        ipcRenderer.on('production:changed', receive);
        return () => {
          ipcRenderer.removeListener('production:changed', receive);
        };
      },
    }),
    habits: Object.freeze({
      read: () => ipcRenderer.invoke('habits:read'),
      command: (value: unknown) => ipcRenderer.invoke('habits:command', value),
    }),
    desktop: Object.freeze({
      read: () => ipcRenderer.invoke('desktop:read'),
      update: (value: unknown) => ipcRenderer.invoke('desktop:update', value),
      dismiss: (id: string) => ipcRenderer.invoke('desktop:dismiss', id),
      preview: () => ipcRenderer.invoke('desktop:preview'),
      subscribe: (listener: (value: unknown) => void) => {
        const receive = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
        ipcRenderer.on('desktop:snapshot', receive);
        return () => {
          ipcRenderer.removeListener('desktop:snapshot', receive);
        };
      },
      onFocus: (listener: () => void) => {
        const receive = () => listener();
        ipcRenderer.on('desktop:focus', receive);
        return () => {
          ipcRenderer.removeListener('desktop:focus', receive);
        };
      },
    }),
    foundation: () => ipcRenderer.invoke('foundation:read'),
    timer: Object.freeze({
      read: () => ipcRenderer.invoke('timer:read'),
      command: (command: unknown) => ipcRenderer.invoke('timer:command', command),
      subscribe: (listener: (value: unknown) => void) => {
        const receive = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
        ipcRenderer.on('timer:snapshot', receive);
        return () => {
          ipcRenderer.removeListener('timer:snapshot', receive);
        };
      },
    }),
  }),
);
