// Entrada de falha exclusiva de testes; nunca incluída no build do produto.
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../../electron/storage/database';
import { replaceFromBackup } from '../../electron/storage/backup';
const { path, source } = workerData as { path: string; source: string };
const db = openDatabase(path);
db.function('pause_for_crash', () => {
  parentPort!.postMessage('transaction-open');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  return 0;
});
db.exec(
  'CREATE TRIGGER synthetic_crash AFTER DELETE ON timer_commands BEGIN SELECT pause_for_crash(); END',
);
replaceFromBackup(db, source);
db.close();
