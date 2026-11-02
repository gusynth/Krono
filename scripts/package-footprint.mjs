import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { listPackage, statFile } from '@electron/asar';

const root = resolve('artifacts/packages/win-unpacked'),
  archive = join(root, 'resources/app.asar');
async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await inventory(path)));
    else if (entry.isFile())
      files.push({
        path: path.slice(root.length + 1).replaceAll('\\', '/'),
        bytes: (await stat(path)).size,
      });
  }
  return files;
}
const files = await inventory(root),
  groups = {},
  contents = [];
for (const raw of listPackage(archive)) {
  const path = raw.replace(/^[\\/]+/, ''),
    entry = statFile(archive, path);
  if (!entry.size) continue;
  const normalized = path.replaceAll('\\', '/'),
    group = normalized
      .split('/')
      .slice(0, normalized.startsWith('node_modules/') ? 2 : 1)
      .join('/');
  groups[group] = (groups[group] ?? 0) + entry.size;
  contents.push({ path: normalized, bytes: entry.size });
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const report = {
  version: pkg.version,
  unpackedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  installerBytes: (await stat(`artifacts/packages/Krono-${pkg.version}-x64.exe`)).size,
  archiveBytes: (await stat(archive)).size,
  groups,
  largestFiles: files.sort((a, b) => b.bytes - a.bytes).slice(0, 12),
  largestArchiveEntries: contents.sort((a, b) => b.bytes - a.bytes).slice(0, 12),
  meaning:
    'Logical bytes of unpacked app, not installed allocation, user data, temporary installer space or RAM',
};
await mkdir('artifacts/consolidation', { recursive: true });
await writeFile('artifacts/consolidation/package-footprint.json', JSON.stringify(report, null, 2));
if (!process.argv.includes('--baseline')) {
  assert.ok(
    report.unpackedBytes < 350 * 1024 ** 2,
    'Application exceeded 350 MiB diagnostic budget',
  );
  assert.ok(
    report.installerBytes < 120 * 1024 ** 2,
    'Installer exceeded 120 MiB diagnostic budget',
  );
  assert.ok(report.archiveBytes < 16 * 1024 ** 2, 'ASAR exceeded 16 MiB diagnostic budget');
  assert.ok(
    !contents.some((file) =>
      /\.map$|node_modules\/(?:lucide-react|react-dom|framer-motion|node-addon-api)\/|better-sqlite3\/(?:deps|src)\/|prebuilds\/(?:linux|darwin|win32-arm64)/.test(
        file.path,
      ),
    ),
    'Development/source/foreign native files shipped',
  );
  for (const path of ['lib/index.js', 'lib/binding.js', 'prebuilds/win32-x64.node', 'LICENSE'])
    assert.ok(
      contents.some((file) => file.path === `node_modules/better-sqlite3/${path}`),
      `Missing SQLite runtime: ${path}`,
    );
  for (const name of [
    'Krono.exe',
    'icudtl.dat',
    'resources.pak',
    'LICENSE.electron.txt',
    'LICENSES.chromium.html',
    'chrome_100_percent.pak',
    'chrome_200_percent.pak',
    'd3dcompiler_47.dll',
    'dxcompiler.dll',
    'dxil.dll',
    'ffmpeg.dll',
    'vk_swiftshader.dll',
    'vulkan-1.dll',
    'snapshot_blob.bin',
    'v8_context_snapshot.bin',
    'locales/pt-BR.pak',
    'locales/en-US.pak',
  ])
    assert.ok(
      files.some((file) => file.path === name),
      `Missing runtime/license: ${name}`,
    );
  assert.equal(
    files.filter((file) => file.path.startsWith('locales/')).length,
    2,
    'Unexpected packaged translations',
  );
  for (const name of [
    'react',
    'react-dom',
    'scheduler',
    'lucide-react',
    'motion',
    'framer-motion',
    'motion-dom',
    'motion-utils',
    'tslib',
    'zod',
    'node-addon-api',
    'better-sqlite3',
  ])
    assert.ok(
      contents.some((file) => file.path === `dist/licenses/dependencies/${name}.txt`),
      `Missing dependency license: ${name}`,
    );
}
console.log(JSON.stringify(report, null, 2));
export default report;
