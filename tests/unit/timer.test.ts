import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TimerService } from '../../electron/services/TimerService';
import type { TimerCommit, TimerRepository } from '../../electron/storage/timer-repository';
import { initialTimer, activeMs, allocateDays } from '../../shared/domain/timer';
import {
  acceptsTimerSnapshot,
  timerCommandSchema,
  presetSchema,
  defaultTimerConfiguration,
  timerRecordSchema,
  type TimerCommand,
  type TimerSession,
} from '../../shared/contracts/timer';
import { configuredPreset } from '../../shared/domain/pomodoro';

function setup(initial = initialTimer(), automatic = false, timezone = 'UTC') {
  let record = structuredClone(initial),
    mono = 0,
    civil = Date.UTC(2026, 0, 1),
    fail = false,
    lostAck = false;
  const commands = new Map<string, string>();
  const results: NonNullable<TimerCommit['result']>[] = [];
  const repository: TimerRepository = {
    load: async () => structuredClone(record),
    lookup: async (id) => commands.get(id) ?? null,
    commit: async (input) => {
      if (fail) throw new Error('disk');
      if (record.revision !== input.expectedRevision || commands.has(input.command.id))
        throw new Error('conflict');
      commands.set(input.command.id, input.command.fingerprint);
      record = structuredClone(input.record);
      if (input.result) results.push(structuredClone(input.result));
      if (lostAck) {
        lostAck = false;
        throw new Error('lost acknowledgement');
      }
    },
  };
  const timer = new TimerService(
    repository,
    { monotonic: () => mono, civil: () => civil },
    timezone,
    automatic,
  );
  const command = (action: TimerCommand['action'], rest: Partial<TimerCommand> = {}) => ({
    commandId: randomUUID(),
    expectedRevision: timer.read().revision,
    sessionId: timer.read().sessionId,
    action,
    ...rest,
  });
  return {
    timer,
    repository,
    command,
    results,
    persisted: () => structuredClone(record),
    advance: (ms: number) => {
      mono += ms;
      civil += ms;
    },
    civil: (ms: number) => {
      civil += ms;
    },
    fail: (value: boolean) => {
      fail = value;
    },
    loseAck: () => {
      lostAck = true;
    },
  };
}
const preset = { focusMs: 10_000, shortBreakMs: 2000, longBreakMs: 4000, longEvery: 4 };
async function running() {
  const context = setup();
  await context.timer.initialize();
  await context.timer.command(context.command('start', { preset }));
  return context;
}

describe('contratos do timer', () => {
  it.each([0, -1, NaN, Infinity, 28_800_001, 1.5])('recusa duração %s', (value) =>
    expect(presetSchema.safeParse({ ...preset, focusMs: value }).success).toBe(false),
  );
  it('resposta atrasada não apaga erro com a mesma revisão; retry explícito pode limpar', async () => {
    const c = await running();
    const runningSnapshot = c.timer.read();
    c.timer.storageLost();
    const error = c.timer.read();
    expect(error.revision).toBe(runningSnapshot.revision);
    expect(acceptsTimerSnapshot(error, runningSnapshot)).toBe(false);
    expect(acceptsTimerSnapshot(error, runningSnapshot, true)).toBe(true);
    expect(
      acceptsTimerSnapshot(error, { ...runningSnapshot, revision: error.revision - 1 }, true),
    ).toBe(false);
  });
  it('recusa canais genéricos, campos extras e revisão inválida', () => {
    const value = {
      commandId: randomUUID(),
      expectedRevision: 0,
      sessionId: null,
      action: 'start',
    };
    expect(timerCommandSchema.safeParse(value).success).toBe(true);
    expect(timerCommandSchema.safeParse({ ...value, file: 'anything' }).success).toBe(false);
    expect(timerCommandSchema.safeParse({ ...value, expectedRevision: -1 }).success).toBe(false);
    expect(timerCommandSchema.safeParse({ ...value, commandId: 'invalid' }).success).toBe(false);
  });
});

