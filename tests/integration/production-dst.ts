import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { timerRepository } from '../../electron/storage/timer-repository';
import { productionRepository } from '../../electron/storage/production-repository';
import { defaultPreset } from '../../shared/contracts/timer';
import { complete } from '../../shared/domain/timer';

export function verifyProductionDST(dir: string) {
  const db = openDatabase(join(dir, 'production-dst.sqlite')),
    timer = timerRepository(db);
  for (const [start, hours] of [
    ['2026-03-08T05:00:00Z', 23],
    ['2026-11-01T04:00:00Z', 25],
  ] as const) {
    const startedUtcMs = Date.parse(start),
      durationMs = hours * 3_600_000,
      previous = timer.load();
    const session = {
      id: randomUUID(),
      phase: 'free' as const,
      timezone: 'America/New_York',
      startedUtcMs,
      segments: [{ startUtcMs: startedUtcMs, durationMs }],
      preset: defaultPreset,
    };
    timer.commit({
      expectedRevision: previous.revision,
      record: {
        ...complete({ ...previous, state: 'running', phase: 'free', session }),
        revision: previous.revision + 1,
      },
      command: { id: randomUUID(), fingerprint: 'DST synthetic' },
      result: { session, outcome: 'completed', completedUtcMs: startedUtcMs + durationMs },
    });
  }
  const repository = productionRepository(db),
    now = Date.parse('2026-11-03T12:00:00Z');
  const read = (endDate: string) =>
    repository.read({ days: 1, endDate, habitId: null }, now, 'America/New_York');
  assert.equal(read('2026-03-08').metrics.eligibleMs, 23 * 3_600_000);
  assert.equal(read('2026-03-08').metrics.sessions, 0);
  assert.equal(read('2026-03-09').metrics.eligibleMs, 0);
  assert.equal(read('2026-03-09').metrics.sessions, 1);
  assert.equal(read('2026-11-01').metrics.eligibleMs, 25 * 3_600_000);
  assert.equal(read('2026-11-02').metrics.sessions, 1);
  assert.equal(
    repository.read({ days: 365, endDate: '2026-11-03' }, now, 'America/New_York').metrics
      .eligibleMs,
    48 * 3_600_000,
  );
  db.close();
  return {
    timezone: 'America/New_York',
    civilDaysHours: [23, 25],
    conservedHours: 48,
    sessionCount: 'completion date; credit remains in active segment date',
  };
}
