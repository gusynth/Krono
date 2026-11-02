import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMakeNsisPath } from 'app-builder-lib/out/toolsets/windows.js';
import { spawnAndWriteWithOutput } from 'builder-util';
import './build-identity.mjs';

process.env.ELECTRON_BUILDER_CACHE = resolve('.test-data/builder-cache');
const directory = resolve('.test-data/installer-policy');
await mkdir(directory, { recursive: true });
const nsis = join(directory, 'consent-client.exe'),
  server = join(directory, 'consent-tests.exe'),
  report = join(directory, 'consent-result.txt');
const pkg = JSON.parse(await readFile('package.json', 'utf8')),
  build = JSON.parse(await readFile('shared/build.json', 'utf8')).number;
const identity = join(directory, 'consent-identity.cs');
await writeFile(
  identity,
  `namespace Krono.Setup { internal static class Identity { public const string Version="${pkg.version}", Build="${build}"; } }`,
);
const compiler = await getMakeNsisPath();
await spawnAndWriteWithOutput(
  compiler.path,
  [
    '-WX',
    '-INPUTCHARSET',
    'UTF8',
    `-DVERSION=${pkg.version}`,
    `-DPROJECT_DIR=${process.cwd()}`,
    `-DKRONO_CONSENT_EXE=${nsis}`,
    '-',
  ],
  await readFile('tests/fixtures/setup-consent.nsi', 'utf8'),
  { env: { ...process.env, ...compiler.env } },
);
const csharp = join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const compiled = spawnSync(
  csharp,
  [
    '/nologo',
    '/warnaserror+',
    `/out:${server}`,
    '/r:System.Core.dll',
    ...['build/setup/Consent.cs', identity, 'tests/fixtures/setup-consent.cs'].map((p) =>
      resolve(p),
    ),
  ],
  { windowsHide: true, encoding: 'utf8' },
);
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const run = spawnSync(server, [nsis, report], { windowsHide: true, timeout: 60000 });
assert.equal(run.status, 0, await readFile(report, 'utf8'));
console.log(await readFile(report, 'utf8'));
