import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, open } from 'node:fs/promises';
import { z } from 'zod';
import { habitIconSchema } from '../../shared/contracts/habit-icon';
import { openDatabase } from './database';
import {
  backupAppVersionSchema,
  backupSummarySchema,
  type BackupSummary,
} from '../../shared/contracts/backup';
import { timerRepository } from './timer-repository';
import { timerSessionSchema } from '../../shared/contracts/timer';
import { activeMs, allocateDays, duration } from '../../shared/domain/timer';
import type { TimerSession } from '../../shared/contracts/timer';
import { civilDate } from '../../shared/domain/habits';
import { localDateSchema, frequencySchema } from '../../shared/contracts/habits';
import { preferencesSchema, deliverySchema } from '../../shared/contracts/desktop';
import { appVersion } from '../../shared/version';

export const backupApplicationId = 0x4b524e4f;
export const maxBackupBytes = 512 * 1024 * 1024;
const manifestSchema = z
  .object({
    id: z.literal(1),
    format: z.literal(1),
    schema: z.literal(5),
    app_version: backupAppVersionSchema,
    created_utc: z.number().int().nonnegative(),
  })
  .strict();
const habitVersionSchema = z
  .object({
    date: localDateSchema,
    active: z.boolean(),
    frequency: frequencySchema,
    targetMinutes: z.number().int().min(1).max(480),
    icon: habitIconSchema.optional(),
  })
  .strict();
