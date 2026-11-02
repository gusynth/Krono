import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld(
  'kronoAudio',
  Object.freeze({
    listen: (callback: (value: { id: string; volume: number }) => void) => {
      const receive = (_event: Electron.IpcRendererEvent, value: { id: string; volume: number }) =>
        callback(value);
      ipcRenderer.on('audio:play', receive);
      ipcRenderer.send('audio:ready');
      return () => {
        ipcRenderer.removeListener('audio:play', receive);
      };
    },
    result: (value: unknown) => ipcRenderer.send('audio:result', value),
  }),
);
