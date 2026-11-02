import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { AppDetailsOptions } from 'electron';

const quote = (path: string) => `"${path.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/, '$&$&')}"`;

export function resolveIconPath(root: string, packaged: boolean): string {
  if (!packaged) return join(root, 'dist-electron/assets/principal.ico');
  const unpacked = join(root, '../app.asar.unpacked/dist-electron/assets/principal.ico');
  if (existsSync(unpacked)) return unpacked;
  return join(root, 'dist-electron/assets/principal.ico');
}

/** O Shell não lê caminhos dentro do ASAR: o pacote usa o ícone PE do próprio EXE. */
export function taskbarDetails(
  root: string,
  executable: string,
  packaged: boolean,
): AppDetailsOptions {
  return {
    appId: packaged ? 'com.krono.desktop' : 'com.krono.desktop.dev',
    appIconPath: packaged ? executable : resolveIconPath(root, packaged),
    appIconIndex: 0,
    relaunchDisplayName: 'Krono',
    relaunchCommand: packaged ? quote(executable) : `${quote(executable)} ${quote(root)}`,
  };
}
