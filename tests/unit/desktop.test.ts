import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TimerService } from '../../electron/services/TimerService';
import { DesktopService } from '../../electron/desktop/DesktopService';
import {
  DesktopController,
  type DesktopPorts,
  type MenuEntry,
} from '../../electron/desktop/DesktopController';
import {
  defaultPreferences,
  preferenceUpdateSchema,
  type CompletionAlert,
} from '../../shared/contracts/desktop';
import { initialTimer } from '../../shared/domain/timer';
import type { TimerRepository } from '../../electron/storage/timer-repository';
import type { DesktopRepository } from '../../electron/storage/desktop-repository';
async function setup() {
  let record = initialTimer(),
    mono = 0,
    utc = Date.UTC(2026, 0, 1),
    fail = false;
  const commands = new Map<string, string>(),
    events = new Map<string, CompletionAlert & { claimed: boolean; dismissed: boolean }>();
  const timerRepo: TimerRepository = {
    load: async () => structuredClone(record),
    lookup: async (id) => commands.get(id) ?? null,
    commit: async (value) => {
      if (fail) throw new Error('disk');
      if (value.expectedRevision !== record.revision) throw new Error('revision');
      record = structuredClone(value.record);
      commands.set(value.command.id, value.command.fingerprint);
      if (value.result?.outcome === 'completed')
        events.set(value.result.session.id, {
          sessionId: value.result.session.id,
          phase: value.result.session.phase,
          notification: 'claimed',
          sound: 'claimed',
          claimed: false,
          dismissed: false,
        });
    },
  };
  let settings = defaultPreferences();
  const repo: DesktopRepository = {
    preferences: async () => ({ ...settings }),
    update: async (input) => {
      const value = preferenceUpdateSchema.parse(input);
      if (value.expectedRevision !== settings.revision) throw new Error('revision');
      return (settings = { ...settings, ...value.patch, revision: settings.revision + 1 });
    },
    acknowledgeHide: async () => {
      if (fail) throw new Error('disk');
      settings = { ...settings, firstHideSeen: true, revision: settings.revision + 1 };
    },
    recoverAlerts: async () => {
      for (const e of events.values()) {
        if (!e.claimed || e.notification === 'claimed' || e.sound === 'claimed') {
          e.claimed = true;
          e.notification = 'ambiguous';
          e.sound = 'ambiguous';
        }
      }
    },
    pending: async () =>
      [...events.values()]
        .filter((e) => !e.claimed)
        .map((e) => ({ sessionId: e.sessionId, phase: e.phase })),
    claim: async (id) => {
      const e = events.get(id);
      if (!e || e.claimed) return false;
      e.claimed = true;
      return true;
    },
    outcome: async (value) => {
      if (fail) throw new Error('disk');
      Object.assign(events.get(value.sessionId)!, value);
    },
    alerts: async () => ({
      alerts: [...events.values()]
        .filter((e) => !e.dismissed)
        .slice(0, 5)
        .map((e) => ({
          sessionId: e.sessionId,
          phase: e.phase,
          notification: e.notification,
          sound: e.sound,
        })),
      unread: [...events.values()].filter((e) => !e.dismissed).length,
    }),
    dismiss: async (id) => {
      events.get(id)!.dismissed = true;
    },
  };
  const timer = new TimerService(
    timerRepo,
    { monotonic: () => mono, civil: () => utc },
    'UTC',
    false,
  );
  await timer.initialize();
  const notify = vi.fn(async () => 'requested' as const),
    play = vi.fn(async (volume: number) => {
      void volume;
      return 'finished' as const;
    });
  const desktop = new DesktopService(repo, { notify, play });
  await desktop.initialize();
  desktop.setTrayAvailable(true);
  const state = {
    healthy: true,
    choice: 'cancel' as 'hide' | 'quit' | 'cancel',
    inform: true,
    menu: [] as MenuEntry[],
  };
  const ports: DesktopPorts = {
    trayHealthy: () => state.healthy,
    hide: vi.fn(),
    show: vi.fn(),
    informHide: vi.fn(async () => state.inform),
    confirmQuit: vi.fn(async () => state.choice),
    exit: vi.fn(),
    menuChanged: (menu) => {
      state.menu = menu;
    },
  };
  const controller = new DesktopController(timer, desktop, ports);
  const send = (action: 'start' | 'pause' | 'resume' | 'retry') =>
    timer.command({
      commandId: randomUUID(),
      expectedRevision: timer.read().revision,
      sessionId: timer.read().sessionId,
      action,
      ...(action === 'start'
        ? { preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 } }
        : {}),
    });
  const advance = async (ms: number) => {
    mono += ms;
    utc += ms;
    await timer.wake();
  };
  return {
    timer,
    desktop,
    controller,
    repo,
    state,
    ports,
    notify,
    play,
    events,
    send,
    advance,
    fail: (value: boolean) => {
      fail = value;
    },
    cleanup: () => {
      controller.dispose();
      desktop.dispose();
      timer.dispose();
    },
  };
}

