import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openDatabase } from '../../electron/storage/database';
import { habitRepository } from '../../electron/storage/habit-repository';
import { createBackup, restoreBackup } from '../../electron/storage/backup';
import type { HabitCommand, HabitInput } from '../../shared/contracts/habits';

export async function verifyHabitIcons(dir: string) {
  const path = join(dir, 'habit-icons.sqlite'),
    now = Date.parse('2026-01-01T12:00:00Z');
  let db = openDatabase(path),
    repository = habitRepository(db);
  const id = randomUUID(),
    input: HabitInput = {
      name: 'Treino',
      kind: 'action',
      frequency: { kind: 'daily' },
      targetMinutes: 25,
    };
  const read = () => repository.read(now, 'UTC');
  const send = (action: HabitCommand['action'], value?: HabitInput) =>
    repository.command(
      {
        action,
        commandId: randomUUID(),
        habitId: id,
        expectedRevision: read().revision,
        ...(value ? { input: value } : {}),
      },
      now,
      'UTC',
    );
  assert.equal(send('create', input).code, 'ok');
  // Payload realmente legado, sem campo novo, permanece legível.
  const row = db.prepare('SELECT payload FROM habit_versions').get() as { payload: string };
  const legacy = JSON.parse(row.payload);
  delete legacy.icon;
  db.prepare('UPDATE habit_versions SET payload=?').run(JSON.stringify(legacy));
  assert.equal(read().habits[0].icon, 'book');
  const history = read().habits[0].history;
  assert.equal(
    send('edit', { ...input, icon: 'dumbbell', frequency: { kind: 'weekdays' } }).code,
    'ok',
  );
  assert.equal(read().habits[0].icon, 'dumbbell');
  assert.deepEqual(read().habits[0].history, history);
  assert.equal(read().habits[0].frequency.kind, 'daily');
  assert.equal(read().habits[0].nextFrequency?.kind, 'weekdays');
  send('archive');
  assert.equal(read().habits[0].icon, 'dumbbell');
  send('restore');
  assert.equal(read().habits[0].icon, 'dumbbell');
  db.close();
  db = openDatabase(path);
  repository = habitRepository(db);
  assert.equal(read().habits[0].icon, 'dumbbell');
  const backupPath = join(dir, 'icon.krono-backup'),
    previous = join(dir, 'icon-previous.krono-backup');
  const summary = await createBackup(db, backupPath, now);
  send('edit', { ...input, icon: 'notebook' });
  assert.equal(read().habits[0].icon, 'notebook');
  await restoreBackup(db, backupPath, summary.digest, previous, now);
  assert.equal(read().habits[0].icon, 'dumbbell');
  assert.equal(db.pragma('user_version', { simple: true }), 5);
  db.close();
  return {
    legacy: 'default icon',
    immediate: 'metadata independent of frequency',
    archive: 'preserved',
    reopen: 'preserved',
    backup: 'roundtrip',
    schema: 5,
  };
}
