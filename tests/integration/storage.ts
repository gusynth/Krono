import { verifyHabitIcons } from './habit-icons';
import { verifyProductionScale } from './production-scale';
import { verifyBackupStorage } from './backup-storage';
import { verifyRescueStorage } from './rescue-storage';
import { verifyProductionDST } from './production-dst';
import { verifyProductionStorage } from './production-storage';
import { verifyHabitStorage } from './habit-storage';
import { verifyDesktopStorage } from './desktop-storage';
import { verifyTimerStorage } from './timer-storage';
import { Worker } from 'node:worker_threads';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

async function main() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/sqlite-'));
  const workerPath = resolve('.test-data/storage-worker.cjs');
  const workers: Worker[] = [];
  let successfulReport: Record<string, unknown> | null = null;
  const reportPath = `artifacts/reports/${process.env.KRONO_PACKAGED_WORKER ? 'packaged-storage' : 'integration'}.json`;
  async function open(path: string, entry = workerPath) {
    const worker = new Worker(entry, { workerData: { path } });
    workers.push(worker);
    const message = await new Promise<Record<string, unknown>>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    });
    return { worker, message };
  }
  function request(worker: Worker, id: number, type: string, path?: string, value?: unknown) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage({ id, type, path, value });
    });
  }
  try {
    const production = await open(
      join(dir, 'production.sqlite'),
      resolve(process.env.KRONO_PACKAGED_WORKER ?? 'dist-electron/worker.cjs'),
    );
    assert.equal(production.message.kind, 'ready');
    assert.equal(production.message.journal, 'wal');
    assert.equal(production.message.synchronous, 2);
    const initial = await request(production.worker, 96, 'timer:load');
    assert.equal(initial.ok, true);
    const record = initial.value as { revision: number; phase: string };
    assert.equal(record.revision, 0);
    assert.equal(
      (
        await request(production.worker, 97, 'timer:commit', undefined, {
          expectedRevision: 0,
          record: { ...record, revision: 1, phase: 'short-break', nextPhase: 'short-break' },
          command: { id: 'synthetic-protocol', fingerprint: 'worker-smoke' },
        })
      ).ok,
      true,
    );
    assert.equal(
      (await request(production.worker, 98, 'timer:lookup', undefined, 'synthetic-protocol')).value,
      'worker-smoke',
    );
    const habitContext = { now: Date.UTC(2026, 0, 1), timezone: 'UTC' };
    const habitRead = await request(production.worker, 100, 'habits:read', undefined, habitContext);
    assert.equal(habitRead.ok, true);
    assert.equal((habitRead.value as { revision: number }).revision, 0);
    const habitCreate = await request(production.worker, 101, 'habits:command', undefined, {
      ...habitContext,
      command: {
        commandId: randomUUID(),
        expectedRevision: 0,
        action: 'create',
        habitId: randomUUID(),
        input: {
          name: 'Sintético no worker',
          kind: 'action',
          frequency: { kind: 'daily' },
          targetMinutes: 1,
        },
      },
    });
    assert.equal(habitCreate.ok, true);
    assert.equal((habitCreate.value as { code: string }).code, 'ok');
    const productionRead = await request(production.worker, 102, 'production:read', undefined, {
      ...habitContext,
      query: { days: 7, habitId: null },
    });
    assert.equal(productionRead.ok, true);
    assert.equal(
      (productionRead.value as { metrics: { eligibleMs: number } }).metrics.eligibleMs,
      0,
    );
    await request(production.worker, 99, 'close');
    const path = join(dir, 'krono.sqlite');
    const { worker, message } = await open(path);
    assert.equal(message.kind, 'ready');
    assert.equal(message.journal, 'wal');
    assert.equal(message.synchronous, 2);
    const probe = await request(worker, 1, 'probe');
    assert.equal(probe.ok, true);
    assert.equal(probe.rolledBack, true);
    assert.deepEqual(probe.rows, [{ id: 'synthetic', value: 25 }]);
    const backup = join(dir, 'backup.sqlite');
    assert.equal((await request(worker, 2, 'backup', backup)).ok, true);
    const copy = new Database(backup, { readonly: true });
    assert.deepEqual(copy.prepare('select * from synthetic_probe').all(), probe.rows);
    copy.close();
    assert.equal((await request(worker, 3, 'close')).ok, true);
    const reopened = await open(path);
    assert.equal(reopened.message.kind, 'ready');
    assert.deepEqual((await request(reopened.worker, 4, 'probe')).rows, probe.rows);
    await request(reopened.worker, 5, 'close');
    const futurePath = join(dir, 'future.sqlite');
    const future = new Database(futurePath);
    future.pragma('user_version = 99');
    future.close();
    assert.equal((await open(futurePath)).message.kind, 'error');
    const preserved = new Database(futurePath);
    assert.equal(preserved.pragma('user_version', { simple: true }), 99);
    preserved.close();
    const corruptPath = join(dir, 'corrupt.sqlite');
    await writeFile(corruptPath, 'synthetic-invalid-sqlite');
    assert.equal((await open(corruptPath)).message.kind, 'error');
    assert.equal(await readFile(corruptPath, 'utf8'), 'synthetic-invalid-sqlite');
    const assetRoot = process.env.KRONO_PACKAGED_WORKER
      ? dirname(process.env.KRONO_PACKAGED_WORKER)
      : resolve('dist-electron');
    const wav = await readFile(join(assetRoot, 'audio/complete.wav'));
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
    assert.equal(wav.readUInt32LE(24), 22050);
    for (const name of ['principal', 'tray-light', 'tray-dark']) {
      const ico = await readFile(join(assetRoot, `assets/${name}.ico`));
      assert.equal(ico.readUInt16LE(2), 1);
      assert.equal(ico.readUInt16LE(4), 9);
      for (let i = 0; i < 9; i++) {
        const at = 6 + i * 16,
          offset = ico.readUInt32LE(at + 12);
        assert.equal(ico.subarray(offset + 1, offset + 4).toString(), 'PNG');
      }
    }
    assert.ok(
      (await readFile(join(assetRoot, 'audio/index.html'), 'utf8')).includes("default-src 'none'"),
    );
    assert.ok((await readFile(join(assetRoot, 'audio/preload.cjs'))).length > 0);
    const desktopAssets = {
      audioBytes: wav.length,
      brandIcons: 'principal + tray light/dark, 9 frames each',
      audioPreload: 'present',
      packaged: Boolean(process.env.KRONO_PACKAGED_WORKER),
    };
    const timerStorage = await verifyTimerStorage(dir);
    const desktopStorage = await verifyDesktopStorage(dir);
    const habitStorage = await verifyHabitStorage(dir);
    const habitIcons = await verifyHabitIcons(dir);
    const productionStorage = await verifyProductionStorage(dir);
    const productionDST = verifyProductionDST(dir);
    const productionScale = await verifyProductionScale(dir);
    const backupStorage = await verifyBackupStorage(dir);
    const rescueStorage = await verifyRescueStorage(dir);
    const report = {
      habitIcons,
      rescueStorage,
      backupStorage,
      productionScale,
      productionDST,
      productionStorage,
      habitStorage,
      desktopAssets,
      desktopStorage,
      timerStorage,
      result: 'passed',
      scope:
        'SQLite real em worker; WAL/FULL; unicidade; rollback; backup aberto; reabertura; schema futuro; corrupção',
      runtime: process.versions,
      nativeSqlite: production.message.sqlite,
      packagedWorker: Boolean(process.env.KRONO_PACKAGED_WORKER),
      fixtures: 'Sintéticas, em .test-data/sqlite-*',
      timestamp: new Date().toISOString(),
    };
    await mkdir('artifacts/reports', { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    successfulReport = report;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
    // Somente o mkdtemp desta execução bem-sucedida; falhas conservam a fixture para diagnóstico.
    if (successfulReport) {
      assert.equal(dirname(dir), resolve('.test-data'));
      assert.match(basename(dir), /^sqlite-[\w-]+$/);
      assert.equal(await realpath(dir), dir);
      await rm(dir, { recursive: true });
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            ...successfulReport,
            temporaryFixture: dir,
            fixtureCleanup: 'removed after success and worker closure; reports retained',
          },
          null,
          2,
        ),
      );
    }
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
