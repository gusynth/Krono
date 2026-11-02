// Entrada de benchmark externa ao produto; somente banco sintético explicitamente indicado.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { productionRepository } from '../../electron/storage/production-repository';
import { seedScaleDatabase } from './scale-database';
const root = resolve(process.argv[2] ?? ''),
  location = relative(resolve('.test-data'), root);
if (!location || location.startsWith('..') || isAbsolute(location)) throw new Error('FIXTURE_ONLY');
const db = openDatabase(join(root, 'data/krono.sqlite'));
if (process.env.KRONO_BENCHMARK_EXISTING === '1')
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS n FROM focus_sessions').get() as { n: number }).n,
    100_000,
  );
else seedScaleDatabase(db);
const sql = db.prepare(
  'SELECT SUM(duration_ms) AS total FROM focus_daily_credit WHERE local_date BETWEEN ? AND ?',
);
const repository = productionRepository(db),
  query = { days: 365, endDate: '2025-12-31', habitId: null },
  sqlMs: number[] = [],
  repositoryMs: number[] = [];
for (let index = 0; index < 6; index++) {
  let start = performance.now();
  const result = sql.get('2025-01-01', '2025-12-31') as { total: number };
  sqlMs.push(performance.now() - start);
  assert.equal(result.total, 4_800_000_000);
  start = performance.now();
  const value = repository.read(query, Date.UTC(2026, 0, 1, 12), 'UTC');
  repositoryMs.push(performance.now() - start);
  assert.equal(value.metrics.sessions, 80_000);
  assert.equal(value.history.length, 20);
}
const statements: { sql: string; ms: number; plan: unknown }[] = [];
const traced = new Proxy(db, {
  get(target, key) {
    if (key !== 'prepare') return Reflect.get(target, key);
    return (sql: string) =>
      new Proxy(target.prepare(sql), {
        get(statement, method) {
          const value = Reflect.get(statement, method);
          if (typeof value !== 'function') return value;
          return (...args: unknown[]) => {
            const start = performance.now(),
              result = Reflect.apply(value, statement, args);
            if (method === 'get' || method === 'all')
              statements.push({
                sql,
                ms: performance.now() - start,
                plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args),
              });
            return result;
          };
        },
      });
  },
});
productionRepository(traced).read(query, Date.UTC(2026, 0, 1, 12), 'UTC');
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
await writeFile(
  join(root, 'database-report.json'),
  JSON.stringify({
    sqlMs,
    repositoryAndContractMs: repositoryMs,
    statements: statements.sort((a, b) => b.ms - a.ms),
    expectedMs: 4_800_000_000,
    sessions: 100_000,
    habits: 100,
    dates: 365,
  }),
);
