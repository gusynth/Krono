import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BackupService } from '../../electron/services/BackupService';
import { TimerService } from '../../electron/services/TimerService';
import {
  backupAppVersionSchema,
  backupReplySchema,
  restoreRequestSchema,
  type BackupSummary,
} from '../../shared/contracts/backup';
import { initialTimer } from '../../shared/domain/timer';
import type { TimerRecord } from '../../shared/contracts/timer';

const summary: BackupSummary = {
  format: 1,
  schema: 5,
  appVersion: '0.1.0',
  createdUtcMs: 1000,
  sessions: 2,
  habits: 1,
  bytes: 100,
  digest: 'a'.repeat(64),
};
async function setup(rescuePorts = false) {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/backup-unit-')),
    root = join(dir, 'profile');
  await mkdir(root);
  const source = join(dir, 'source.krono-backup');
  await writeFile(source, 'synthetic');
  let record: TimerRecord = initialTimer();
  const timer = new TimerService(
    {
      load: async () => record,
      lookup: async () => null,
      commit: async (value) => {
        record = value.record;
      },
    },
    { monotonic: () => 0, civil: () => 1000 },
    'UTC',
    false,
  );
  await timer.initialize();
  const calls: { type: string; value?: unknown }[] = [];
  const state = {
    save: join(dir, 'export.krono-backup') as string | null,
    choose: source as string | null,
    now: 1000,
    restarts: 0,
    failure: false,
    lostAck: false,
    unknown: false,
    restartFails: false,
    restored: false,
    stage: '',
    rescueAllowed: false,
    rescues: 0,
    rescueFails: false,
    rescueUncertain: false,
  };
  const service = new BackupService(
    root,
    async (type, value) => {
      calls.push({ type, value });
      const input = value as { path: string };
      if (type === 'backup:copy') {
        await writeFile(input.path, 'synthetic-backup');
        return;
      }
      if (type === 'backup:restore') {
        if (state.failure || state.unknown) throw new Error('synthetic');
        state.restored = true;
        if (state.lostAck) throw new Error('lost ACK');
        return;
      }
      if (type === 'backup:status') {
        if (state.unknown) throw new Error('worker exit');
        return { restored: state.restored };
      }
      throw new Error('unexpected');
    },
    timer,
    {
      ...(rescuePorts
        ? {
            canRescue: () => state.rescueAllowed,
            rescue: async (path: string, digest: string): Promise<'restored' | 'uncertain'> => {
              expect(path).toBe(state.stage);
              expect(digest).toBe(summary.digest);
              state.rescues++;
              if (state.rescueFails) throw new Error('rescue failure before journal');
              return state.rescueUncertain ? 'uncertain' : 'restored';
            },
          }
        : {}),
      save: async () => state.save,
      choose: async () => state.choose,
      validate: async (path) => {
        state.stage = path;
        return summary;
      },
      restart: async () => {
        state.restarts++;
        if (state.restartFails) throw new Error('restart');
      },
    },
    () => state.now,
  );
  return { service, timer, state, calls, dir, root };
}
it('contrato exige token e confirmação explícita, sem caminhos do renderer', () => {
  expect(restoreRequestSchema.safeParse({ token: randomUUID() }).success).toBe(false);
  expect(
    restoreRequestSchema.safeParse({
      token: randomUUID(),
      confirmReplacement: true,
      path: 'anything',
    }).success,
  ).toBe(false);
  expect(
    backupReplySchema.safeParse({ code: 'saved', summary: { ...summary, schema: 99 }, token: null })
      .success,
  ).toBe(false);
});
it('exporta por destino escolhido, cancela e impede sobrescrever perfil/SQLite', async () => {
  const { service, state, root } = await setup();
  expect((await service.export()).code).toBe('saved');
  expect((await stat(state.save!)).size).toBeGreaterThan(0);
  state.save = join(root, 'data.krono-backup');
  expect((await service.export()).code).toBe('invalid');
  await mkdir(join(root, '..internal'));
  state.save = join(root, '..internal', 'data.krono-backup');
  expect((await service.export()).code).toBe('invalid');
  state.save = join(root, '..', 'arbitrary.sqlite');
  expect((await service.export()).code).toBe('invalid');
  state.save = null;
  expect((await service.export()).code).toBe('canceled');
});
it('cancelar inspeção remove apenas o staging criado pelo serviço', async () => {
  const { service, state } = await setup();
  const inspected = await service.inspect();
  expect(inspected.code).toBe('inspected');
  await stat(state.stage);
  await service.cancel();
  await expect(stat(state.stage)).rejects.toThrow();
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'invalid',
  );
});
it('limpeza de staging só remove nomes reservados e conserva arquivos alheios', async () => {
  const { service, root } = await setup(),
    dir = join(root, 'staging');
  await mkdir(dir);
  const owned = join(dir, `${randomUUID()}.krono-backup`),
    other = join(dir, 'manual.txt');
  await writeFile(owned, 'synthetic');
  await writeFile(`${owned}-shm`, 'synthetic');
  await writeFile(other, 'keep');
  await service.cleanStaging();
  await expect(stat(owned)).rejects.toThrow();
  await expect(stat(`${owned}-shm`)).rejects.toThrow();
  expect((await stat(other)).size).toBe(4);
});
it('token expirado ou trocado não restaura nem reinicia', async () => {
  const { service, state, calls } = await setup();
  const inspected = await service.inspect();
  state.now += 600_000;
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'invalid',
  );
  expect(calls.some((call) => call.type === 'backup:restore')).toBe(false);
  expect(state.restarts).toBe(0);
});
it('sessão running ou paused bloqueia restauração no main sem perder dados', async () => {
  const { service, timer, calls } = await setup();
  const inspected = await service.inspect();
  await timer.command({
    commandId: randomUUID(),
    expectedRevision: 0,
    sessionId: null,
    action: 'start',
  });
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'busy',
  );
  const current = timer.read();
  await timer.command({
    commandId: randomUUID(),
    expectedRevision: current.revision,
    sessionId: current.sessionId,
    action: 'pause',
  });
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'busy',
  );
  expect(calls.some((call) => call.type === 'backup:restore')).toBe(false);
  timer.dispose();
});
it('base indisponível apresenta erro sem confundir com sessão ativa ou tentar substituir', async () => {
  const { service, timer, calls } = await setup();
  const inspected = await service.inspect();
  timer.storageLost();
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'error',
  );
  expect(calls.some((call) => call.type === 'backup:restore')).toBe(false);
  timer.dispose();
});
it('restauração serializada impede início já enfileirado e repetição do comando', async () => {
  const { service, timer, state } = await setup();
  const inspected = await service.inspect();
  const restoring = service.restore({ token: inspected.token, confirmReplacement: true });
  const starting = timer.command({
    commandId: randomUUID(),
    expectedRevision: 0,
    sessionId: null,
    action: 'start',
  });
  expect((await restoring).code).toBe('restored');
  expect((await starting).code).toBe('invalid');
  expect(state.restarts).toBe(1);
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'busy',
  );
});
it('falha confirmada antes do commit libera retry sem reiniciar', async () => {
  const { service, state } = await setup();
  const inspected = await service.inspect();
  state.failure = true;
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'error',
  );
  expect(state.restarts).toBe(0);
  state.failure = false;
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'restored',
  );
});
it('ACK perdido é confirmado pelo writer sem repetir substituição', async () => {
  const { service, state, calls } = await setup();
  const inspected = await service.inspect();
  state.lostAck = true;
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'restored',
  );
  expect(state.restarts).toBe(1);
  expect(calls.filter((call) => call.type === 'backup:restore')).toHaveLength(1);
});
it('writer perdido deixa resultado incerto e exige reinício conservador', async () => {
  const { service, state } = await setup();
  const inspected = await service.inspect();
  state.unknown = true;
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'uncertain',
  );
  expect(state.restarts).toBe(1);
  expect((await service.export()).code).toBe('busy');
});
it('falha de reinício após commit não anuncia falha de restauração ou permite replay', async () => {
  const { service, state } = await setup();
  const inspected = await service.inspect();
  state.restartFails = true;
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'restored',
  );
  expect((await service.inspect()).code).toBe('busy');
});
it('resgate exige inspeção nesse modo e confirmação específica; não promove restauração normal', async () => {
  const { service, state, timer } = await setup(true);
  const healthy = await service.inspect();
  state.rescueAllowed = true;
  timer.storageLost();
  expect(
    (await service.restore({ token: healthy.token, confirmReplacement: true, rescue: true })).code,
  ).toBe('invalid');
  expect(state.rescues).toBe(0);
  const inspected = await service.inspect();
  expect(inspected.rescue).toBe(true);
  expect((await service.restore({ token: inspected.token, confirmReplacement: true })).code).toBe(
    'invalid',
  );
  expect(state.rescues).toBe(0);
  expect(
    (await service.restore({ token: inspected.token, confirmReplacement: true, rescue: true }))
      .code,
  ).toBe('restored');
  expect(state.rescues).toBe(1);
  expect(state.restarts).toBe(1);
  expect(
    (await service.restore({ token: inspected.token, confirmReplacement: true, rescue: true }))
      .code,
  ).toBe('busy');
});
it('resgate recusa base saudável e perda da garantia de writer encerrado', async () => {
  const { service, state, timer } = await setup(true);
  state.rescueAllowed = true;
  const inspected = await service.inspect();
  const request = { token: inspected.token, confirmReplacement: true, rescue: true };
  expect((await service.restore(request)).code).toBe('error');
  expect(state.rescues).toBe(0);
  timer.storageLost();
  state.rescueAllowed = false;
  expect((await service.restore(request)).code).toBe('invalid');
  expect(state.rescues).toBe(0);
  timer.dispose();
});
it('resgate falho antes da intenção mantém retry; resultado incerto exige reinício sem replay', async () => {
  const { service, state, timer } = await setup(true);
  state.rescueAllowed = true;
  state.rescueFails = true;
  timer.storageLost();
  const inspected = await service.inspect(),
    request = { token: inspected.token, confirmReplacement: true, rescue: true };
  expect((await service.restore(request)).code).toBe('error');
  expect(state.restarts).toBe(0);
  state.rescueFails = false;
  state.rescueUncertain = true;
  const restoring = service.restore(request),
    starting = timer.command({
      commandId: randomUUID(),
      expectedRevision: timer.read().revision,
      sessionId: timer.read().sessionId,
      action: 'start',
    });
  expect((await restoring).code).toBe('uncertain');
  expect((await starting).code).not.toBe('ok');
  expect(state.restarts).toBe(1);
  expect((await service.inspect()).code).toBe('busy');
  expect(state.rescues).toBe(2);
});
it('cancelamento e expiração não executam resgate', async () => {
  const { service, state, timer } = await setup(true);
  state.rescueAllowed = true;
  timer.storageLost();
  const inspected = await service.inspect();
  await service.cancel();
  expect(
    (await service.restore({ token: inspected.token, confirmReplacement: true, rescue: true }))
      .code,
  ).toBe('invalid');
  const next = await service.inspect();
  state.now += 600_000;
  expect(
    (await service.restore({ token: next.token, confirmReplacement: true, rescue: true })).code,
  ).toBe('invalid');
  expect(state.rescues).toBe(0);
  expect(state.restarts).toBe(0);
  timer.dispose();
});

it('backups aceitam versão atual e anteriores conhecidas, recusando versão futura desconhecida', async () => {
  const { appVersion } = await import('../../shared/version');
  expect(backupAppVersionSchema.safeParse(appVersion).success).toBe(true);
  expect(backupAppVersionSchema.safeParse('1.1.0').success).toBe(true);
  expect(backupAppVersionSchema.safeParse('1.2.0').success).toBe(true);
  expect(backupAppVersionSchema.safeParse('1.3.0').success).toBe(true);
  expect(backupAppVersionSchema.safeParse('1.3.1').success).toBe(true);
  expect(backupAppVersionSchema.safeParse('99.0.0').success).toBe(false);
});
