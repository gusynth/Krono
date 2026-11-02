import { mkdir, copyFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import './build-identity.mjs';
await build({
  entryPoints: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
    worker: 'electron/storage/worker.ts',
    'backup-validator': 'electron/storage/backup-validator.ts',
    'rescue-worker': 'electron/storage/rescue-worker.ts',
    'audio/preload': 'electron/audio/preload.ts',
  },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
});

await mkdir('dist-electron/audio', { recursive: true });
// Diretório gerado próprio: evita que ícones removidos de builds antigos sejam distribuídos.
await rm('dist-electron/assets', { recursive: true, force: true });
await mkdir('dist-electron/assets', { recursive: true });
await copyFile('shared/build.json', 'dist-electron/build.json');
for (const name of ['index.html', 'audio.js'])
  await copyFile(`electron/audio/${name}`, `dist-electron/audio/${name}`);
await copyFile('assets/desktop/complete.wav', 'dist-electron/audio/complete.wav');
for (const name of ['principal', 'tray-light', 'tray-dark'])
  await copyFile(`assets/desktop/brand/${name}.ico`, `dist-electron/assets/${name}.ico`);
