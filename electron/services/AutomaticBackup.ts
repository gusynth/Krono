import { mkdir, lstat, realpath, readdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { backupSummarySchema, type BackupSummary } from '../../shared/contracts/backup';
const owned = /^auto-(\d{13})-[a-f0-9-]{36}\.krono-backup$/;
/** Cópias automáticas separadas dos backups anteriores a restaurações. */
export class AutomaticBackup {
  private busy = false;
  private error: string | null = null;
  constructor(
    private root: string,
    private copy: (path: string, now: number) => Promise<unknown>,
    private validate: (path: string) => Promise<BackupSummary>,
    private now = () => Date.now(),
  ) {}
  async directory() {
    const folder = join(this.root, 'automatic-backups');
    await mkdir(folder, { recursive: true });
    if (
      (await lstat(folder)).isSymbolicLink() ||
      (await realpath(folder)) !== join(await realpath(this.root), 'automatic-backups')
    )
      throw new Error('BACKUP_DIRECTORY_UNSAFE');
    return folder;
  }
  private async entries() {
    const folder = await this.directory();
    return (await readdir(folder))
      .filter((name) => owned.test(name))
      .sort()
      .map((name) => ({ name, path: join(folder, name), time: Number(name.match(owned)![1]) }));
  }
  async status() {
    try {
      const files = await this.entries();
      return { lastBackupUtcMs: files.at(-1)?.time ?? null, error: this.error };
    } catch {
      return { lastBackupUtcMs: null, error: 'Não foi possível consultar os backups automáticos.' };
    }
  }
  async run() {
    if (this.busy) return;
    this.busy = true;
    let temporary: string | null = null;
    try {
      const files = await this.entries(),
        now = this.now();
      if (files.at(-1) && now - files.at(-1)!.time < 86_400_000) return;
      const folder = await this.directory();
      // Recuperar somente temporários próprios abandonados há mais de um dia.
      for (const name of await readdir(folder)) {
        if (!/^pending-[a-f0-9-]{36}\.tmp$/.test(name)) continue;
        const path = join(folder, name),
          info = await lstat(path);
        if (info.isFile() && !info.isSymbolicLink() && now - info.mtimeMs > 86_400_000)
          await rm(path);
      }
      temporary = join(folder, `pending-${randomUUID()}.tmp`);
      const handle = await open(temporary, 'wx');
      await handle.close();
      await this.copy(temporary, now);
      const summary = backupSummarySchema.parse(await this.validate(temporary));
      if (Math.max(summary.bytes, (await lstat(temporary)).size) > 128 * 1024 * 1024)
        throw new Error('AUTOMATIC_BACKUP_SIZE_LIMIT');
      const destination = join(
        folder,
        `auto-${String(now).padStart(13, '0')}-${randomUUID()}.krono-backup`,
      );
      await rename(temporary, destination);
      temporary = null;
      this.error = null;
      const retained = await this.entries();
      let total = 0;
      const sizes = [];
      for (const entry of retained) {
        const info = await lstat(entry.path);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('BACKUP_FILE_UNSAFE');
        sizes.push(info.size);
        total += info.size;
      }
      for (
        let i = 0;
        i < retained.length - 1 && (retained.length - i > 7 || total > 256 * 1024 * 1024);
        i++
      ) {
        await rm(retained[i]!.path);
        total -= sizes[i]!;
      }
    } catch {
      this.error =
        'O backup automático não foi concluído. Seus registros atuais foram preservados.';
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => undefined);
      this.busy = false;
    }
  }
}
