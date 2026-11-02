// Inspeção somente de leitura dos recursos PE; não executa o instalador.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { extractFile, listPackage } from '@electron/asar';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const source = await readFile('assets/desktop/brand/principal.ico');
const expected = Data.IconFile.from(source).icons.map((icon) => ({
  width: icon.data.width,
  sha256: hash(Buffer.from(icon.data.bin)),
}));
const executables = [];
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const path of [
  'artifacts/packages/win-unpacked/Krono.exe',
  `artifacts/packages/Krono-${pkg.version}-x64.exe`,
  '.test-data/generated/setup/Krono.Remove.exe',
]) {
  const resources = NtExecutableResource.from(
    NtExecutable.from(await readFile(path), { ignoreCert: true }),
  );
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  const icons = groups
    .flatMap((group) => group.getIconItemsFromEntries(resources.entries))
    .map((icon) => ({ width: icon.width, sha256: hash(Buffer.from(icon.bin)) }));
  for (const expectedIcon of expected)
    assert.ok(
      icons.some((icon) => icon.sha256 === expectedIcon.sha256),
      `Missing ${expectedIcon.width}px icon in ${path}`,
    );
  executables.push({ path, result: 'passed', matchedFrames: expected.length });
}
const asar = 'artifacts/packages/win-unpacked/resources/app.asar';
for (const kind of ['principal', 'tray-light', 'tray-dark'])
  assert.equal(
    hash(extractFile(asar, join('dist-electron', 'assets', `${kind}.ico`))),
    hash(await readFile(`assets/desktop/brand/${kind}.ico`)),
    `Stale runtime icon: ${kind}`,
  );
assert.ok(
  !listPackage(asar).some((path) => /tray-timer|kronos-wordmark|k_logo_|kronos_logo/.test(path)),
  'Legacy icon shipped',
);
await mkdir('artifacts/brand-icons', { recursive: true });
const report = {
  executables,
  principalSourceSha256: hash(await readFile('assets/desktop/brand/source.png')),
  minimalSourceSha256: hash(await readFile('assets/desktop/brand/source.png')),
  icoSha256: hash(source),
  installed: false,
  published: false,
};
await writeFile('artifacts/brand-icons/pe-icons.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
