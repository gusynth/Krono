import { it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { assertStoragePresent, markStorageInitialized } from '../../electron/storage/startup';
async function profile() {
  await mkdir('.test-data', { recursive: true });
  return mkdtemp(resolve('.test-data/startup-unit-'));
}
it('somente perfil novo limpo admite bootstrap; base existente vazia é falha mesmo sem marcador legado', async () => {
  const root = await profile();
  await expect(assertStoragePresent(root)).resolves.toBeUndefined();
  await mkdir(join(root, 'data'));
  await expect(assertStoragePresent(root)).resolves.toBeUndefined();
  await writeFile(join(root, 'data/krono.sqlite'), '');
  await expect(assertStoragePresent(root)).rejects.toThrow('STORAGE_FILES_UNAVAILABLE');
  expect(await readFile(join(root, 'data/krono.sqlite'), 'utf8')).toBe('');
});
it('marcador de perfil conhecido impede bootstrap ausente; sidecar órfão também', async () => {
  const root = await profile();
  await markStorageInitialized(root);
  await markStorageInitialized(root);
  await expect(assertStoragePresent(root)).rejects.toThrow('STORAGE_FILES_UNAVAILABLE');
  const fresh = await profile();
  await mkdir(join(fresh, 'data'));
  await writeFile(join(fresh, 'data/krono.sqlite-wal'), 'synthetic');
  await expect(assertStoragePresent(fresh)).rejects.toThrow('STORAGE_FILES_UNAVAILABLE');
  expect(await readFile(join(fresh, 'data/krono.sqlite-wal'), 'utf8')).toBe('synthetic');
});
