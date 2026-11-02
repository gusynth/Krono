import assert from 'node:assert/strict';
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMakeNsisPath } from 'app-builder-lib/out/toolsets/windows.js';
import { spawnAndWriteWithOutput } from 'builder-util';
import './nsis-engine.mjs';
process.env.ELECTRON_BUILDER_CACHE = resolve('.test-data/builder-cache');
const directory = resolve('.test-data/installer-policy/extraction');
await mkdir(join(directory, 'source'), { recursive: true });
await mkdir(join(directory, 'destination'), { recursive: true });
async function files(root) {
  const result = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name);
    if (item.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const cache = await files(resolve('.test-data/builder-cache'));
const plugin = cache.find((p) => /plugins[\\/]x86-unicode[\\/]nsis7z\.dll$/i.test(p));
const seven = cache.find((p) => /7za\.exe$/i.test(p));
assert.ok(plugin && seven, 'Builder resources must be cached by npm run dist');
const archive = join(directory, 'payload.7z');
await rm(archive, { force: true });
await writeFile(join(directory, 'source/payload.txt'), 'replacement');
const archived = spawnSync(seven, ['a', '-t7z', archive, 'payload.txt'], {
  cwd: join(directory, 'source'),
  windowsHide: true,
  encoding: 'utf8',
});
assert.equal(archived.status, 0, archived.stdout + archived.stderr);
const exe = join(directory, 'extract.exe'),
  driver = join(directory, 'driver.exe'),
  report = join(directory, 'result.txt');
const compiler = await getMakeNsisPath();
await spawnAndWriteWithOutput(
  compiler.path,
  [
    '-WX',
    '-INPUTCHARSET',
    'UTF8',
    `-DPROJECT_DIR=${process.cwd()}`,
    `-DKRONO_TEST_PLUGINS=${dirname(plugin)}`,
    `-DKRONO_TEST_EXE=${exe}`,
    `-DKRONO_TEST_DESTINATION=${join(directory, 'destination')}`,
    `-DKRONO_TEST_ARCHIVE=${archive}`,
    '-',
  ],
  await readFile('tests/fixtures/setup-extraction.nsi', 'utf8'),
  { env: { ...process.env, ...compiler.env } },
);
const compiled = spawnSync(
  join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  ['/nologo', '/warnaserror+', `/out:${driver}`, resolve('tests/fixtures/setup-extraction.cs')],
  { windowsHide: true, encoding: 'utf8' },
);
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const run = spawnSync(driver, [exe, join(directory, 'destination/payload.txt'), report], {
  windowsHide: true,
  timeout: 40000,
});
assert.equal(run.status, 0, await readFile(report, 'utf8'));
console.log(await readFile(report, 'utf8'));
