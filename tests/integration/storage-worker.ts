// Adaptador com injeção de falhas e fixtures; NÃO faz parte do pacote.
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../../electron/storage/database';
try {
  const db = openDatabase((workerData as { path: string }).path);
  db.exec(
    'CREATE TABLE IF NOT EXISTS synthetic_probe (id TEXT PRIMARY KEY, value INTEGER NOT NULL CHECK(value >= 0))',
  );
  parentPort?.postMessage({
    kind: 'ready',
    journal: db.pragma('journal_mode', { simple: true }),
    synchronous: db.pragma('synchronous', { simple: true }),
  });
  parentPort?.on('message', (message: { id: number; type: string; path?: string }) => {
    try {
      if (message.type === 'close') {
        db.close();
        parentPort?.postMessage({ id: message.id, ok: true });
        parentPort?.close();
      } else if (message.type === 'probe') {
        const put = db.prepare(
          'INSERT INTO synthetic_probe VALUES (?, ?) ON CONFLICT(id) DO NOTHING',
        );
        db.transaction(() => {
          put.run('synthetic', 25);
          put.run('synthetic', 25);
        })();
        let rolledBack = false;
        try {
          db.transaction(() => {
            put.run('rollback', 10);
            throw new Error('injected');
          })();
        } catch {
          rolledBack = true;
        }
        parentPort?.postMessage({
          id: message.id,
          ok: true,
          rows: db.prepare('SELECT * FROM synthetic_probe ORDER BY id').all(),
          rolledBack,
        });
      } else if (message.type === 'backup' && message.path) {
        void db
          .backup(message.path)
          .then(() => parentPort?.postMessage({ id: message.id, ok: true }))
          .catch(() => parentPort?.postMessage({ id: message.id, ok: false }));
      }
    } catch {
      parentPort?.postMessage({ id: message.id, ok: false });
    }
  });
} catch {
  parentPort?.postMessage({ kind: 'error' });
  parentPort?.close();
}
