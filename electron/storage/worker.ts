import { exportHistory } from './export-history';
import { readGarden } from './garden';
import { productionRepository } from './production-repository';
import { writeBackup, restoreBackup } from './backup';
import { desktopRepository } from './desktop-repository';
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from './database';
import { habitRepository } from './habit-repository';
import { z } from 'zod';
const productionRequest = z
  .object({
    now: z.number().int().nonnegative(),
    timezone: z.string().max(80),
    query: z.unknown().optional(),
    command: z.unknown().optional(),
  })
  .strict();
const habitRequest = z
  .object({
    now: z.number().int().nonnegative(),
    timezone: z.string().max(80),
    command: z.unknown().optional(),
  })
  .strict();
import { timerRepository } from './timer-repository';
import { probeStorage } from './probe';

void (async () => {
  try {
    const cleanProbe = await probeStorage((workerData as { path: string }).path);
    const db = openDatabase((workerData as { path: string }).path);
    if (
      db.pragma('quick_check', { simple: true }) !== 'ok' ||
      (db.pragma('foreign_key_check') as unknown[]).length
    ) {
      db.close();
      throw new Error('STORAGE_INTEGRITY_FAILED');
    }
    await cleanProbe().catch(() => undefined);
    const timer = timerRepository(db);
    const desktop = desktopRepository(db);
    const habits = habitRepository(db);
    const production = productionRepository(db);
    parentPort?.postMessage({
      kind: 'ready',
      schema: 5,
      sqlite: db.prepare('select sqlite_version() as version').get(),
      journal: db.pragma('journal_mode', { simple: true }),
      synchronous: db.pragma('synchronous', { simple: true }),
    });
    let serial: Promise<void> = Promise.resolve(),
      restored = false,
      restoring = false;
    let copying: Promise<void> | null = null;
    parentPort?.on('message', (message: { id: number; type: string; value?: unknown }) => {
      // SQLite online backup cede entre lotes. Não prender comandos normais na cópia.
      if (message.type === 'backup:copy') {
        if (restored || restoring || copying) {
          parentPort?.postMessage({ id: message.id, ok: false });
          return;
        }
        copying = Promise.resolve().then(async () => {
          try {
            const request = z
              .object({ path: z.string().min(1), now: z.number().int().nonnegative() })
              .strict()
              .parse(message.value);
            await writeBackup(db, request.path, request.now);
            parentPort?.postMessage({ id: message.id, ok: true });
          } catch {
            parentPort?.postMessage({ id: message.id, ok: false });
          } finally {
            copying = null;
          }
        });
        return;
      }
      serial = serial.then(async () => {
        try {
          let value: unknown;
          if (message.type === 'close') {
            await copying;
            db.close();
            parentPort?.postMessage({ id: message.id, ok: true });
            parentPort?.close();
            return;
          } else if (message.type === 'backup:status') value = { restored };
          else if (restored) throw new Error('RESTART_REQUIRED');
          else if (message.type === 'backup:restore') {
            if (copying) throw new Error('BACKUP_BUSY');
            const request = z
              .object({
                path: z.string().min(1),
                digest: z.string().regex(/^[a-f0-9]{64}$/),
                previousPath: z.string().min(1),
                now: z.number().int().nonnegative(),
              })
              .strict()
              .parse(message.value);
            restoring = true;
            try {
              await restoreBackup(
                db,
                request.path,
                request.digest,
                request.previousPath,
                request.now,
              );
              restored = true;
            } finally {
              restoring = false;
            }
          } else if (message.type === 'production:garden') {
            if (message.value !== undefined) throw new Error('INVALID_COMMAND');
            value = readGarden(db);
          } else if (message.type === 'production:history') {
            const request = productionRequest.parse(message.value);
            value = exportHistory(db, request.query, request.now, request.timezone);
          } else if (message.type === 'production:day') {
            const request = productionRequest.parse(message.value);
            value = production.day(request.query, request.now, request.timezone);
          } else if (message.type === 'production:read') {
            const request = productionRequest.parse(message.value);
            value = production.read(request.query, request.now, request.timezone);
          } else if (message.type === 'production:goals') {
            const request = productionRequest.parse(message.value);
            value = production.goals(request.now, request.timezone);
          } else if (message.type === 'production:command') {
            const request = productionRequest.parse(message.value);
            value = production.command(request.command, request.now, request.timezone);
          } else if (message.type === 'habits:read') {
            const request = habitRequest.parse(message.value);
            value = habits.read(request.now, request.timezone);
          } else if (message.type === 'habits:selected') {
            const request = habitRequest.parse(message.value);
            value = habits.selected(request.now);
          } else if (message.type === 'habits:command') {
            const request = habitRequest.parse(message.value);
            value = habits.command(request.command, request.now, request.timezone);
          } else if (message.type === 'timer:load') value = timer.load();
          else if (message.type === 'timer:lookup' && typeof message.value === 'string')
            value = timer.lookup(message.value);
          else if (message.type === 'timer:commit') timer.commit(message.value);
          else if (message.type === 'desktop:preferences') value = desktop.preferences();
          else if (message.type === 'desktop:update') value = desktop.update(message.value);
          else if (message.type === 'desktop:hide-seen') desktop.acknowledgeHide();
          else if (message.type === 'desktop:recover') desktop.recoverAlerts();
          else if (message.type === 'desktop:pending') value = desktop.pending();
          else if (message.type === 'desktop:claim' && typeof message.value === 'string')
            value = desktop.claim(message.value);
          else if (message.type === 'desktop:outcome') desktop.outcome(message.value);
          else if (message.type === 'desktop:alerts') value = desktop.alerts();
          else if (message.type === 'desktop:dismiss' && typeof message.value === 'string')
            desktop.dismiss(message.value);
          else throw new Error('INVALID_COMMAND');
          parentPort?.postMessage({ id: message.id, ok: true, value });
        } catch {
          parentPort?.postMessage({ id: message.id, ok: false, code: 'STORAGE_UNAVAILABLE' });
        }
      });
    });
  } catch {
    parentPort?.postMessage({ kind: 'error', code: 'STORAGE_UNAVAILABLE' });
    parentPort?.close();
  }
})();
