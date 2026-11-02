import { Worker } from 'node:worker_threads';
import { z } from 'zod';
const resultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }).strict(),
  z.object({ state: z.literal('restored'), id: z.string().uuid() }).strict(),
]);
type Request =
  | { action: 'resume'; root: string }
  | { action: 'rescue'; root: string; source: string; digest: string; now: number };
export function runRescue(
  workerPath: string,
  request: Request,
): Promise<z.infer<typeof resultSchema>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: request });
    let settled = false;
    const finish = async (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        await worker.terminate();
      } catch {
        reject(new Error('RESCUE_STOP_FAILED'));
        return;
      }
      const result = resultSchema.safeParse(value);
      if (error || !result.success) reject(error ?? new Error('RESCUE_FAILED'));
      else resolve(result.data);
    };
    const timeout = setTimeout(() => {
      void finish(new Error('RESCUE_TIMEOUT'));
    }, 120_000);
    worker.once('message', (message: { ok: boolean; value?: unknown }) => {
      void finish(message.ok ? undefined : new Error('RESCUE_FAILED'), message.value);
    });
    worker.once('error', (error) => {
      void finish(error);
    });
    worker.once('exit', () => {
      void finish(new Error('RESCUE_UNAVAILABLE'));
    });
  });
}
