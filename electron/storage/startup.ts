import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
async function info(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
const requireSafe = (value: unknown) => {
  if (!value) throw new Error('STORAGE_FILES_UNAVAILABLE');
};
export async function assertStoragePresent(root: string) {
  const folder = await lstat(root);
  requireSafe(folder.isDirectory() && !folder.isSymbolicLink());
  const known = !!(
    (await info(join(root, 'data-initialized'))) ||
    (await info(join(root, 'staging'))) ||
    (await info(join(root, 'backups'))) ||
    (await info(join(root, 'rescue')))
  );
  const data = join(root, 'data'),
    directory = await info(data);
  if (!directory) {
    requireSafe(!known);
    return;
  }
  requireSafe(directory.isDirectory() && !directory.isSymbolicLink());
  const db = await info(join(data, 'krono.sqlite'));
  if (db) {
    requireSafe(db.isFile() && !db.isSymbolicLink() && db.nlink === 1 && db.size > 0);
    return;
  }
  requireSafe(
    !known &&
      !(await readdir(data)).some((name) =>
        ['krono.sqlite-wal', 'krono.sqlite-shm', 'krono.sqlite-journal'].includes(name),
      ),
  );
}
export async function markStorageInitialized(root: string) {
  const path = join(root, 'data-initialized');
  if (await info(path)) return;
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile('Krono data v1\n');
    await file.sync();
  } finally {
    await file.close();
  }
}
