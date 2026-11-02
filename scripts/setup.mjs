import { spawnSync } from 'node:child_process';
for (const [command, args] of [
  [process.execPath, ['node_modules/electron/install.js']],
  [process.execPath, ['node_modules/electron-builder/cli.js', 'install-app-deps']],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