const requireValid = (condition: unknown) => {
  if (!condition) throw new Error('INVALID_BACKUP');
};
const tables = (db: Database.Database) =>
  (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'backup_manifest' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export async function fileDigest(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function syncFile(path: string) {
  const file = await open(path, 'r+');
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

function validateData(db: Database.Database) {
  requireValid(db.pragma('integrity_check', { simple: true }) === 'ok');
  requireValid((db.pragma('foreign_key_check') as unknown[]).length === 0);
  requireValid(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type IN ('trigger','view')")
        .get() as { n: number }
    ).n === 0,
  );
  const model = openDatabase(':memory:');
  try {
    requireValid(JSON.stringify(tables(db)) === JSON.stringify(tables(model)));
    for (const table of tables(model))
      requireValid(
        JSON.stringify(db.pragma(`table_info(${quote(table)})`)) ===
          JSON.stringify(model.pragma(`table_info(${quote(table)})`)),
      );
  } finally {
    model.close();
  }
  requireValid(
    JSON.stringify(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()) ===
      JSON.stringify([1, 2, 3, 4, 5].map((version) => ({ version }))),
  );
  const head = timerRepository(db).load();
  if (head.session?.habitId)
    requireValid(
      !!db.prepare("SELECT 1 FROM habits WHERE id=? AND kind='time'").get(head.session.habitId),
    );
  for (const row of db.prepare('SELECT payload FROM desktop_preferences').iterate() as Iterable<{
    payload: string;
  }>)
    preferencesSchema.parse(JSON.parse(row.payload));
  for (const row of db
    .prepare('SELECT notification,sound FROM desktop_alerts')
    .iterate() as Iterable<{ notification: string; sound: string }>) {
    deliverySchema.parse(row.notification);
    deliverySchema.parse(row.sound);
  }
  const sessionSegments = db.prepare(
    'SELECT start_utc AS startUtcMs,duration_ms AS durationMs FROM focus_segments WHERE session_id=? ORDER BY ordinal',
  );
  const credits = db.prepare(
    'SELECT local_date AS date,duration_ms AS durationMs FROM focus_daily_credit WHERE session_id=? ORDER BY local_date',
  );
  const contributions = db.prepare(
    'SELECT local_date AS date,duration_ms AS durationMs FROM habit_contributions WHERE session_id=? ORDER BY local_date',
  );
  const allocations = (session: TimerSession) => {
    const sum = new Map<string, number>();
    for (const segment of session.segments) {
      if (!segment.durationMs) continue;
      const first = civilDate(segment.startUtcMs, session.timezone),
        last = civilDate(segment.startUtcMs + segment.durationMs - 1, session.timezone);
      const days =
        first === last
          ? [{ date: first, durationMs: segment.durationMs }]
          : allocateDays({ ...session, segments: [segment] });
      for (const day of days) sum.set(day.date, (sum.get(day.date) ?? 0) + day.durationMs);
    }
    return [...sum]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, durationMs]) => ({ date, durationMs }));
  };
  for (const row of db.prepare('SELECT * FROM focus_sessions').iterate() as Iterable<{
    id: string;
    phase: string;
    outcome: string;
    timezone: string;
    started_utc: number;
    completed_utc: number;
    active_ms: number;
    eligible_ms: number;
    payload: string;
    completion_date: string;
    habit_id: string | null;
  }>) {
    const value = timerSessionSchema.parse(JSON.parse(row.payload));
    z.number().int().nonnegative().parse(row.completed_utc);
    requireValid(['completed', 'interrupted'].includes(row.outcome));
    requireValid(
      value.id === row.id &&
        value.phase === row.phase &&
        value.timezone === row.timezone &&
        value.startedUtcMs === row.started_utc &&
        (value.habitId ?? null) === row.habit_id,
    );
    requireValid(
      civilDate(row.completed_utc, row.timezone) === row.completion_date &&
        activeMs(value) === row.active_ms,
    );
    const limit = duration(value.phase, value.preset);
    requireValid(
      limit === null ||
        (row.outcome === 'completed' ? row.active_ms === limit : row.active_ms <= limit),
    );
    requireValid(
      row.eligible_ms ===
        (row.outcome === 'completed' && ['focus', 'free'].includes(row.phase) ? row.active_ms : 0),
    );
    requireValid(JSON.stringify(sessionSegments.all(row.id)) === JSON.stringify(value.segments));
    requireValid(
      JSON.stringify(credits.all(row.id)) ===
        JSON.stringify(row.eligible_ms > 0 ? allocations(value) : []),
    );
    const habit = value.habitId
      ? (db.prepare("SELECT timezone FROM habits WHERE id=? AND kind='time'").get(value.habitId) as
          { timezone: string } | undefined)
      : undefined;
    if (value.habitId) requireValid(habit);
    requireValid(
      JSON.stringify(contributions.all(row.id)) ===
        JSON.stringify(
          row.eligible_ms > 0 && habit ? allocations({ ...value, timezone: habit.timezone }) : [],
        ),
    );
  }
  requireValid(
    !db
      .prepare(
        'SELECT s.id FROM focus_sessions s LEFT JOIN (SELECT session_id,SUM(duration_ms) AS total FROM focus_daily_credit GROUP BY session_id) c ON c.session_id=s.id WHERE s.eligible_ms<>COALESCE(c.total,0) LIMIT 1',
      )
      .get(),
  );
  requireValid(
    !db
      .prepare(
        'SELECT c.session_id FROM habit_contributions c JOIN focus_sessions s ON s.id=c.session_id WHERE s.habit_id IS NULL OR s.habit_id<>c.habit_id LIMIT 1',
      )
      .get(),
  );
  requireValid((db.prepare('SELECT COUNT(*) AS n FROM habits').get() as { n: number }).n <= 100);
  for (const row of db
    .prepare('SELECT id,name,timezone,created_date FROM habits')
    .iterate() as Iterable<{ id: string; name: string; timezone: string; created_date: string }>) {
    z.string().uuid().parse(row.id);
    z.string().min(1).max(80).parse(row.name);
    localDateSchema.parse(row.created_date);
    civilDate(0, row.timezone);
    requireValid(!!db.prepare('SELECT 1 FROM habit_versions WHERE habit_id=?').get(row.id));
  }
  for (const row of db
    .prepare('SELECT effective_date,payload FROM habit_versions')
    .iterate() as Iterable<{ effective_date: string; payload: string }>)
    requireValid(habitVersionSchema.parse(JSON.parse(row.payload)).date === row.effective_date);
  for (const table of ['habit_checks', 'habit_contributions', 'focus_daily_credit'])
    for (const row of db.prepare(`SELECT local_date FROM ${table}`).iterate() as Iterable<{
      local_date: string;
    }>)
      localDateSchema.parse(row.local_date);
  z.object({
    revision: z.number().int().nonnegative(),
    selected_id: z.string().uuid().nullable(),
  }).parse(db.prepare('SELECT revision,selected_id FROM habit_state WHERE id=1').get());
  z.object({ revision: z.number().int().nonnegative() }).parse(
    db.prepare('SELECT revision FROM production_goal_state WHERE id=1').get(),
  );
  for (const row of db
    .prepare('SELECT scope,cadence,effective_date,timezone,target_ms FROM production_goal_versions')
    .iterate() as Iterable<{
    scope: string;
    cadence: string;
    effective_date: string;
    timezone: string;
    target_ms: number | null;
  }>) {
    localDateSchema.parse(row.effective_date);
    civilDate(0, row.timezone);
    requireValid(
      row.scope === 'global' ||
        (!!db.prepare("SELECT 1 FROM habits WHERE id=? AND kind='time'").get(row.scope.slice(6)) &&
          row.scope.startsWith('habit:')),
    );
    requireValid(
      ['daily', 'weekly'].includes(row.cadence) &&
        (row.target_ms === null ||
          (Number.isSafeInteger(row.target_ms) &&
            row.target_ms > 0 &&
            row.target_ms <= (row.cadence === 'daily' ? 86_400_000 : 604_800_000))),
    );
  }
}

