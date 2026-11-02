import { parentPort, workerData } from 'node:worker_threads';
import { inspectBackup } from './backup';
// Só recebe cópia privada escolhida pelo main. Nunca abre a base corrente do produto.
void inspectBackup((workerData as { path: string }).path)
  .then((value) => parentPort?.postMessage({ ok: true, value }))
  .catch(() => parentPort?.postMessage({ ok: false }))
  .finally(() => parentPort?.close());
