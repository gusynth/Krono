import { test, expect } from '../fixtures/app';

test('sete dias simulados conservam Pomodoro, vínculo, metas e crédito após reabrir autoridade', async ({
  appPage,
  electronApp,
}) => {
  const advance = (ms: number) =>
    electronApp.evaluate(async (_electron, duration) => {
      for (let remaining = duration; remaining > 0; remaining -= 30_000)
        await (
          globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }
        ).advanceTimer(Math.min(remaining, 30_000));
    }, ms);
  const initial = await appPage.evaluate(async () => {
    const habits = window.krono!.habits!,
      production = window.krono!.production!,
      timer = window.krono!.timer!;
    const id = crypto.randomUUID();
    let snapshot = await habits.read();
    const created = await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      action: 'create',
      habitId: id,
      input: {
        name: 'Estudo diário',
        kind: 'time',
        icon: 'notebook',
        targetMinutes: 60,
        frequency: { kind: 'daily' },
      },
    });
    if (created.code !== 'ok') throw new Error('CREATE_FAILED');
    snapshot = await habits.read();
    if (
      (
        await habits.command({
          commandId: crypto.randomUUID(),
          expectedRevision: snapshot.revision,
          action: 'select',
          habitId: id,
        })
      ).code !== 'ok'
    )
      throw new Error('SELECT_FAILED');
    const head = await timer.read();
    if (
      (
        await timer.command({
          commandId: crypto.randomUUID(),
          expectedRevision: head.revision,
          sessionId: head.sessionId,
          action: 'configure',
          configuration: {
            focusMinutes: 30,
            proportional: true,
            shortBreakMinutes: 5,
            longBreakMinutes: 15,
            longEvery: 4,
          },
        })
      ).code !== 'ok'
    )
      throw new Error('CONFIGURE_FAILED');
    const goals = await production.goals();
    if (
      (
        await production.command({
          commandId: crypto.randomUUID(),
          expectedRevision: goals.revision,
          expectedDate: goals.today,
          habitId: null,
          cadence: 'daily',
          targetMinutes: 60,
          applyCurrent: true,
        })
      ).code !== 'ok'
    )
      throw new Error('GOAL_FAILED');
    return { id };
  });
  for (let day = 0; day < 7; day++) {
    for (let focus = 0; focus < 4; focus++) {
      const started = await appPage.evaluate(async () => {
        const api = window.krono!.timer!,
          value = await api.read();
        return api.command({
          commandId: crypto.randomUUID(),
          expectedRevision: value.revision,
          sessionId: value.sessionId,
          action: 'start',
        });
      });
      expect(started.code).toBe('ok');
      await advance(30 * 60_000);
      const completed = await appPage.evaluate(async () => window.krono!.timer!.read());
      expect(completed.state).toBe('awaiting-next');
      expect(completed.nextPhase).toBe(focus === 3 ? 'long-break' : 'short-break');
      await appPage.evaluate(async () => {
        const api = window.krono!.timer!,
          value = await api.read();
        if (
          (
            await api.command({
              commandId: crypto.randomUUID(),
              expectedRevision: value.revision,
              sessionId: value.sessionId,
              action: 'start',
            })
          ).code !== 'ok'
        )
          throw new Error('BREAK_FAILED');
      });
      await advance((focus === 3 ? 18 : 6) * 60_000);
    }
    const habit = await appPage.evaluate(
      async (id) => (await window.krono!.habits!.read()).habits.find((item) => item.id === id)!,
      initial.id,
    );
    expect(habit.today.status).toBe('completed');
    expect(habit.today.durationMs).toBe(120 * 60_000);
    if (day < 6) {
      await electronApp.evaluate(async () =>
        (globalThis as unknown as { restartTimer: () => Promise<unknown> }).restartTimer(),
      );
      await appPage.reload();
      await appPage
        .getByRole('navigation')
        .getByRole('button', { name: 'Foco', exact: true })
        .click();
    }
  }
  const report = await appPage.evaluate(
    async (id) => ({
      production: await window.krono!.production!.read({ days: 7, habitId: id }),
      goals: await window.krono!.production!.goals(),
      head: await window.krono!.timer!.read(),
      habits: await window.krono!.habits!.read(),
    }),
    initial.id,
  );
  expect(report.production.metrics.sessions).toBe(28);
  expect(report.production.metrics.eligibleMs).toBe(840 * 60_000);
  expect(report.production.daysData.map((day) => day.durationMs)).toEqual(
    Array(7).fill(120 * 60_000),
  );
  expect(report.habits.selectedId).toBe(initial.id);
  expect(report.head.configuration?.focusMinutes).toBe(30);
  expect(report.goals.daily.definition?.targetMs).toBe(60 * 60_000);
  expect(report.goals.daily.actualMs).toBe(120 * 60_000);
  expect(report.goals.daily.percent).toBe(200);
  expect(report.head.state).toBe('awaiting-next');
  // Relógio e reabertura do TimerService são sintéticos; não é um piloto humano de sete dias.
});
