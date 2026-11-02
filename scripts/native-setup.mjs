import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, stat, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { UUID } from 'builder-util-runtime';

const preview = process.argv.includes('--preview');
const generated = resolve('.test-data/generated/setup');
await mkdir(generated, { recursive: true });
await mkdir(resolve('.test-data/installer-policy'), { recursive: true });
const build = JSON.parse(await readFile('shared/build.json', 'utf8')).number;
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const final = resolve(`artifacts/packages/Krono-${pkg.version}-x64.exe`);
const engine = join(generated, 'Krono.Engine.exe');
if (!preview) await copyFile(final, engine);
async function hash(path) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}
const engineHash = preview ? '' : await hash(engine);
const removeEngine = join(generated, 'Krono.Remove.exe');
const removeHash = preview ? '' : await hash(removeEngine);
assert.equal(
  await hash('build/setup/InterVariable.ttf'),
  '4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf',
);
const identity = join(generated, 'Identity.cs');
const guid =
  pkg.build.nsis.guid ??
  UUID.v5(pkg.build.appId, UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'));
await writeFile(
  identity,
  `using System.Reflection;\n[assembly:AssemblyTitle("Krono")][assembly:AssemblyProduct("Krono")][assembly:AssemblyCompany("gusynth")][assembly:AssemblyVersion("${pkg.version}.0")][assembly:AssemblyFileVersion("${pkg.version}.0")]\nnamespace Krono.Setup { internal static class Identity { public const string Version="${pkg.version}", Build="${build}", EngineSha256="${engineHash}", RemoveSha256="${removeHash}", InstallKey=@"Software\\${guid}", UninstallKey=@"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}"; } }`,
);
const output = preview
  ? resolve('.test-data/installer-policy/Krono.Setup.Preview.exe')
  : join(generated, 'Krono.Setup.exe');
const compiler = join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const sources = [
  'build/setup/Policy.cs',
  'build/setup/Consent.cs',
  'build/setup/Experience.cs',
  'build/setup/Controls.cs',
  'build/setup/Scene.cs',
  'build/setup/SetupForm.cs',
  'build/setup/Program.cs',
  identity,
  preview ? 'tests/fixtures/setup-preview.cs' : 'build/setup/Host.cs',
];
const resources = [
  ['assets/desktop/brand/source.png', 'logo'],
  ['assets/desktop/brand/principal.ico', 'icon'],
  ['build/setup/InterVariable.ttf', 'font'],
  ['public/licenses/Inter.txt', 'font-license'],
];
if (!preview) resources.push([engine, 'engine'], [removeEngine, 'remove-engine']);
const args = [
  '/nologo',
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  '/warnaserror+',
  '/utf8output',
  `/out:${output}`,
  `/win32manifest:${resolve('build/setup/setup.manifest')}`,
  `/win32icon:${resolve('assets/desktop/brand/principal.ico')}`,
  '/r:System.Windows.Forms.dll',
  '/r:System.Drawing.dll',
  '/r:System.Core.dll',
  ...resources.map(([path, name]) => `/resource:${resolve(path)},${name}`),
  ...sources.map((path) => resolve(path)),
];
if (preview) args.push('/define:KRONO_PREVIEW');
const run = spawnSync(compiler, args, { encoding: 'utf8', windowsHide: true, timeout: 120000 });
assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
if (preview) {
  const test = spawnSync(
    output,
    ['--self-test', resolve('.test-data/installer-policy/native-tests')],
    { encoding: 'utf8', windowsHide: true, timeout: 60000 },
  );
  assert.equal(test.status, 0, 'Native policy test failed');
  if (process.argv.includes('--live-test')) {
    const report = resolve('.test-data/installer-policy/native-tests/live.txt');
    const live = spawnSync(output, ['--live-test', report], { windowsHide: true, timeout: 20000 });
    assert.equal(live.status, 0, await readFile(report, 'utf8'));
    console.log(await readFile(report, 'utf8'));
  }
  for (const name of ['Legacy', 'Downgrade'])
    await copyFile(output, resolve(`.test-data/installer-policy/Krono.Setup.${name}.Preview.exe`));
  console.log(await readFile('.test-data/installer-policy/native-tests/policy.txt', 'utf8'));
} else {
  const probe = join(generated, 'setup-package-probe.exe');
  const compiled = spawnSync(
    compiler,
    ['/nologo', '/warnaserror+', `/out:${probe}`, resolve('tests/fixtures/setup-package-probe.cs')],
    { windowsHide: true, encoding: 'utf8' },
  );
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  // Carrega metadados/recursos da assembly; não invoca Main, UI ou NativeHost.
  const inspected = spawnSync(
    probe,
    [output, engineHash, removeHash, await hash('assets/desktop/brand/source.png')],
    { windowsHide: true, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
  await copyFile(output, final);
  // Metadados de atualização do engine não descrevem o setup externo; não distribuir.
  await rm(final + '.blockmap', { force: true });
  await rm(resolve('artifacts/packages/latest.yml'), { force: true });
  const info = {
    version: pkg.version,
    buildNumber: build,
    engineSha256: engineHash,
    removeSha256: removeHash,
    engineBytes: (await stat(engine)).size,
    removeBytes: (await stat(removeEngine)).size,
    setupSha256: await hash(output),
    setupBytes: (await stat(output)).size,
    stack: 'WinForms on Windows 11 .NET Framework + embedded NSIS; no bundled CLR/Electron/WebView',
    previewShipped: false,
    resourceProbe: inspected.stdout.trim(),
  };
  await writeFile('artifacts/packages/native-setup.json', JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
}
