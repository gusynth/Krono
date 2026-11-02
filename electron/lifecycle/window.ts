import { app, BrowserWindow, ipcMain, nativeTheme, nativeImage, session } from 'electron';
import { taskbarDetails, resolveIconPath } from './taskbar';
import { themeSchema, type Theme } from '../../shared/contracts/appearance';
import { windowControlActionSchema } from '../../shared/contracts/window-control';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let releaseAppearance = () => {};
let releaseWindowControl = () => {};

export function createMainWindow(root: string, show = true) {
  let theme: Theme = 'original';
  const url = pathToFileURL(join(root, 'dist/index.html')).href;
  const palettes = {
    original: ['#181918', '#b6bdb3'],
    terminal: ['#09110d', '#a5c4b0'],
    aero: ['#10232b', '#b4cbd5'],
    classic: ['#1b2323', '#bec5c1'],
  };
  const iconPath = resolveIconPath(root, app.isPackaged);
  const icon = nativeImage.createFromPath(iconPath);
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 640,
    show: false,
    backgroundColor: '#181918',
    title: 'Krono',
    icon,
    autoHideMenuBar: true,
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden' as const } : {}),
    webPreferences: {
      preload: join(root, 'dist-electron/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  if (process.platform === 'win32') {
    window.setAppDetails(taskbarDetails(root, process.execPath, app.isPackaged));
    window.setIcon(icon);
  }
  releaseAppearance();
  let released = false;
  const disposeAppearance = () => {
    if (released) return;
    released = true;
    ipcMain.removeHandler('window:theme');
    nativeTheme.removeListener('updated', themeChanged);
  };
  releaseAppearance = disposeAppearance;

  const themeChanged = () => {
    if (!window.isDestroyed()) {
      window.setBackgroundColor(palettes[theme][0]!);
    }
  };
  ipcMain.handle('window:theme', (event, input: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
    theme = themeSchema.parse(input);
    window.setBackgroundColor(palettes[theme][0]!);
    themeChanged();
  });

  releaseWindowControl();
  let controlReleased = false;
  const disposeControl = () => {
    if (controlReleased) return;
    controlReleased = true;
    ipcMain.removeHandler('window:control');
  };
  releaseWindowControl = disposeControl;

  ipcMain.handle('window:control', (event, input: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Origem recusada');
    const action = windowControlActionSchema.parse(input);
    if (action === 'minimize') {
      window.minimize();
    } else if (action === 'maximize') {
      if (window.isFullScreen()) window.setFullScreen(false);
      else if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    } else if (action === 'close') {
      window.close();
    } else if (action === 'state') {
      return { maximized: window.isMaximized(), fullscreen: window.isFullScreen() };
    }
  });

  const publishMaximized = () => {
    if (!window.webContents.isDestroyed())
      window.webContents.send('window:maximized', window.isMaximized());
  };
  const publishFullscreen = () => {
    if (!window.webContents.isDestroyed())
      window.webContents.send('window:fullscreen', window.isFullScreen());
  };
  const publishVisibility = () => {
    if (!window.webContents.isDestroyed())
      window.webContents.send('window:visibility', window.isVisible() && !window.isMinimized());
  };

  window.on('maximize', publishMaximized);
  window.on('unmaximize', publishMaximized);
  window.on('show', publishVisibility);
  window.on('hide', publishVisibility);
  window.on('minimize', publishVisibility);
  window.on('restore', publishVisibility);
  window.on('enter-full-screen', publishFullscreen);
  window.on('leave-full-screen', publishFullscreen);
  window.webContents.on('did-finish-load', publishFullscreen);
  window.webContents.on('did-finish-load', publishMaximized);
  window.webContents.on('did-finish-load', () => {
    if (window.isVisible()) publishVisibility();
  });
  nativeTheme.on('updated', themeChanged);
  window.once('closed', () => {
    disposeAppearance();
    disposeControl();
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !details.url.startsWith(pathToFileURL(join(root, 'dist')).href + '/') }),
  );
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (show) window.once('ready-to-show', () => window.show());
  void window.loadURL(url);
  return window;
}
