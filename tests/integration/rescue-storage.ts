import assert from 'node:assert/strict';
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  copyFile,
  link,
  symlink,
  stat,
} from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../electron/storage/database';
import { createBackup, fileDigest } from '../../electron/storage/backup';
import { rescueDatabase, resumeRescue } from '../../electron/storage/rescue';
import { runRescue } from '../../electron/storage/rescue-client';
import { assertStoragePresent, markStorageInitialized } from '../../electron/storage/startup';
import { openStorage } from '../../electron/storage/client';
import { workerTimerRepository } from '../../electron/storage/timer-client';

export async function verifyRescueStorage(dir: string) {
  const workerPath = resolve(process.env.KRONO_PACKAGED_WORKER ?? 'dist-electron/worker.cjs'),
    rescuePath = join(dirname(workerPath), 'rescue-worker.cjs');
  const sourceDb = openDatabase(join(dir, 'rescue-reference.sqlite'));
  sourceDb
    .prepare('INSERT INTO habits VALUES(?,?,?,?,?)')
    .run(randomUUID(), 'Origem válida', 'action', 'UTC', '2026-01-01');
  // Fixture de referência é produzida com contrato normal antes do backup.
  const habit = (sourceDb.prepare('SELECT id FROM habits').get() as { id: string }).id;
  sourceDb.prepare('INSERT INTO habit_versions VALUES(?,?,?)').run(
    habit,
    '2026-01-01',
    JSON.stringify({
      date: '2026-01-01',
      active: true,
      frequency: { kind: 'daily' },
      targetMinutes: 1,
    }),
  );
  const source = join(dir, 'rescue-source.krono-backup'),
    summary = await createBackup(sourceDb, source, Date.parse('2026-01-02T00:00:00Z'));
  sourceDb.close();
  const originals = {
    'krono.sqlite': 'synthetic-corrupt-primary',
    'krono.sqlite-wal': 'synthetic-WAL',
    'krono.sqlite-shm': 'synthetic-SHM',
    'krono.sqlite-journal': 'synthetic-journal',
    'extra.bin': 'synthetic-opaque-extra',
  };
  const profile = async (name: string) => {
    const root = join(dir, `rescue-${name}`);
    await mkdir(root);
    await mkdir(join(root, 'data'));
    for (const [name, text] of Object.entries(originals))
      await writeFile(join(root, 'data', name), text);
    await markStorageInitialized(root);
    return root;
  };
  const checkArchive = async (root: string, id: string) => {
    for (const [name, text] of Object.entries(originals))
      assert.equal(await readFile(join(root, 'rescue', id, 'original-data', name), 'utf8'), text);
  };
  const checkRestored = async (root: string) => {
    await assertStoragePresent(root);
    const worker = await openStorage(workerPath, join(root, 'data/krono.sqlite')),
      client = workerTimerRepository(worker);
    try {
      const result = (await client.request('habits:read', {
        now: Date.parse('2026-01-02T12:00:00Z'),
        timezone: 'UTC',
      })) as { habits: { name: string }[] };
      assert.equal(result.habits[0].name, 'Origem válida');
    } finally {
      client.dispose();
      await worker.terminate();
    }
  };
  const normal = await profile('roundtrip');
  await assert.rejects(() => openStorage(workerPath, join(normal, 'data/krono.sqlite')));
  const rescued = await runRescue(rescuePath, {
    action: 'rescue',
    root: normal,
    source,
    digest: summary.digest,
    now: Date.now(),
  });
  assert.equal(rescued.state, 'restored');
  if (rescued.state !== 'restored') throw new Error('fixture');
  await checkArchive(normal, rescued.id);
  await checkRestored(normal);
  assert.deepEqual(await resumeRescue(normal), { state: 'none' });
  assert.ok((await stat(join(normal, 'rescue', rescued.id, 'committed.json'))).isFile());
  const failures: string[] = [];
  for (const phase of [
    'before-archive',
    'after-archive',
    'after-install',
    'before-clear',
    'after-clear',
  ]) {
    const root = await profile(phase),
      worker = new Worker(resolve('.test-data/rescue-crash-worker.cjs'), {
        workerData: { root, source, digest: summary.digest, phase, now: Date.now() },
      });
    try {
      await new Promise<void>((resolve, reject) => {
        worker.once('message', () => resolve());
        worker.once('error', reject);
      });
    } finally {
      await worker.terminate();
    }
    const result = await runRescue(rescuePath, { action: 'resume', root });
    assert.equal(result.state, phase === 'after-clear' ? 'none' : 'restored');
    const entries = (await readdir(join(root, 'rescue'))).filter((name) => name !== 'pending.json');
    assert.equal(entries.length, 1);
    await checkArchive(root, entries[0]);
    await checkRestored(root);
    failures.push(phase);
  }
  const invalid = await profile('invalid');
  await assert.rejects(() => rescueDatabase(invalid, source, '0'.repeat(64), Date.now()));
  assert.equal(
    await readFile(join(invalid, 'data/krono.sqlite'), 'utf8'),
    originals['krono.sqlite'],
  );
  await writeFile(
    join(invalid, 'rescue/pending.json'),
    JSON.stringify({ version: 1, id: '../../outside' }),
  );
  await assert.rejects(() => resumeRescue(invalid));
  assert.equal(
    await readFile(join(invalid, 'data/krono.sqlite'), 'utf8'),
    originals['krono.sqlite'],
  );
  const interrupted = await profile('tampered-candidate'),
    stop = new Worker(resolve('.test-data/rescue-crash-worker.cjs'), {
      workerData: {
        root: interrupted,
        source,
        digest: summary.digest,
        phase: 'after-archive',
        now: Date.now(),
      },
    });
  try {
    await new Promise<void>((resolve, reject) => {
      stop.once('message', () => resolve());
      stop.once('error', reject);
    });
  } finally {
    await stop.terminate();
  }
  const pending = JSON.parse(await readFile(join(interrupted, 'rescue/pending.json'), 'utf8')) as {
    id: string;
  };
  await writeFile(
    join(interrupted, 'rescue', pending.id, 'replacement-data/krono.sqlite'),
    'synthetic-tamper',
  );
  await assert.rejects(() => resumeRescue(interrupted));
  await assert.rejects(() => stat(join(interrupted, 'data/krono.sqlite')));
  await checkArchive(interrupted, pending.id);
  const missing = join(dir, 'rescue-missing');
  await mkdir(missing);
  await markStorageInitialized(missing);
  await assert.rejects(() => assertStoragePresent(missing));
  const restoredMissing = await rescueDatabase(missing, source, summary.digest, Date.now());
  assert.equal(restoredMissing.state, 'restored');
  await checkRestored(missing);
  const fresh = join(dir, 'rescue-fresh');
  await mkdir(fresh);
  await assertStoragePresent(fresh);
  await mkdir(join(fresh, 'data'));
  await writeFile(join(fresh, 'data/krono.sqlite-wal'), 'orphan');
  await assert.rejects(() => assertStoragePresent(fresh));
  const linked = join(dir, 'rescue-link');
  await mkdir(linked);
  await symlink(join(normal, 'data'), join(linked, 'data'), 'junction');
  await assert.rejects(() => assertStoragePresent(linked));
  await assert.rejects(() => rescueDatabase(linked, source, summary.digest, Date.now()));
  const hard = join(dir, 'rescue-hardlink');
  await mkdir(hard);
  await mkdir(join(hard, 'data'));
  await link(join(invalid, 'data/krono.sqlite'), join(hard, 'data/krono.sqlite'));
  await assert.rejects(() => assertStoragePresent(hard));
  const unsupported = await profile('newer-schema');
  await copyFile(source, join(unsupported, 'data/krono.sqlite'));
  const newer = openDatabase(join(unsupported, 'data/krono.sqlite'));
  newer.pragma('user_version=99');
  newer.close();
  const before = await fileDigest(join(unsupported, 'data/krono.sqlite'));
  const completed = await rescueDatabase(unsupported, source, summary.digest, Date.now());
  assert.equal(completed.state, 'restored');
  if (completed.state === 'restored')
    assert.equal(
      await fileDigest(join(unsupported, 'rescue', completed.id, 'original-data/krono.sqlite')),
      before,
    );
  return {
    roundtrip: 'corrupt primary + WAL/SHM/journal/extra preserved bytewise; valid backup restored',
    interrupted: failures,
    rejection:
      'bad digest; malformed journal/path traversal; changed candidate; junction/hardlink; missing known base never recreated',
    missing: 'explicit restore only; original directory absence recorded',
    futureSchema: 'raw original retained without opening or migrating it',
    integrity: 'ok',
  };
}
