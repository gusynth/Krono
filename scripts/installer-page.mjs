import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMakeNsisPath } from 'app-builder-lib/out/toolsets/windows.js';
import { spawnAndWriteWithOutput } from 'builder-util';

// Somente UI/guard: a fixture não instala nem acessa registro/dados do usuário.
process.env.ELECTRON_BUILDER_CACHE = resolve('.test-data/builder-cache');
const directory = resolve('.test-data/installer-policy');
await mkdir(directory, { recursive: true });
await mkdir('artifacts/reports', { recursive: true });
const compiler = await getMakeNsisPath();
const source = await readFile('tests/fixtures/installer-legacy-page.nsi', 'utf8');
const cases = [];
for (const mode of [0, 1, 2, null]) {
  const executable = resolve(
    directory,
    mode === null ? 'legacy-preview.exe' : `legacy-guard-${mode}.exe`,
  );
  const args = [
    '-WX',
    '-INPUTCHARSET',
    'UTF8',
    `-DPROJECT_DIR=${process.cwd()}`,
    `-DKRONO_PREVIEW_EXE=${executable}`,
  ];
  if (mode !== null) args.push(`-DKRONO_TEST_MODE=${mode}`);
  const compiled = await spawnAndWriteWithOutput(compiler.path, [...args, '-'], source, {
    env: { ...process.env, ...compiler.env },
  });
  await writeFile(
    resolve(directory, `compile-${mode}.log`),
    `${compiled.stdout}\n${compiled.stderr}`,
  );
  if (mode === null) continue;
  const run = spawnSync(executable, ['/S'], { windowsHide: true, timeout: 10000 });
  assert.equal(run.error, undefined);
  assert.equal(run.status, mode === 0 ? 13 : 0);
  cases.push({ mode, exitCode: run.status });
}
await writeFile(
  'artifacts/reports/installer-page.json',
  JSON.stringify(
    {
      cases,
      scope:
        'Guard real NSIS em fixture sem instalação/registro; prévia visual compilada separadamente',
    },
    null,
    2,
  ),
);
console.log('Página compilada; 3 guardas NSIS aprovadas. Prévia isolada não foi instalada.');
