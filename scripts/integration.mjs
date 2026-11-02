import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import electron from 'electron';
import { resolve } from 'node:path';
mkdirSync('artifacts/reports', { recursive: true });
await build({
  entryPoints: ['tests/integration/storage.ts'],
  outfile: '.test-data/integration.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'better-sqlite3'],
});
await build({
  entryPoints: ['tests/integration/storage-worker.ts'],
  outfile: '.test-data/storage-worker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['better-sqlite3'],
});
await build({
  entryPoints: ['tests/integration/restore-crash-worker.ts'],
  outfile: '.test-data/restore-crash-worker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['better-sqlite3'],
});
await build({
  entryPoints: ['tests/integration/rescue-crash-worker.ts'],
  outfile: '.test-data/rescue-crash-worker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['better-sqlite3'],
});
const packaged = process.argv.includes('--packaged');
const result = spawnSync(
  packaged ? resolve('artifacts/packages/win-unpacked/Krono.exe') : electron,
  ['.test-data/integration.cjs'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...(packaged
        ? {
            KRONO_PACKAGED_WORKER: resolve(
              'artifacts/packages/win-unpacked/resources/app.asar/dist-electron/worker.cjs',
            ),
          }
        : {}),
    },
  },
);
process.exitCode = result.status ?? 1;
