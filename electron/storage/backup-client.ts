import { Worker } from 'node:worker_threads';
import { backupSummarySchema, type BackupSummary } from '../../shared/contracts/backup';
export function validateBackup(workerPath: string, path: string): Promise<BackupSummary> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { path } });
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      const parsed = backupSummarySchema.safeParse(value);
      if (error || !parsed.success) reject(error ?? new Error('INVALID_BACKUP'));
      else resolve(parsed.data);
    };
    const timeout = setTimeout(() => finish(new Error('VALIDATION_TIMEOUT')), 120_000);
    worker.once('error', (error) => finish(error));
    worker.once('exit', () => finish(new Error('VALIDATION_UNAVAILABLE')));
    worker.once('message', (message: { ok: boolean; value?: unknown }) =>
      finish(message.ok ? undefined : new Error('INVALID_BACKUP'), message.value),
    );
  });
}
