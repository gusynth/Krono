import { parentPort, workerData } from 'node:worker_threads';
import { z } from 'zod';
import { rescueDatabase, resumeRescue } from './rescue';
const request = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resume'), root: z.string().min(1) }).strict(),
  z
    .object({
      action: z.literal('rescue'),
      root: z.string().min(1),
      source: z.string().min(1),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      now: z.number().int().nonnegative(),
    })
    .strict(),
]);
void (async () => {
  const input = request.parse(workerData);
  return input.action === 'resume'
    ? resumeRescue(input.root)
    : rescueDatabase(input.root, input.source, input.digest, input.now);
})()
  .then((value) => parentPort?.postMessage({ ok: true, value }))
  .catch(() => parentPort?.postMessage({ ok: false }))
  .finally(() => parentPort?.close());
