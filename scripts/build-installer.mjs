import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { build, Platform, Arch } from 'electron-builder';
import { NsisTarget } from 'app-builder-lib/out/targets/nsis/NsisTarget.js';

// Adaptador somente deste processo de build, para a versão fixada. Não altera
// dependências em disco e conserva geração/empacotamento padrão do desinstalador.
process.env.ELECTRON_BUILDER_CACHE = resolve('.test-data/builder-cache');
const version = JSON.parse(
  await readFile('node_modules/app-builder-lib/package.json', 'utf8'),
).version;
assert.equal(version, '26.15.3', 'Review the NSIS adapter before changing builder');
const upstream = (
  await readFile('node_modules/app-builder-lib/templates/nsis/installer.nsi', 'utf8')
).replaceAll('\r\n', '\n');
const safe = await readFile('.test-data/generated/nsis/installer.nsi', 'utf8');
const original = NsisTarget.prototype.computeFinalScript;
assert.equal(original.length, 3, 'NSIS builder API changed');
const seen = new Set();
await mkdir('.test-data/generated/setup', { recursive: true });
const originalMakensis = NsisTarget.prototype.executeMakensis;
let capturedUninstaller = false;
NsisTarget.prototype.executeMakensis = async function (defines, ...args) {
  if (!('BUILD_UNINSTALLER' in defines) && defines.UNINSTALLER_OUT_FILE) {
    await copyFile(defines.UNINSTALLER_OUT_FILE, '.test-data/generated/setup/Krono.Remove.exe');
    capturedUninstaller = true;
  }
  return originalMakensis.call(this, defines, ...args);
};
NsisTarget.prototype.computeFinalScript = async function (source, isInstaller, archs) {
  assert.equal(this.options.script, undefined);
  assert.equal(source.replaceAll('\r\n', '\n'), upstream, 'Unexpected installer source');
  seen.add(isInstaller);
  return original.call(this, safe, isInstaller, archs);
};
try {
  await build({ targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never' });
  assert.ok(
    seen.has(false) && seen.has(true),
    'Both standard uninstaller and installer must be built',
  );
  assert.ok(
    capturedUninstaller,
    'The same verified uninstaller must be available to the maintenance UI',
  );
} finally {
  NsisTarget.prototype.computeFinalScript = original;
  NsisTarget.prototype.executeMakensis = originalMakensis;
}
