import { it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { AutomaticBackup } from '../../electron/services/AutomaticBackup';
import { HistoryExport, csvCell } from '../../electron/services/HistoryExport';
import { RoutineScheduler } from '../../electron/desktop/RoutineScheduler';
import { defaultPreferences, preferencesSchema } from '../../shared/contracts/desktop';
import type { ProductionService } from '../../electron/services/ProductionService';
it('backup automático valida antes de publicar, limita a sete e preserva arquivos alheios', async () => {
  const root = await mkdtemp(resolve('.test-data/automatic-'));
  let now = 1_800_000_000_000,
    invalid = false;
  const copy = vi.fn(async (path: string) => {
    await writeFile(path, 'synthetic backup');
  });
  const service = new AutomaticBackup(
    root,
    copy,
    async () => {
      if (invalid) throw Error('hash');
      return {
        format: 1,
        schema: 5,
        appVersion: '1.1.0',
        createdUtcMs: now,
        sessions: 1,
        habits: 1,
        bytes: 16,
        digest: 'a'.repeat(64),
      };
    },
    () => now,
  );
  const folder = await service.directory();
  await writeFile(join(folder, 'manual.krono-backup'), 'keep');
  for (let i = 0; i < 10; i++) {
    await service.run();
    await service.run();
    now += 86_400_000;
  }
  expect(copy).toHaveBeenCalledTimes(10);
  expect((await readdir(folder)).filter((n) => n.startsWith('auto-'))).toHaveLength(7);
  expect(await readFile(join(folder, 'manual.krono-backup'), 'utf8')).toBe('keep');
  const before = await service.status();
  invalid = true;
  await service.run();
  expect((await service.status()).lastBackupUtcMs).toBe(before.lastBackupUtcMs);
  expect((await service.status()).error).toBeTruthy();
  expect((await readdir(folder)).some((n) => n.startsWith('pending-'))).toBe(false);
});
it('CSV neutraliza fórmulas, preserva aspas e pagina com recorte congelado', async () => {
  expect(csvCell(' =2+2')).toBe('"\' =2+2"');
  expect(csvCell('a"b')).toBe('"a""b"');
  const root = await mkdtemp(resolve('.test-data/export-')),
    outside = await mkdtemp(resolve('.test-data/export-destination-'));
  const destination = join(outside, 'history.csv');
  const cursor = { beforeUtcMs: 1, beforeId: crypto.randomUUID(), ceiling: 10, context: 'fixture' };
  const row = {
    completionDate: '2026-10-23',
    timezone: 'UTC',
    phase: 'focus',
    outcome: 'completed',
    habitName: '=HYPERLINK("x")',
    activeMs: 1000,
    eligibleMs: 1000,
  };
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      endDate: '2026-10-23',
      ceiling: 10,
      history: [row],
      nextCursor: cursor,
    })
    .mockResolvedValueOnce({ history: [], nextCursor: null });
  const service = new HistoryExport(
    { history: read } as unknown as ProductionService,
    root,
    async () => destination,
  );
  expect(await service.export()).toBe('saved');
  expect(read.mock.calls[1]![0]).toMatchObject({ endDate: '2026-10-23', ceiling: 10, cursor });
  expect(await readFile(destination, 'utf8')).toContain("'=HYPERLINK");
  const protectedExport = new HistoryExport(
    { history: read } as unknown as ProductionService,
    root,
    async () => join(root, 'bad.csv'),
  );
  await expect(protectedExport.export()).rejects.toThrow('INVALID_EXPORT_DESTINATION');
});
it('preferências antigas continuam válidas; novos presets/lembretes respeitam limites', () => {
  expect(preferencesSchema.parse(defaultPreferences()).autoBackup).toBeUndefined();
  expect(
    preferencesSchema.safeParse({ ...defaultPreferences(), habitReminder: '25:61' }).success,
  ).toBe(false);
  expect(
    preferencesSchema.safeParse({
      ...defaultPreferences(),
      presets: Array.from({ length: 7 }, () => ({
        name: 'x',
        configuration: {
          focusMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          longEvery: 4,
          proportional: true,
        },
      })),
    }).success,
  ).toBe(false);
});
it('rotina diária não faz polling nem envia lembrete depois de cancelar', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 23, 10, 0));
  const backup = vi.fn(async () => {}),
    reminder = vi.fn(async () => {}),
    service = new RoutineScheduler(backup, reminder);
  service.update({ ...defaultPreferences(), autoBackup: true, habitReminder: '10:01' });
  expect(backup).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_100);
  expect(reminder).toHaveBeenCalledTimes(1);
  service.update({ ...defaultPreferences(), habitReminder: null });
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(reminder).toHaveBeenCalledTimes(1);
  service.dispose();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it('backup acima do limite não substitui cópias anteriores', async () => {
  const root = await mkdtemp(resolve('.test-data/automatic-limit-'));
  const service = new AutomaticBackup(
    root,
    async (path) => {
      await writeFile(path, 'synthetic');
    },
    async () => ({
      format: 1,
      schema: 5,
      appVersion: '1.1.0',
      createdUtcMs: 1_800_000_000_000,
      sessions: 1,
      habits: 1,
      bytes: 129 * 1024 * 1024,
      digest: 'b'.repeat(64),
    }),
  );
  await service.run();
  expect((await service.status()).lastBackupUtcMs).toBeNull();
  expect((await service.status()).error).toBeTruthy();
  expect(await readdir(await service.directory())).toEqual([]);
});
it('lembrete vencido durante suspensão não é recuperado ao despertar', async () => {
  vi.useFakeTimers();
  const initial = new Date(2026, 9, 23, 10, 0);
  vi.setSystemTime(initial);
  let now = initial;
  const remind = vi.fn(async () => {}),
    service = new RoutineScheduler(
      async () => {},
      remind,
      () => now,
    );
  service.update({ ...defaultPreferences(), habitReminder: '10:01' });
  now = new Date(2026, 9, 23, 12, 0);
  await vi.advanceTimersByTimeAsync(60_100);
  expect(remind).not.toHaveBeenCalled();
  service.dispose();
  vi.useRealTimers();
});
