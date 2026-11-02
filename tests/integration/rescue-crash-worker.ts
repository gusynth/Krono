// Interrupção exclusiva da fixture, nunca no aplicativo distribuído.
import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { rescueDatabase } from '../../electron/storage/rescue';
const input = workerData as {
  root: string;
  source: string;
  digest: string;
  phase: string;
  now: number;
};
const pause = () => {
  parentPort!.postMessage(input.phase);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
};
const rename = fs.promises.rename;
fs.promises.rename = async (source, destination) => {
  const from = String(source),
    to = String(destination);
  if (input.phase === 'before-archive' && to.endsWith('original-data')) pause();
  await rename(source, destination);
  if (
    (input.phase === 'after-archive' && to.endsWith('original-data')) ||
    (input.phase === 'after-install' && from.endsWith('replacement-data'))
  )
    pause();
};
const remove = fs.promises.rm;
fs.promises.rm = async (path, options) => {
  if (input.phase === 'before-clear' && String(path).endsWith('pending.json')) pause();
  await remove(path, options);
  if (input.phase === 'after-clear' && String(path).endsWith('pending.json')) pause();
};
void rescueDatabase(input.root, input.source, input.digest, input.now).catch((error) => {
  throw error;
});