export async function inspectBackup(path: string, digest?: string): Promise<BackupSummary> {
  const size = await stat(path);
  requireValid(size.isFile() && size.size > 0 && size.size <= maxBackupBytes);
  const actualDigest = await fileDigest(path);
  if (digest) requireValid(digest === actualDigest);
  const db = new Database(path, { readonly: true, fileMustExist: true, timeout: 1500 });
  try {
    db.pragma('query_only=ON');
    db.pragma('trusted_schema=OFF');
    requireValid(
      db.pragma('application_id', { simple: true }) === backupApplicationId &&
        db.pragma('user_version', { simple: true }) === 5,
    );
    requireValid(db.pragma('journal_mode', { simple: true }) === 'delete');
    const manifest = manifestSchema.parse(db.prepare('SELECT * FROM backup_manifest').get());
    requireValid(
      (db.prepare('SELECT COUNT(*) AS n FROM backup_manifest').get() as { n: number }).n === 1,
    );
    validateData(db);
    return backupSummarySchema.parse({
      format: manifest.format,
      schema: manifest.schema,
      appVersion: manifest.app_version,
      createdUtcMs: manifest.created_utc,
      sessions: (db.prepare('SELECT COUNT(*) AS n FROM focus_sessions').get() as { n: number }).n,
      habits: (db.prepare('SELECT COUNT(*) AS n FROM habits').get() as { n: number }).n,
      bytes: size.size,
      digest: actualDigest,
    });
  } finally {
    db.close();
  }
}

export async function writeBackup(db: Database.Database, path: string, now: number) {
  // SQLite online backup incorpora WAL confirmado, sem copiar apenas o arquivo principal.
  await db.backup(path);
  const copy = new Database(path, { fileMustExist: true });
  try {
    copy.pragma('journal_mode=DELETE');
    copy.pragma('synchronous=FULL');
    copy.transaction(() => {
      copy.exec(
        'DROP TABLE IF EXISTS backup_manifest; CREATE TABLE backup_manifest(id INTEGER PRIMARY KEY CHECK(id=1),format INTEGER NOT NULL,schema INTEGER NOT NULL,app_version TEXT NOT NULL,created_utc INTEGER NOT NULL)',
      );
      copy.prepare('INSERT INTO backup_manifest VALUES(1,1,5,?,?)').run(appVersion, now);
      copy.pragma(`application_id=${backupApplicationId}`);
    })();
  } finally {
    copy.close();
  }
  await syncFile(path);
}

export async function createBackup(db: Database.Database, path: string, now: number) {
  await writeBackup(db, path, now);
  return inspectBackup(path);
}

export async function restoreBackup(
  db: Database.Database,
  path: string,
  digest: string,
  previousPath: string,
  now: number,
) {
  requireValid(['idle', 'awaiting-next'].includes(timerRepository(db).load().state));
  await inspectBackup(path, digest);
  await createBackup(db, previousPath, now); // Falhar aqui impede qualquer substituição.
  replaceFromBackup(db, path);
}

/** Núcleo transacional; chamado somente depois da validação e da cópia anterior. */
export function replaceFromBackup(db: Database.Database, path: string) {
  db.prepare('ATTACH DATABASE ? AS incoming').run(path);
  try {
    db.transaction(() => {
      db.pragma('defer_foreign_keys=ON');
      const names = tables(db);
      for (const table of names) db.exec(`DELETE FROM main.${quote(table)}`);
      for (const table of names) {
        const columns = (db.pragma(`table_info(${quote(table)})`) as { name: string }[])
          .map((column) => quote(column.name))
          .join(',');
        db.exec(
          `INSERT INTO main.${quote(table)}(${columns}) SELECT ${columns} FROM incoming.${quote(table)}`,
        );
      }
      requireValid((db.pragma('foreign_key_check') as unknown[]).length === 0);
    })();
  } finally {
    try {
      db.exec('DETACH DATABASE incoming');
    } catch {
      /* O commit não vira falha por cleanup; processo será reiniciado. */
    }
  }
}
