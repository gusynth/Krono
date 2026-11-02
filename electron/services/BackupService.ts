import { copyFile, mkdir, rm, rename, realpath, stat, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname, basename, relative, isAbsolute, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  backupSummarySchema,
  restoreRequestSchema,
  type BackupReply,
  type BackupSummary,
} from '../../shared/contracts/backup';
import type { TimerService } from './TimerService';

export interface BackupPorts {
  save: () => Promise<string | null>;
  choose: () => Promise<string | null>;
  validate: (path: string) => Promise<BackupSummary>;
  restart: () => Promise<void>;
  canRescue?: () => boolean;
  rescue?: (path: string, digest: string) => Promise<'restored' | 'uncertain'>;
}
type Request = (type: string, value?: unknown) => Promise<unknown>;
const reply = (
  code: BackupReply['code'],
  summary: BackupSummary | null = null,
  token: string | null = null,
): BackupReply => ({ code, summary, token });
export class BackupService {
  private busy = false;
  private terminal = false;
  private staged: {
    path: string;
    token: string;
    summary: BackupSummary;
    expires: number;
    rescue: boolean;
  } | null = null;
  constructor(
    private dataRoot: string,
    private request: Request,
    private timer: TimerService,
    private ports: BackupPorts,
    private now = () => Date.now(),
  ) {}
  private async run(work: () => Promise<BackupReply>): Promise<BackupReply> {
    if (this.busy || this.terminal) return reply('busy');
    this.busy = true;
    try {
      return await work();
    } catch {
      return reply('error');
    } finally {
      this.busy = false;
    }
  }
  private async removeStage(path: string) {
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await rm(`${path}${suffix}`, { force: true });
  }
  private async clearStage() {
    const previous = this.staged;
    this.staged = null;
    if (previous) await this.removeStage(previous.path);
  }
  async cleanStaging() {
    const dir = join(this.dataRoot, 'staging');
    await mkdir(dir, { recursive: true });
    for (const name of await readdir(dir))
      if (
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.krono-backup(?:-wal|-shm|-journal)?$/.test(
          name,
        )
      )
        await rm(join(dir, name), { force: true });
  }
  async cancel() {
    if (!this.busy && !this.terminal) await this.clearStage();
  }
  private async privatePath(folder: 'staging' | 'backups') {
    const dir = join(this.dataRoot, folder);
    await mkdir(dir, { recursive: true });
    return join(dir, `${randomUUID()}.krono-backup`);
  }
  export() {
    return this.run(async () => {
      const destination = await this.ports.save();
      if (!destination) return reply('canceled');
      // Não sobrescrever banco/perfil do próprio app, nem aceitar extensão SQLite.
      const parent = await realpath(dirname(destination)),
        root = await realpath(this.dataRoot),
        relation = relative(root, join(parent, basename(destination)));
      const outside = relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation);
      if (extname(destination).toLowerCase() !== '.krono-backup' || !outside)
        return reply('invalid');
      const temporary = join(parent, `.krono-${randomUUID()}.tmp`);
      try {
        const handle = await open(temporary, 'wx');
        await handle.close();
        await this.request('backup:copy', { path: temporary, now: this.now() });
        const summary = backupSummarySchema.parse(await this.ports.validate(temporary));
        await rename(temporary, destination);
        return reply('saved', summary);
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }
  inspect() {
    return this.run(async () => {
      await this.clearStage();
      const source = await this.ports.choose();
      if (!source) return reply('canceled');
      const info = await stat(source);
      if (!info.isFile() || info.size > 512 * 1024 * 1024) return reply('invalid');
      const path = await this.privatePath('staging');
      try {
        await copyFile(source, path, constants.COPYFILE_EXCL);
        let summary: BackupSummary;
        try {
          summary = backupSummarySchema.parse(await this.ports.validate(path));
        } catch {
          return reply('invalid');
        }
        const token = randomUUID(),
          rescue = this.ports.canRescue?.() === true;
        this.staged = { path, token, summary, expires: this.now() + 10 * 60_000, rescue };
        return { ...reply('inspected', summary, token), rescue };
      } finally {
        if (this.staged?.path !== path) await this.removeStage(path);
      }
    });
  }
  restore(input: unknown) {
    return this.run(async () => {
      const parsed = restoreRequestSchema.safeParse(input),
        staged = this.staged;
      if (
        !parsed.success ||
        !staged ||
        parsed.data.token !== staged.token ||
        this.now() >= staged.expires
      ) {
        await this.clearStage();
        return reply('invalid');
      }
      if (staged.rescue) {
        if (!parsed.data.rescue || !this.ports.canRescue?.() || !this.ports.rescue)
          return reply('invalid');
        let result: 'restored' | 'uncertain' = 'uncertain';
        const done = await this.timer.rescueWhenUnavailable(async () => {
          result = await this.ports.rescue!(staged.path, staged.summary.digest);
        });
        if (!done) return reply('error');
        this.terminal = true;
        await this.clearStage().catch(() => undefined);
        await this.ports.restart().catch(() => undefined);
        return { ...reply(result, staged.summary), rescue: true };
      }
      if (parsed.data.rescue) return reply('invalid');
      if (this.timer.read().state === 'storage-error') return reply('error');
      let uncertain = false;
      const restored = await this.timer.restoreWhenIdle(async () => {
        const previousPath = await this.privatePath('backups');
        try {
          await this.request('backup:restore', {
            path: staged.path,
            digest: staged.summary.digest,
            previousPath,
            now: this.now(),
          });
        } catch (error) {
          const status = (await this.request('backup:status').catch(() => null)) as {
            restored?: boolean;
          } | null;
          if (status?.restored === false) throw error;
          // ACK perdido: confirmar no writer ou reiniciar conservadoramente se ele morreu.
          if (status?.restored !== true) uncertain = true;
        }
      });
      if (!restored) return reply('busy');
      this.terminal = true;
      // Commit já confirmado. Falha ao reiniciar não pode ser descrita como rollback.
      await this.clearStage().catch(() => undefined);
      await this.ports.restart().catch(() => undefined);
      return reply(uncertain ? 'uncertain' : 'restored', staged.summary);
    });
  }
}