it('X informa uma vez, esconde e mantém a mesma sessão ativa', async () => {
  const c = await setup();
  await c.send('start');
  const id = c.timer.read().sessionId;
  await c.controller.close();
  await c.controller.close();
  expect(c.ports.informHide).toHaveBeenCalledTimes(1);
  expect(c.ports.hide).toHaveBeenCalledTimes(2);
  expect(c.timer.read()).toMatchObject({ sessionId: id, state: 'running' });
  c.cleanup();
});
it('cancelar informação ou falhar em persistir não esconde a janela', async () => {
  const c = await setup();
  c.state.inform = false;
  await c.controller.close();
  expect(c.ports.hide).not.toHaveBeenCalled();
  c.state.inform = true;
  c.fail(true);
  await c.controller.close();
  expect(c.ports.hide).not.toHaveBeenCalled();
  expect(c.desktop.read().error).not.toBeNull();
  c.cleanup();
});
it('bandeja indisponível nunca esconde a única janela; sair sem sessão é explícito', async () => {
  const c = await setup();
  c.state.healthy = false;
  await c.send('start');
  await c.controller.close();
  expect(c.ports.hide).not.toHaveBeenCalled();
  expect(c.ports.exit).not.toHaveBeenCalled();
  c.state.choice = 'quit';
  await c.controller.quit();
  expect(c.ports.exit).toHaveBeenCalledTimes(1);
  expect(c.timer.read().state).toBe('paused');
  c.cleanup();
});
it('Sair oferece continuar na bandeja, pausar/sair ou cancelar', async () => {
  const c = await setup();
  await c.send('start');
  await c.controller.quit();
  expect(c.ports.exit).not.toHaveBeenCalled();
  c.state.choice = 'hide';
  await c.controller.quit();
  expect(c.ports.hide).toHaveBeenCalledTimes(1);
  c.state.choice = 'quit';
  await c.controller.quit();
  expect(c.timer.read().state).toBe('paused');
  expect(c.ports.exit).toHaveBeenCalledTimes(1);
  c.cleanup();
});
it('menu usa a mesma autoridade e não inverte ação capturada se a revisão mudou', async () => {
  const c = await setup();
  c.state.menu.find((e) => e.label === 'Iniciar foco')!.click!();
  await vi.waitFor(() => expect(c.timer.read().state).toBe('running'));
  await c.send('pause');
  const stale = c.controller.menu().find((e) => e.label === 'Retomar')!;
  await c.send('resume');
  stale.click!();
  await c.controller.suspend();
  expect(c.timer.read().state).toBe('recovering');
  expect(c.ports.show).toHaveBeenCalled();
  c.cleanup();
});
it('bloqueio continua por padrão; opção pausa, suspensão recupera e resume não inicia', async () => {
  const c = await setup();
  await c.send('start');
  await c.controller.lock();
  expect(c.timer.read().state).toBe('running');
  await c.desktop.update({
    expectedRevision: c.desktop.preferences().revision,
    patch: { pauseOnLock: true },
  });
  await c.controller.lock();
  expect(c.timer.read().state).toBe('paused');
  c.controller.resume();
  expect(c.timer.read().state).toBe('paused');
  await c.send('resume');
  await c.controller.suspend();
  expect(c.timer.read().state).toBe('recovering');
  c.controller.resume();
  expect(c.timer.read().state).toBe('recovering');
  c.cleanup();
});
it('saída forçada não fica presa em diálogo nem flush infinito', async () => {
  vi.useFakeTimers();
  const c = await setup();
  await c.send('start');
  vi.spyOn(c.ports, 'informHide').mockImplementation(() => new Promise(() => {}));
  void c.controller.close();
  vi.spyOn(c.timer, 'pauseForExit').mockImplementation(() => new Promise(() => {}));
  const exit = c.controller.quit(true);
  await vi.advanceTimersByTimeAsync(2000);
  await exit;
  expect(c.ports.exit).toHaveBeenCalledTimes(1);
  c.cleanup();
  vi.useRealTimers();
});
it('som e notificação só são solicitados depois do commit; retry não duplica', async () => {
  const c = await setup();
  await c.send('start');
  c.fail(true);
  await c.advance(1000);
  await c.desktop.flush();
  expect(c.notify).not.toHaveBeenCalled();
  c.fail(false);
  await c.send('retry');
  await Promise.all([c.desktop.flush(), c.desktop.flush()]);
  expect(c.notify).toHaveBeenCalledTimes(1);
  expect(c.play).toHaveBeenCalledExactlyOnceWith(0.4);
  expect(c.desktop.read().unread).toBe(1);
  c.cleanup();
});
it('preferências independentes, volume zero e preview respeitam silêncio', async () => {
  const c = await setup();
  await c.desktop.update({
    expectedRevision: c.desktop.preferences().revision,
    patch: { notificationsEnabled: false, soundEnabled: false },
  });
  expect(await c.desktop.preview()).toBe('disabled');
  await c.send('start');
  await c.advance(1000);
  await c.desktop.flush();
  expect(c.notify).not.toHaveBeenCalled();
  expect(c.play).not.toHaveBeenCalled();
  expect(c.desktop.read().alerts[0]).toMatchObject({ notification: 'disabled', sound: 'disabled' });
  await c.desktop.update({
    expectedRevision: c.desktop.preferences().revision,
    patch: { soundEnabled: true, volume: 0 },
  });
  expect(await c.desktop.preview()).toBe('disabled');
  c.cleanup();
});
it('pref inválida/conflitante não é anunciada como salva', async () => {
  const c = await setup();
  await c.desktop.update({ expectedRevision: 99, patch: { volume: 0.8 } });
  expect(c.desktop.preferences().volume).toBe(0.4);
  expect(c.desktop.read().error).not.toBeNull();
  expect(
    preferenceUpdateSchema.safeParse({ expectedRevision: 0, patch: { volume: NaN } }).success,
  ).toBe(false);
  expect(
    preferenceUpdateSchema.safeParse({ expectedRevision: 0, patch: { firstHideSeen: true } })
      .success,
  ).toBe(false);
  c.cleanup();
});
it('entrega falha mantém aviso interno, dispensa persiste e não repete', async () => {
  const c = await setup();
  c.notify.mockRejectedValueOnce(new Error('toast'));
  c.play.mockRejectedValueOnce(new Error('audio'));
  await c.send('start');
  await c.advance(1000);
  await c.desktop.flush();
  expect(c.desktop.read().alerts[0]).toMatchObject({ notification: 'failed', sound: 'failed' });
  await c.desktop.dismiss(c.desktop.read().alerts[0].sessionId);
  await c.desktop.flush();
  expect(c.desktop.read().unread).toBe(0);
  expect(c.notify).toHaveBeenCalledTimes(1);
  c.cleanup();
});
it('crash entre claim/entrega e persistência mantém ambiguidade sem replay', async () => {
  const c = await setup();
  await c.send('start');
  await c.advance(1000);
  await c.desktop.flush();
  const event = [...c.events.values()][0];
  event.notification = 'claimed';
  event.sound = 'claimed';
  await c.desktop.initialize();
  await c.desktop.flush();
  expect(c.desktop.read().alerts[0].notification).toBe('ambiguous');
  expect(c.notify).toHaveBeenCalledTimes(1);
  c.cleanup();
});

it('startup opt-in rejeita revisão antiga e desfaz registro se persistência falha', async () => {
  const c = await setup(),
    startup = vi.fn();
  const service = new DesktopService(c.repo, { notify: c.notify, play: c.play, startup });
  await service.initialize();
  await service.update({ expectedRevision: 99, patch: { startWithWindows: true } });
  expect(startup).not.toHaveBeenCalled();
  const update = vi.spyOn(c.repo, 'update').mockRejectedValueOnce(new Error('disk'));
  await service.update({ expectedRevision: 0, patch: { startWithWindows: true } });
  expect(startup.mock.calls).toEqual([[true], [false]]);
  expect(service.preferences().startWithWindows).toBeUndefined();
  expect(service.read().error).toBeTruthy();
  update.mockRestore();
  await service.update({ expectedRevision: 0, patch: { startWithWindows: true } });
  expect(service.preferences().startWithWindows).toBe(true);
  expect(service.read().error).toBeNull();
  service.dispose();
  c.cleanup();
});
