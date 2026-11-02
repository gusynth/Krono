import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { openStorage } from '../../electron/storage/client';
import { workerTimerRepository } from '../../electron/storage/timer-client';
import { productionRepository } from '../../electron/storage/production-repository';
import { productionSnapshotSchema } from '../../shared/contracts/production';
import { defaultPreset } from '../../shared/contracts/timer';
import { seedScaleDatabase } from '../fixtures/scale-database';
import { removeProductionSchema } from './legacy-fixture';

export async function verifyProductionScale(dir: string) {
  const path = join(dir, 'production-100k.sqlite');
  let db = openDatabase(path);
  const ids = seedScaleDatabase(db);
  // Migração 4->5 também na escala de referência, sem carregar todos os payloads de uma vez.
  removeProductionSchema(db);
  db.pragma('user_version=4');
  db.close();
  const migrationStart = performance.now();
  db = openDatabase(path);
  const migrationMs = performance.now() - migrationStart;
  const repository = productionRepository(db),
    context = { now: Date.parse('2026-01-01T12:00:00Z'), timezone: 'UTC' },
    query = { days: 365, endDate: '2025-12-31', habitId: null };
  const aggregateStart = performance.now();
  const first = repository.read(query, context.now, context.timezone);
  const aggregateMs = performance.now() - aggregateStart;
  assert.equal(first.metrics.eligibleMs, 4_800_000_000);
  assert.equal(first.metrics.sessions, 80_000);
  assert.equal(first.metrics.interruptedMs, 150_000_000);
  assert.equal(first.previous.currentMs, 4_800_000_000);
  assert.equal(first.habits.length, 100);
  assert.equal(first.daysData.length, 365);
  assert.equal(first.history.length, 20);
  assert.ok(first.nextCursor);
  assert.equal(
    repository.read({ ...query, habitId: ids[2] }, context.now, context.timezone).metrics
      .eligibleMs,
    60_000_000,
  );
  const second = repository.read(
    { ...query, cursor: first.nextCursor! },
    context.now,
    context.timezone,
  );
  assert.equal(new Set([...first.history, ...second.history].map((row) => row.id)).size, 40);
  assert.throws(() =>
    repository.read(
      { ...query, days: 30, cursor: first.nextCursor! },
      context.now,
      context.timezone,
    ),
  );
  // Inserção posterior com data antiga não aparece nem altera o total das páginas já abertas.
  const fresh = randomUUID(),
    start = Date.parse('2025-12-31T23:00:00Z');
  const session = {
    id: fresh,
    phase: 'focus',
    timezone: 'UTC',
    startedUtcMs: start,
    segments: [{ startUtcMs: start, durationMs: 1000 }],
    preset: { ...defaultPreset, focusMs: 1000 },
    habitId: null,
  };
  db.prepare(
    'INSERT INTO focus_sessions(id,phase,outcome,timezone,started_utc,completed_utc,active_ms,eligible_ms,payload,completion_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    fresh,
    'focus',
    'completed',
    'UTC',
    start,
    start + 1000,
    1000,
    1000,
    JSON.stringify(session),
    '2025-12-31',
  );
  db.prepare('INSERT INTO focus_daily_credit VALUES (?,?,?)').run(fresh, '2025-12-31', 1000);
  const stableFirst = repository.read(
    { ...query, ceiling: first.ceiling },
    context.now,
    context.timezone,
  );
  assert.deepEqual(stableFirst.history, first.history);
  assert.equal(stableFirst.metrics.eligibleMs, first.metrics.eligibleMs);
  assert.equal(
    repository.read(query, context.now, context.timezone).metrics.eligibleMs,
    4_800_001_000,
  );
  const serializedBytes = Buffer.byteLength(JSON.stringify(first));
  assert.ok(serializedBytes < 100_000);
  const plan = db
    .prepare(
      'EXPLAIN QUERY PLAN SELECT SUM(duration_ms) FROM focus_daily_credit WHERE local_date BETWEEN ? AND ?',
    )
    .all('2025-01-01', '2025-12-31') as { detail: string }[];
  assert.ok(
    plan.some((row) => row.detail.includes('focus_credit_period') && row.detail.includes('SEARCH')),
  );
  db.close();
  const worker = await openStorage(
      resolve(process.env.KRONO_PACKAGED_WORKER ?? 'dist-electron/worker.cjs'),
      path,
    ),
    client = workerTimerRepository(worker);
  let ipcMs: number;
  try {
    const start = performance.now();
    const snapshot = productionSnapshotSchema.parse(
      await client.request('production:read', { ...context, query }),
    );
    ipcMs = performance.now() - start;
    assert.equal(snapshot.metrics.eligibleMs, 4_800_001_000);
    assert.equal(snapshot.history.length, 20);
  } finally {
    client.dispose();
    await worker.terminate();
  }
  return {
    sessions: 100_000,
    habits: 100,
    dates: 365,
    expectedEligibleMs: 4_800_000_000,
    migrationMs,
    aggregateAndValidationMs: aggregateMs,
    ipcAndWorkerMs: ipcMs,
    serializedBytes,
    pagination: '20 rows; stable ceiling; keyset; filter-bound cursor; back page unchanged',
    queryPlan: plan.map((row) => row.detail),
    measurement:
      'local wall time; synthetic data; OS cache uncontrolled; no renderer/CPU/GPU/FPS claim',
  };
}