describe('autoridade temporal serializada', () => {
  it('scheduler real do serviço acorda no prazo e dispose remove o timeout', async () => {
    vi.useFakeTimers();
    const c = setup(initialTimer(), true);
    try {
      await c.timer.initialize();
      await c.timer.command(c.command('start', { preset }));
      c.advance(10_000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(c.timer.read().state).toBe('awaiting-next');
      expect(c.results).toHaveLength(1);
      await c.timer.command(c.command('start'));
      expect(vi.getTimerCount()).toBe(1);
      c.timer.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      c.timer.dispose();
      vi.useRealTimers();
    }
  });
  it('saída normal pausa com o segmento final e reabre sem contar offline', async () => {
    const c = await running();
    c.advance(3000);
    await c.timer.pauseForExit();
    expect(c.persisted().state).toBe('paused');
    expect(activeMs(c.persisted().session)).toBe(3000);
    const next = setup(c.persisted());
    next.advance(90_000);
    await next.timer.initialize();
    expect(next.timer.read()).toMatchObject({ state: 'paused', elapsedMs: 3000 });
  });
  it('recompõe atraso sem deriva, limita ao prazo e conclui uma vez', async () => {
    const c = await running();
    c.advance(12_000);
    await c.timer.wake();
    await c.timer.wake();
    expect(c.timer.read()).toMatchObject({
      state: 'awaiting-next',
      remainingMs: 0,
      elapsedMs: 10_000,
      cycle: 1,
      nextPhase: 'short-break',
    });
    expect(c.results).toHaveLength(1);
    expect(activeMs(c.results[0].session)).toBe(10_000);
  });
  it('pausa congela, retomar cria segmento e tempo pausado não conta', async () => {
    const c = await running();
    c.advance(3000);
    await c.timer.command(c.command('pause'));
    c.advance(25_000);
    expect(c.timer.read().remainingMs).toBe(7000);
    await c.timer.command(c.command('resume'));
    c.advance(7000);
    await c.timer.wake();
    expect(c.results[0].session.segments.map((segment) => segment.durationMs)).toEqual([
      3000, 7000,
    ]);
  });
  it('pausa e cancelamento no prazo perdem para a conclusão única', async () => {
    const c = await running();
    c.advance(10_000);
    const pause = c.command('pause'),
      cancel = c.command('cancel');
    const replies = await Promise.all([
      c.timer.command(pause),
      c.timer.command(cancel),
      c.timer.wake(),
    ]);
    expect(replies[0]?.code).toBe('conflict');
    expect(replies[1]?.code).toBe('conflict');
    expect(c.results).toHaveLength(1);
    expect(c.results[0].outcome).toBe('completed');
  });
  it('comando repetido é idempotente; mesmo ID com conteúdo diferente conflita', async () => {
    const c = setup();
    await c.timer.initialize();
    const start = c.command('start', { preset });
    expect((await c.timer.command(start)).code).toBe('ok');
    const id = c.timer.read().sessionId;
    expect((await c.timer.command(start)).code).toBe('ok');
    expect(c.timer.read().sessionId).toBe(id);
    expect((await c.timer.command({ ...start, phase: 'short-break' })).code).toBe('conflict');
  });
  it('não permite duas sessões nem alteração de contexto/preset em andamento', async () => {
    const c = await running();
    expect((await c.timer.command(c.command('start'))).code).toBe('invalid');
    expect((await c.timer.command(c.command('select-phase', { phase: 'short-break' }))).code).toBe(
      'invalid',
    );
    expect(
      (await c.timer.command(c.command('pause', { preset: { ...preset, focusMs: 2000 } }))).code,
    ).toBe('invalid');
    expect(c.persisted().session?.preset).toEqual(preset);
  });
  it('ignora revisão e sessão antigas e callbacks de outra geração', async () => {
    const c = await running();
    const old = c.command('pause');
    await c.timer.command(c.command('cancel'));
    await c.timer.command(c.command('start', { preset }));
    const before = c.timer.read();
    c.advance(1000);
    await c.timer.wake(2);
    expect(c.timer.read().revision).toBe(before.revision);
    expect((await c.timer.command(old)).code).toBe('conflict');
    expect(c.results).toHaveLength(1);
    expect(c.results[0].outcome).toBe('interrupted');
  });
  it('checkpoint confirmado recupera sem creditar offline e exige confirmação', async () => {
    const c = await running();
    c.advance(3000);
    await c.timer.wake();
    c.advance(5000);
    const restarted = setup(c.persisted());
    restarted.advance(86_400_000);
    await restarted.timer.initialize();
    expect(restarted.timer.read()).toMatchObject({
      state: 'recovering',
      elapsedMs: 3000,
      remainingMs: 7000,
    });
    await restarted.timer.command(restarted.command('recover'));
    restarted.advance(7000);
    await restarted.timer.wake();
    expect(activeMs(restarted.results[0].session)).toBe(10_000);
  });
  it('suspensão conserva somente o checkpoint e descartar não completa foco', async () => {
    const c = await running();
    c.advance(2000);
    await c.timer.wake();
    c.advance(3000);
    await c.timer.suspend();
    expect(c.timer.read()).toMatchObject({ state: 'recovering', elapsedMs: 2000 });
    await c.timer.command(c.command('discard'));
    expect(c.timer.read().cycle).toBe(0);
    expect(c.results[0].outcome).toBe('interrupted');
  });
  it.each(['gap', 'civil'] as const)('ambiguidade %s não inventa duração', async (kind) => {
    const c = await running();
    c.advance(2000);
    await c.timer.wake();
    if (kind === 'gap') c.advance(90_000);
    else {
      c.advance(1000);
      c.civil(-3_600_000);
    }
    await c.timer.wake();
    expect(c.timer.read()).toMatchObject({ state: 'recovering', elapsedMs: 2000, cycle: 0 });
    expect(c.results).toHaveLength(0);
  });
  it('erro de disco bloqueia avanço; retry usa o mesmo commit e não conta intervalo do erro', async () => {
    const c = await running();
    c.advance(10_000);
    c.fail(true);
    await c.timer.wake();
    expect(c.timer.read().state).toBe('storage-error');
    expect(c.timer.read().cycle).toBe(0);
    expect(c.results).toHaveLength(0);
    c.advance(90_000);
    c.fail(false);
    await c.timer.command(c.command('retry'));
    expect(c.timer.read()).toMatchObject({ state: 'awaiting-next', cycle: 1 });
    expect(c.results).toHaveLength(1);
    expect((await c.timer.command(c.command('retry'))).code).toBe('invalid');
  });
  it('ack perdido depois do commit não duplica resultado nem crédito', async () => {
    const c = await running();
    c.advance(10_000);
    c.loseAck();
    await c.timer.wake();
    expect(c.timer.read().state).toBe('storage-error');
    await c.timer.command(c.command('retry'));
    expect(c.results).toHaveLength(1);
    expect(c.timer.read().cycle).toBe(1);
  });
  it('falha em pausar retoma pelo retry sem contar o tempo do erro', async () => {
    const c = await running();
    c.advance(2000);
    c.fail(true);
    await c.timer.command(c.command('pause'));
    c.advance(20_000);
    c.fail(false);
    await c.timer.command(c.command('retry'));
    expect(c.timer.read()).toMatchObject({ state: 'paused', elapsedMs: 2000 });
  });
  it('livre escolhido antes de iniciar pode ser finalizado sem incrementar Pomodoro', async () => {
    const c = setup();
    await c.timer.initialize();
    await c.timer.command(c.command('start', { phase: 'free' }));
    c.advance(3000);
    await c.timer.command(c.command('finish'));
    expect(c.timer.read()).toMatchObject({ state: 'awaiting-next', cycle: 0 });
    expect(c.results[0].outcome).toBe('completed');
    expect(activeMs(c.results[0].session)).toBe(3000);
    const focus = await running();
    expect((await focus.timer.command(focus.command('finish'))).code).toBe('invalid');
  });
  it('perda do worker congela imediatamente no checkpoint e pede recuperação após reconexão', async () => {
    const c = await running();
    c.advance(2000);
    await c.timer.wake();
    c.advance(1000);
    c.timer.storageLost();
    expect(c.timer.read()).toMatchObject({ state: 'storage-error', elapsedMs: 2000 });
    c.advance(60_000);
    expect(c.timer.read().elapsedMs).toBe(2000);
    await c.timer.command(c.command('retry'));
    expect(c.timer.read()).toMatchObject({ state: 'recovering', elapsedMs: 2000 });
  });
  it('quarto foco gera pausa longa; pausa não incrementa ciclo e próximo estágio é manual', async () => {
    const c = setup();
    await c.timer.initialize();
    for (let index = 1; index <= 4; index++) {
      await c.timer.command(c.command('start', { phase: 'focus', preset }));
      c.advance(10_000);
      await c.timer.wake();
      expect(c.timer.read().nextPhase).toBe(index === 4 ? 'long-break' : 'short-break');
      c.advance(5000);
      expect(c.timer.read().state).toBe('awaiting-next');
      if (index < 4) {
        await c.timer.command(c.command('start'));
        c.advance(2000);
        await c.timer.wake();
        expect(c.timer.read().cycle).toBe(index);
      }
    }
    await c.timer.command(c.command('start'));
    expect(c.timer.read().phase).toBe('long-break');
    c.advance(4000);
    await c.timer.wake();
    expect(c.timer.read().cycle).toBe(4);
  });
});

describe('alocação civil de segmentos', () => {
  function session(startUtcMs: number, durationMs: number, timezone: string): TimerSession {
    return {
      id: randomUUID(),
      phase: 'focus',
      preset,
      timezone,
      startedUtcMs: startUtcMs,
      segments: [{ startUtcMs, durationMs }],
    };
  }
  it('conserva exatamente o crédito entre datas e não inclui pausa', () => {
    const s = session(Date.parse('2026-01-01T23:50:00Z'), 25 * 60_000, 'UTC');
    expect(allocateDays(s)).toEqual([
      { date: '2026-01-01', durationMs: 600_000 },
      { date: '2026-01-02', durationMs: 900_000 },
    ]);
  });
  it.each([
    ['2026-03-08T05:00:00Z', 23],
    ['2026-11-01T04:00:00Z', 25],
  ] as const)('dia DST de %s preserva %s horas', (start, hours) => {
    const s = session(Date.parse(start), hours * 3_600_000, 'America/New_York');
    expect(allocateDays(s)).toHaveLength(1);
    expect(allocateDays(s)[0].durationMs).toBe(hours * 3_600_000);
  });
});

describe('configuração persistente do Pomodoro', () => {
  const config = { ...defaultTimerConfiguration, focusMinutes: 30 };
  it('deriva pausas exatas e mantém compatibilidade com estado anterior sem configuração', () => {
    expect(configuredPreset(config)).toEqual({
      focusMs: 1_800_000,
      shortBreakMs: 360_000,
      longBreakMs: 1_080_000,
      longEvery: 4,
    });
    expect(configuredPreset({ ...config, focusMinutes: 31 }).shortBreakMs).toBe(372_000);
    expect(
      configuredPreset({
        ...config,
        proportional: false,
        shortBreakMinutes: 9,
        longBreakMinutes: 22,
      }),
    ).toEqual({ focusMs: 1_800_000, shortBreakMs: 540_000, longBreakMs: 1_320_000, longEvery: 4 });
    expect(timerRecordSchema.parse(initialTimer()).configuration).toBeUndefined();
  });
  it('salva uma vez, reabre e inicia da configuração confirmada', async () => {
    const c = setup();
    await c.timer.initialize();
    const command = c.command('configure', { configuration: config });
    expect((await c.timer.command(command)).code).toBe('ok');
    expect((await c.timer.command(command)).code).toBe('ok');
    const reopened = setup(c.persisted());
    await reopened.timer.initialize();
    expect(reopened.timer.read()).toMatchObject({ configuration: config, remainingMs: 1_800_000 });
    await reopened.timer.command(reopened.command('start'));
    expect(reopened.persisted().session?.preset).toEqual(configuredPreset(config));
    expect(c.results).toHaveLength(0);
  });
  it('configurar durante foco conserva tempo e pausa original; próximo foco recebe mudança', async () => {
    const c = await running();
    c.advance(3000);
    expect((await c.timer.command(c.command('configure', { configuration: config }))).code).toBe(
      'ok',
    );
    expect(c.timer.read()).toMatchObject({ elapsedMs: 3000, remainingMs: 7000 });
    c.advance(7000);
    await c.timer.wake();
    await c.timer.command(c.command('start'));
    expect(c.timer.read()).toMatchObject({ phase: 'short-break', remainingMs: 2000 });
    c.advance(2000);
    await c.timer.wake();
    await c.timer.command(c.command('start'));
    expect(c.timer.read()).toMatchObject({ phase: 'focus', remainingMs: 1_800_000 });
    expect(c.results.filter((result) => result.session.phase === 'focus')).toHaveLength(1);
  });
  it('nova frequência reinicia somente o conjunto local, inclusive após cancelar e selecionar fase', async () => {
    const c = setup({ ...initialTimer(), cycle: 3 });
    await c.timer.initialize();
    await c.timer.command(c.command('configure', { configuration: { ...config, longEvery: 2 } }));
    await c.timer.command(c.command('start'));
    expect(c.timer.read().focusNumber).toBe(1);
    await c.timer.command(c.command('cancel'));
    await c.timer.command(c.command('select-phase', { phase: 'focus' }));
    await c.timer.command(c.command('start'));
    expect(c.persisted().cycleBase).toBe(3);
    expect(c.timer.read().cycle).toBe(3);
    // Usar focos curtos explícitos para provar a frequência sem aguardar minutos reais.
    await c.timer.command(c.command('cancel'));
    await c.timer.command(c.command('start', { preset: { ...preset, longEvery: 2 } }));
    c.advance(10_000);
    await c.timer.wake();
    expect(c.timer.read().nextPhase).toBe('short-break');
    await c.timer.command(c.command('start'));
    c.advance(2000);
    await c.timer.wake();
    await c.timer.command(c.command('start', { preset: { ...preset, longEvery: 2 } }));
    c.advance(10_000);
    await c.timer.wake();
    expect(c.timer.read()).toMatchObject({ cycle: 5, nextPhase: 'long-break' });
  });
  it('recusa campos incompatíveis e limites inválidos sem alterar estado', async () => {
    const c = setup();
    await c.timer.initialize();
    for (const configuration of [
      { ...config, focusMinutes: 0 },
      { ...config, focusMinutes: 241 },
      { ...config, focusMinutes: NaN },
      { ...config, longEvery: 13 },
      { ...config, shortBreakMinutes: 0 },
    ])
      expect((await c.timer.command(c.command('configure', { configuration }))).code).toBe(
        'invalid',
      );
    expect(
      (await c.timer.command(c.command('configure', { configuration: config, preset }))).code,
    ).toBe('invalid');
    expect((await c.timer.command(c.command('pause', { configuration: config }))).code).toBe(
      'invalid',
    );
    expect(c.timer.read().revision).toBe(0);
  });
  it('falha/retry conserva o mesmo comando e não confirma configuração antes de salvar', async () => {
    const c = setup();
    await c.timer.initialize();
    c.fail(true);
    expect((await c.timer.command(c.command('configure', { configuration: config }))).code).toBe(
      'storage-error',
    );
    expect(c.timer.read().configuration).toBeUndefined();
    c.fail(false);
    expect((await c.timer.command(c.command('retry'))).code).toBe('ok');
    expect(c.timer.read().configuration).toEqual(config);
    expect(c.results).toHaveLength(0);
  });
});

describe('conjuntos diários e foco único', () => {
  it('encerra progresso de outro dia ao acordar ou reabrir, sem mudar conclusões', async () => {
    const c = setup();
    await c.timer.initialize();
    for (let n = 0; n < 2; n++) {
      await c.timer.command(c.command('start', { phase: 'focus', preset }));
      c.advance(10_000);
      await c.timer.wake();
    }
    expect(c.timer.read()).toMatchObject({ cycle: 2, state: 'awaiting-next' });
    c.civil(7 * 86_400_000);
    await c.timer.wake();
    expect(c.timer.read()).toMatchObject({
      state: 'idle',
      phase: 'focus',
      focusNumber: 1,
      cycle: 2,
    });
    expect(c.results).toHaveLength(2);
    expect(c.persisted().cycleBase).toBe(2);
    const old = { ...c.persisted(), cycleDate: '2025-12-25', cycleBase: 0 };
    const reopened = setup(old);
    await reopened.timer.initialize();
    expect(reopened.timer.read()).toMatchObject({ state: 'idle', focusNumber: 1, cycle: 2 });
    expect(reopened.results).toHaveLength(0);
  });
  it('aposenta progresso legado sem data e preserva registro vazio compatível', async () => {
    const c = setup({ ...initialTimer(), cycle: 2 });
    await c.timer.initialize();
    expect(c.persisted()).toMatchObject({ cycle: 2, cycleBase: 2, cycleDate: '2026-01-01' });
    const empty = setup();
    await empty.timer.initialize();
    expect(empty.timer.read().revision).toBe(0);
  });
  it('usa um único agendamento na meia-noite local e o remove ao sair', async () => {
    vi.useFakeTimers();
    const c = setup(initialTimer(), true);
    try {
      c.civil(86_380_000);
      await c.timer.initialize();
      await c.timer.command(c.command('start', { preset }));
      c.advance(10_000);
      await c.timer.wake();
      expect(vi.getTimerCount()).toBe(1);
      c.advance(10_000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(c.timer.read()).toMatchObject({ state: 'idle', focusNumber: 1, cycle: 1 });
      expect(c.results).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      c.timer.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });
  it('a virada usa o fuso local, não a data UTC', async () => {
    const c = setup(initialTimer(), false, 'America/Sao_Paulo');
    c.civil(86_390_000);
    await c.timer.initialize();
    await c.timer.command(c.command('start', { preset }));
    c.advance(10_000);
    await c.timer.wake();
    expect(c.timer.read().state).toBe('awaiting-next');
    c.civil(3 * 3_600_000);
    await c.timer.wake();
    expect(c.timer.read().state).toBe('idle');
  });
  it('foco atravessando meia-noite termina integralmente e próximo conjunto começa em um', async () => {
    const c = setup();
    c.civil(86_395_000);
    await c.timer.initialize();
    await c.timer.command(c.command('start', { preset }));
    const id = c.timer.read().sessionId;
    c.advance(5000);
    await c.timer.wake();
    expect(c.timer.read()).toMatchObject({ state: 'running', sessionId: id, elapsedMs: 5000 });
    c.advance(5000);
    await c.timer.wake();
    expect(c.timer.read()).toMatchObject({
      state: 'idle',
      focusNumber: 1,
      cycle: 1,
      focusCompleted: true,
    });
    expect(allocateDays(c.results[0].session)).toEqual([
      { date: '2026-01-01', durationMs: 5000 },
      { date: '2026-01-02', durationMs: 5000 },
    ]);
  });
  it.each(['resume', 'end-cycle'] as const)(
    'preserva sessão pausada de outro dia ao %s',
    async (action) => {
      const c = await running();
      c.advance(3000);
      await c.timer.command(c.command('pause'));
      const id = c.timer.read().sessionId;
      c.civil(7 * 86_400_000);
      await c.timer.wake();
      expect(c.timer.read()).toMatchObject({ state: 'paused', sessionId: id, elapsedMs: 3000 });
      await c.timer.command(c.command(action));
      if (action === 'resume') {
        c.advance(7000);
        await c.timer.wake();
        expect(c.results[0].outcome).toBe('completed');
      } else {
        expect(c.results[0].outcome).toBe('interrupted');
        expect(activeMs(c.results[0].session)).toBe(3000);
      }
      expect(c.timer.read()).toMatchObject({ state: 'idle', focusNumber: 1 });
    },
  );
  it('foco único conclui uma vez, encerra ciclo e conserva a opção na recuperação', async () => {
    const c = setup();
    await c.timer.initialize();
    await c.timer.command(c.command('set-single-focus', { singleFocus: true }));
    await c.timer.command(c.command('start', { preset }));
    c.advance(3000);
    await c.timer.wake();
    await c.timer.suspend();
    expect(c.persisted().session?.singleFocus).toBe(true);
    await c.timer.command(c.command('recover'));
    c.advance(7000);
    await c.timer.wake();
    await c.timer.wake();
    expect(c.timer.read()).toMatchObject({
      state: 'idle',
      focusNumber: 1,
      cycle: 1,
      focusCompleted: true,
      singleFocus: false,
      canEndCycle: false,
    });
    expect(c.results).toHaveLength(1);
    expect(activeMs(c.results[0].session)).toBe(10_000);
    expect(timerRecordSchema.safeParse(c.persisted()).success).toBe(true);
    const reopened = setup(c.persisted());
    await reopened.timer.initialize();
    expect(reopened.timer.read().focusCompleted).toBe(true);
    await reopened.timer.command(reopened.command('start', { preset }));
    expect(reopened.timer.read()).toMatchObject({ singleFocus: false, focusCompleted: false });
  });
  it('encerrar conjunto concluído é idempotente e não duplica resultado', async () => {
    const c = await running();
    c.advance(10_000);
    await c.timer.wake();
    const end = c.command('end-cycle');
    expect((await c.timer.command(end)).code).toBe('ok');
    expect((await c.timer.command(end)).code).toBe('ok');
    expect(c.results).toHaveLength(1);
    expect(c.timer.read()).toMatchObject({ state: 'idle', focusNumber: 1, cycle: 1 });
    expect((await c.timer.command({ ...end, commandId: randomUUID() })).code).toBe('conflict');
  });
  it('encerrar foco em andamento preserva parcial sem incrementar o total', async () => {
    const c = await running();
    c.advance(4000);
    await c.timer.command(c.command('end-cycle'));
    expect(c.results[0].outcome).toBe('interrupted');
    expect(activeMs(c.results[0].session)).toBe(4000);
    expect(c.timer.read()).toMatchObject({ cycle: 0, focusNumber: 1, state: 'idle' });
  });
  it('falha ao encerrar só confirma após retry e não duplica foco já salvo', async () => {
    const c = await running();
    c.advance(10_000);
    await c.timer.wake();
    c.fail(true);
    expect((await c.timer.command(c.command('end-cycle'))).code).toBe('storage-error');
    expect(c.persisted().state).toBe('awaiting-next');
    c.fail(false);
    await c.timer.command(c.command('retry'));
    expect(c.timer.read()).toMatchObject({ state: 'idle', focusNumber: 1, cycle: 1 });
    expect(c.results).toHaveLength(1);
  });
  it('recusa opção de foco único durante sessão e em comandos incompatíveis', async () => {
    const c = await running();
    const before = c.timer.read();
    expect((await c.timer.command(c.command('set-single-focus', { singleFocus: true }))).code).toBe(
      'invalid',
    );
    expect((await c.timer.command(c.command('pause', { singleFocus: true }))).code).toBe('invalid');
    expect(c.timer.read()).toEqual(before);
  });
});

describe('limites do encerramento diário', () => {
  it.each([
    ['2026-03-08T05:00:00Z', 23],
    ['2026-11-01T04:00:00Z', 25],
  ] as const)('agenda dia local de %s com %s horas', async (start, hours) => {
    vi.useFakeTimers();
    const c = setup(initialTimer(), true, 'America/New_York');
    try {
      c.civil(Date.parse(start) - Date.UTC(2026, 0, 1));
      await c.timer.initialize();
      await c.timer.command(c.command('start', { preset }));
      c.advance(10_000);
      await c.timer.wake();
      const until = hours * 3_600_000 - 10_000;
      c.advance(until - 1);
      await vi.advanceTimersByTimeAsync(until - 1);
      expect(c.timer.read().state).toBe('awaiting-next');
      c.advance(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(c.timer.read()).toMatchObject({ state: 'idle', focusNumber: 1, cycle: 1 });
    } finally {
      c.timer.dispose();
      vi.useRealTimers();
    }
  });
  it('no prazo a conclusão vence encerrar ciclo e não transforma o foco em parcial', async () => {
    const c = await running();
    c.advance(10_000);
    expect((await c.timer.command(c.command('end-cycle'))).code).toBe('conflict');
    expect(c.results).toHaveLength(1);
    expect(c.results[0].outcome).toBe('completed');
    await c.timer.command(c.command('end-cycle'));
    expect(c.timer.read().focusNumber).toBe(1);
    expect(c.results).toHaveLength(1);
  });
  it('perda do reconhecimento de foco único não duplica resultado ao tentar novamente', async () => {
    const c = setup();
    await c.timer.initialize();
    await c.timer.command(c.command('set-single-focus', { singleFocus: true }));
    await c.timer.command(c.command('start', { preset }));
    c.advance(10_000);
    c.loseAck();
    await c.timer.wake();
    expect(c.timer.read().state).toBe('storage-error');
    await c.timer.command(c.command('retry'));
    expect(c.results).toHaveLength(1);
    expect(c.timer.read()).toMatchObject({ state: 'idle', cycle: 1, focusCompleted: true });
  });
});

it('estado legado aguardando pausa agenda a virada mesmo sem cycleDate', async () => {
  vi.useFakeTimers();
  const start = Date.parse('2026-01-01T23:59:40Z');
  const c = setup(
    {
      ...initialTimer(),
      state: 'awaiting-next',
      phase: 'focus',
      nextPhase: 'short-break',
      cycle: 1,
      session: {
        id: randomUUID(),
        phase: 'focus',
        preset,
        timezone: 'UTC',
        startedUtcMs: start,
        segments: [{ startUtcMs: start, durationMs: 10_000 }],
      },
    },
    true,
  );
  try {
    c.civil(86_390_000);
    await c.timer.initialize();
    expect(c.timer.read().state).toBe('awaiting-next');
    expect(vi.getTimerCount()).toBe(1);
    c.advance(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.timer.read()).toMatchObject({ state: 'idle', cycle: 1, focusNumber: 1 });
  } finally {
    c.timer.dispose();
    vi.useRealTimers();
  }
});

it.each(['cancel', 'discard'] as const)(
  'encerrar sessão legada por %s também aposenta o conjunto antigo',
  async (action) => {
    const start = Date.UTC(2026, 0, 1);
    const c = setup({
      ...initialTimer(),
      cycle: 2,
      state: action === 'discard' ? 'recovering' : 'paused',
      session: {
        id: randomUUID(),
        phase: 'focus',
        preset,
        timezone: 'UTC',
        startedUtcMs: start,
        segments: [{ startUtcMs: start, durationMs: 1000 }],
      },
    });
    c.civil(7 * 86_400_000);
    await c.timer.initialize();
    await c.timer.command(c.command(action));
    expect(c.timer.read()).toMatchObject({ state: 'idle', cycle: 2, focusNumber: 1 });
    expect(c.persisted()).toMatchObject({ cycleBase: 2, cycleDate: '2026-01-08' });
    expect(c.results[0].outcome).toBe('interrupted');
    expect(timerRecordSchema.safeParse(c.persisted()).success).toBe(true);
  },
);
