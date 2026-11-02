import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMakeNsisPath } from 'app-builder-lib/out/toolsets/windows.js';
import { spawnAndWriteWithOutput } from 'builder-util';
import './nsis-engine.mjs';
process.env.ELECTRON_BUILDER_CACHE = resolve('.test-data/builder-cache');
const directory = resolve('.test-data/installer-policy/removal');
await mkdir(directory, { recursive: true });
const source = await readFile('.test-data/generated/nsis/uninstaller.nsh', 'utf8');
const install = await readFile('.test-data/generated/nsis/installSection.nsh', 'utf8');
assert.ok(
  install.includes('SetOutPath $TEMP\n!insertmacro uninstallOldVersion SHELL_CONTEXT'),
  'Parent must release install directory before the old uninstaller runs',
);
const block = source.match(
  / {4}ClearErrors\n {4}RMDir \/r \$INSTDIR\n {4}\$\{If\} \$\{Errors\}\n {6}SetErrorLevel 1603\n {6}Quit\n {4}\$\{EndIf\}/g,
);
assert.equal(
  block?.length,
  1,
  'Test must execute the exact guarded removal block from the production engine',
);
const include = join(directory, 'removal.nsh');
await writeFile(include, block[0]);
const generator = join(directory, 'generator.exe'),
  remover = join(directory, 'remove.exe'),
  target = join(directory, 'Krono'),
  report = join(directory, 'result.txt'),
  driver = join(directory, 'driver.exe');
const compiler = await getMakeNsisPath();
await spawnAndWriteWithOutput(
  compiler.path,
  [
    '-WX',
    '-INPUTCHARSET',
    'UTF8',
    `-DKRONO_GENERATOR=${generator}`,
    `-DKRONO_REMOVER=${remover}`,
    `-DKRONO_TARGET=${target}`,
    `-DKRONO_REMOVE_BLOCK=${include}`,
    '-',
  ],
  await readFile('tests/fixtures/setup-removal.nsi', 'utf8'),
  { env: { ...process.env, ...compiler.env } },
);
const compiled = spawnSync(
  join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  ['/nologo', '/warnaserror+', `/out:${driver}`, resolve('tests/fixtures/setup-removal.cs')],
  { windowsHide: true, encoding: 'utf8' },
);
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const run = spawnSync(driver, [generator, remover, target, report], {
  windowsHide: true,
  timeout: 40000,
});
assert.equal(run.status, 0, await readFile(report, 'utf8'));
console.log(await readFile(report, 'utf8'));
