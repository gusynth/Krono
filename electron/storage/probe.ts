import { copyFile, lstat, mkdir, mkdtemp, rm, rmdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { openDatabase } from './database';
import { timerRepository } from './timer-repository';
import { desktopRepository } from './desktop-repository';

/** SQLite só verifica a cópia. Se falhar, não abre nem normaliza os originais. */
export async function probeStorage(path: string): Promise<() => Promise<void>> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return async () => {};
    throw error;
  }
  const root = await mkdtemp(join(resolve(dirname(path), '..'), 'storage-probe-'));
  const raw = join(root, 'raw'),
    check = join(root, 'check');
  await mkdir(raw);
  await mkdir(check);
  const name = basename(path),
    suffixes = ['', '-wal', '-shm', '-journal'];
  for (const suffix of suffixes) {
    const source = `${path}${suffix}`;
    let value;
    try {
      value = await lstat(source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1)
      throw new Error('STORAGE_LINK_REFUSED');
    await copyFile(source, join(raw, `${name}${suffix}`), constants.COPYFILE_EXCL);
    await copyFile(
      join(raw, `${name}${suffix}`),
      join(check, `${name}${suffix}`),
      constants.COPYFILE_EXCL,
    );
  }
  const db = openDatabase(join(check, name));
  try {
    if (
      db.pragma('quick_check', { simple: true }) !== 'ok' ||
      (db.pragma('foreign_key_check') as unknown[]).length
    )
      throw new Error('STORAGE_INTEGRITY_FAILED');
    timerRepository(db).load();
    desktopRepository(db).preferences();
  } finally {
    db.close();
  }
  // Só o caller confirma a limpeza, depois de conseguir abrir a base real.
  return async () => {
    for (const dir of [raw, check]) {
      for (const suffix of suffixes) await rm(join(dir, `${name}${suffix}`), { force: true });
      await rmdir(dir);
    }
    await rmdir(root);
  };
}
