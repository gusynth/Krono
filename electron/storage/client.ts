import { Worker } from 'node:worker_threads';

export function openStorage(workerPath: string, databasePath: string): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { path: databasePath } });
    let finished = false;
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      void worker.terminate().then(
        () => reject(error),
        () => reject(new Error('STORAGE_STOP_FAILED')),
      );
    };
    const timeout = setTimeout(() => fail(new Error('STORAGE_TIMEOUT')), 15000);
    worker.once('error', fail);
    const exited = () => fail(new Error('STORAGE_UNAVAILABLE'));
    worker.once('exit', exited);
    worker.once('message', (message: { kind: string }) => {
      clearTimeout(timeout);
      if (message.kind === 'ready') {
        if (finished) return;
        finished = true;
        worker.off('error', fail);
        worker.off('exit', exited);
        resolve(worker);
      } else fail(new Error('STORAGE_UNAVAILABLE'));
    });
  });
}
