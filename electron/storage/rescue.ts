import { copyFile, lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { inspectBackup, fileDigest } from './backup';
import { markStorageInitialized } from './startup';

const fileSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .refine((name) => basename(name) === name && name !== '.' && name !== '..'),
    bytes: z.number().int().nonnegative(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const operationSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    createdUtcMs: z.number().int().nonnegative(),
    backupDigest: z.string().regex(/^[a-f0-9]{64}$/),
    candidateDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sourceDirectoryMissing: z.boolean(),
    files: z.array(fileSchema),
  })
  .strict();
type Operation = z.infer<typeof operationSchema>;
export type RescueResult = { state: 'none' } | { state: 'restored'; id: string };
const insist = (value: unknown) => {
  if (!value) throw new Error('RESCUE_UNSAFE');
};
async function info(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
async function directory(path: string, create = false) {
  if (create && !(await info(path))) await mkdir(path);
  const value = await lstat(path);
  insist(value.isDirectory() && !value.isSymbolicLink());
}
async function durable(path: string, value: string) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(value, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
}
async function json(path: string) {
  const value = await lstat(path);
  insist(value.isFile() && !value.isSymbolicLink() && value.size <= 1_048_576);
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
function paths(root: string, id: string) {
  const base = join(resolve(root), 'rescue'),
    operation = join(base, id);
  return {
    base,
    operation,
    pending: join(base, 'pending.json'),
    data: join(root, 'data'),
    original: join(operation, 'original-data'),
    candidate: join(operation, 'replacement-data'),
    manifest: join(operation, 'operation.json'),
    receipt: join(operation, 'committed.json'),
  };
}
async function files(path: string): Promise<Operation['files']> {
  await directory(path);
  const result: Operation['files'] = [];
  for (const name of (await readdir(path)).sort()) {
    const full = join(path, name),
      value = await lstat(full);
    insist(value.isFile() && !value.isSymbolicLink() && value.nlink === 1);
    result.push({ name, bytes: value.size, digest: await fileDigest(full) });
  }
  return result;
}
async function originalMatches(path: string, operation: Operation) {
  insist(JSON.stringify(await files(path)) === JSON.stringify(operation.files));
}
async function candidateMatches(path: string, operation: Operation) {
  await directory(path);
  const entries = await readdir(path);
  insist(entries.length === 1 && entries[0] === 'krono.sqlite');
  const file = join(path, 'krono.sqlite'),
    value = await lstat(file);
  insist(
    value.isFile() &&
      !value.isSymbolicLink() &&
      value.nlink === 1 &&
      (await fileDigest(file)) === operation.candidateDigest,
  );
}

/** Executar somente sem writer aberto, antes de qualquer tentativa de abrir SQLite. */
export async function resumeRescue(root: string): Promise<RescueResult> {
  root = resolve(root);
  await directory(root);
  const base = join(root, 'rescue');
  if (!(await info(base))) return { state: 'none' };
  await directory(base);
  const pending = join(base, 'pending.json');
  if (!(await info(pending))) return { state: 'none' };
  const marker = z
    .object({ version: z.literal(1), id: z.string().uuid() })
    .strict()
    .parse(await json(pending));
  const p = paths(root, marker.id);
  await directory(p.operation);
  const operation = operationSchema.parse(await json(p.manifest));
  insist(operation.id === marker.id);
  const current = await info(p.data),
    archived = await info(p.original),
    replacement = await info(p.candidate);
  if (current && !archived && replacement) {
    await originalMatches(p.data, operation);
    await candidateMatches(p.candidate, operation);
    // Renames no mesmo volume preservam o diretório completo, inclusive WAL/SHM/journal.
    await rename(p.data, p.original);
  } else insist(!!archived && ((!current && !!replacement) || (!!current && !replacement)));
  await originalMatches(p.original, operation);
  if (!(await info(p.data))) {
    await candidateMatches(p.candidate, operation);
    await rename(p.candidate, p.data);
  }
  await candidateMatches(p.data, operation);
  const receipt = { version: 1, id: marker.id, candidateDigest: operation.candidateDigest };
  if (await info(p.receipt))
    insist(JSON.stringify(await json(p.receipt)) === JSON.stringify(receipt));
  else await durable(p.receipt, JSON.stringify(receipt));
  await rm(p.pending);
  return { state: 'restored', id: marker.id };
}

export async function rescueDatabase(
  root: string,
  source: string,
  digest: string,
  now: number,
): Promise<RescueResult> {
  root = resolve(root);
  await directory(root);
  const id = randomUUID(),
    p = paths(root, id);
  await directory(p.base, true);
  insist(!(await info(p.pending)));
  await inspectBackup(source, digest);
  const sourceDirectoryMissing = !(await info(p.data));
  if (sourceDirectoryMissing) {
    await markStorageInitialized(root);
    await mkdir(p.data);
  }
  const originals = await files(p.data); // Não abre nem interpreta os arquivos indisponíveis.
  await mkdir(p.operation);
  await mkdir(p.candidate);
  const candidate = join(p.candidate, 'krono.sqlite');
  await copyFile(source, candidate, constants.COPYFILE_EXCL);
  await inspectBackup(candidate, digest);
  // O conteúdo restaurado vira base normal; manifesto pertence só ao arquivo de backup.
  const db = new Database(candidate, { fileMustExist: true });
  try {
    db.pragma('synchronous=FULL');
    db.transaction(() => {
      db.exec('DROP TABLE backup_manifest');
      db.pragma('application_id=0');
    })();
  } finally {
    db.close();
  }
  const handle = await open(candidate, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  const operation: Operation = {
    version: 1,
    id,
    createdUtcMs: now,
    backupDigest: digest,
    candidateDigest: await fileDigest(candidate),
    sourceDirectoryMissing,
    files: originals,
  };
  await durable(p.manifest, JSON.stringify(operation));
  await originalMatches(p.data, operation);
  // Publicar a intenção durável precede todo movimento do diretório original.
  await durable(p.pending, JSON.stringify({ version: 1, id }));
  return resumeRescue(root);
}
