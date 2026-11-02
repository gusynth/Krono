import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMakeNsisPath } from 'app-builder-lib/out/toolsets/windows.js';
import { spawnAndWriteWithOutput } from 'builder-util';

// Executável de prova pura, sem funções de instalação, registro ou preferências.
process.env.ELECTRON_BUILDER_CACHE = resolve('.test-data/builder-cache');
const directory = resolve('.test-data/installer-policy');
await mkdir(directory, { recursive: true });
await mkdir('artifacts/reports', { recursive: true });
const executable = resolve(directory, 'policy-fixture.exe'),
  report = resolve(directory, 'policy-result.txt');
const compiler = await getMakeNsisPath();
const compiled = await spawnAndWriteWithOutput(
  compiler.path,
  [
    '-WX',
    '-INPUTCHARSET',
    'UTF8',
    `-DKRONO_FIXTURE_EXE=${executable}`,
    `-DKRONO_FIXTURE_REPORT=${report}`,
    `-DKRONO_POLICY_HEADER=${resolve('build/version-policy.nsh')}`,
    '-',
  ],
  await readFile('tests/fixtures/installer-policy.nsi', 'utf8'),
  { cwd: process.cwd(), env: { ...process.env, ...compiler.env } },
);
await writeFile(
  'artifacts/reports/installer-policy-compile.log',
  `${compiled.stdout}\n${compiled.stderr}`,
);
await rm(report, { force: true });
const run = spawnSync(executable, [], { windowsHide: true, timeout: 30000 });
assert.equal(run.error, undefined);
assert.equal(run.status, 0);
const result = (await readFile(report, 'utf8')).trim();
assert.equal(result, 'passed: 44 cases');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const evidence = {
  result: 'passed',
  cases: 44,
  compiler: compiler.path,
  scope:
    'Pure NSIS version/build classification; no install/uninstall, registry, personal data or host preferences accessed',
  version: pkg.version,
};
await writeFile('artifacts/reports/installer-policy.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
