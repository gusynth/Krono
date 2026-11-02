import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractFile, listPackage } from '@electron/asar';
import { candidateInputChanges } from './candidate-inputs.mjs';

const manifest = resolve('artifacts/packages/private-candidate.json');
await rm(manifest, { force: true });
if (process.argv.includes('--invalidate')) process.exit(0);
const { default: footprint } = await import('./package-footprint.mjs');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(
  pkg.version,
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  'Version must be a stable SemVer',
);
assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
assert.equal(pkg.build.nsis.include, 'build/installer.nsh');
assert.equal(pkg.build.nsis.script, undefined, 'Keep the standard builder uninstaller pipeline');
const directory = resolve('artifacts/packages'),
  exe = resolve(directory, 'win-unpacked/Krono.exe'),
  installer = resolve(directory, `Krono-${pkg.version}-x64.exe`),
  asar = resolve(directory, 'win-unpacked/resources/app.asar');
const shipped = JSON.parse(extractFile(asar, 'package.json').toString());
const buildIdentity = JSON.parse(await readFile('shared/build.json', 'utf8'));
const nativeSetup = JSON.parse(await readFile('artifacts/packages/native-setup.json', 'utf8'));
assert.equal(nativeSetup.version, pkg.version);
assert.equal(nativeSetup.buildNumber, buildIdentity.number);
assert.equal(
  nativeSetup.setupSha256,
  createHash('sha256')
    .update(await readFile(installer))
    .digest('hex'),
);
assert.deepEqual(
  JSON.parse(extractFile(asar, 'dist-electron/build.json').toString()),
  buildIdentity,
);
assert.equal(shipped.version, pkg.version);
assert.equal(shipped.name, pkg.name);
assert.ok(
  !listPackage(asar).some((path) =>
    /test-data|fixtures|performance-harness|sandbox-native/.test(path),
  ),
);
await mkdir('.test-data', { recursive: true });
const probe = resolve('.test-data/candidate-metadata.ps1');
await writeFile(
  probe,
  `param([string]$AppExe, [string]$InstallerExe)
$ErrorActionPreference = 'Stop'
$result = foreach ($path in @($AppExe, $InstallerExe)) {
  $info = (Get-Item -LiteralPath $path).VersionInfo
  $signature = Get-AuthenticodeSignature -LiteralPath $path
  [pscustomobject]@{ path = $path; fileVersion = $info.FileVersion; productVersion = $info.ProductVersion; productName = $info.ProductName; signature = [string]$signature.Status }
}
$result | ConvertTo-Json -Depth 3
`,
);
// PowerShell 7 pode deixar seu PSModulePath no processo pai; o probe usa o 5.1 do Windows.
// Restringir somente o ambiente deste filho evita carregar módulos incompatíveis do 7.
const metadataEnv = {
  ...process.env,
  PSModulePath: [
    resolve(process.env.ProgramFiles, 'WindowsPowerShell/Modules'),
    resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules'),
  ].join(';'),
};
const metadataRun = spawnSync('powershell.exe', ['-NoProfile', '-File', probe, exe, installer], {
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30000,
  env: metadataEnv,
});
assert.equal(metadataRun.status, 0, metadataRun.stderr);
const metadata = JSON.parse(metadataRun.stdout.replace(/^\uFEFF/, ''));
for (const item of metadata) {
  assert.ok(
    [pkg.version, `${pkg.version}.0`].includes(item.fileVersion),
    `Unexpected PE version: ${item.fileVersion}`,
  );
  assert.ok(
    [pkg.version, `${pkg.version}.0`].includes(item.productVersion),
    `Unexpected product version: ${item.productVersion}`,
  );
  assert.equal(item.productName, 'Krono');
}
const git = (args) => {
  const run = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0);
  return run.stdout.trim();
};
const sourceChanges = candidateInputChanges();
const artifacts = [];
for (const path of [exe, installer, asar]) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  artifacts.push({ path, bytes: (await stat(path)).size, sha256: hash.digest('hex') });
}
const sourceHead = git(['rev-parse', 'HEAD']);
const brandIcons = [];
for (const name of ['principal', 'tray-light', 'tray-dark']) {
  const file = join('dist-electron', 'assets', `${name}.ico`),
    source = await readFile(`assets/desktop/brand/${name}.ico`);
  assert.ok(extractFile(asar, file).equals(source), `Packaged icon mismatch: ${name}`);
  brandIcons.push({ name, sha256: createHash('sha256').update(source).digest('hex') });
}
const result = {
  version: pkg.version,
  buildNumber: buildIdentity.number,
  createdAt: new Date().toISOString(),
  sourceHead,
  confirmedSourceCommit: sourceChanges ? null : sourceHead,
  uncommittedBuildInputs: sourceChanges.split('\n').filter(Boolean),
  lockfileSha256: createHash('sha256')
    .update(await readFile('package-lock.json'))
    .digest('hex'),
  artifacts,
  metadata,
  brandIcons,
  nativeSetup,
  footprint,
  release: 'blocked',
  limitations: [
    'Private unsigned candidate; not installed or published',
    'Native installer/data preservation, DPI, screen reader, audio/toast and power gates pending',
  ],
};
await writeFile(manifest, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    manifest,
    confirmedSourceCommit: result.confirmedSourceCommit,
    release: result.release,
    artifacts,
  }),
);
