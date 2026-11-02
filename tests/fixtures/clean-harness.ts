// Entrada de teste separada. Sem preload, IPC ou banco; nunca empacotada.
import { app, BrowserWindow, session } from 'electron';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
mkdirSync('.test-data', { recursive: true });
app.setPath('userData', mkdtempSync(resolve('.test-data/dark-icons-')));
void app.whenReady().then(() => {
  const root = resolve('artifacts/dark-study/dist');
  const prefix = pathToFileURL(root).href + '/';
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !details.url.startsWith(prefix) }),
  );
  const window = new BrowserWindow({
    width: 1280,
    height: 940,
    show: false,
    backgroundColor: '#0c0c0e',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  void window.loadFile(resolve(root, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
