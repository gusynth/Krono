import { test, expect } from '../fixtures/app';
import { choose } from '../fixtures/choice';

test('arquivar mantém contraste no hover; excluir exige confirmação, cancela e persiste', async ({
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  await appPage.getByRole('form').getByLabel('Nome', { exact: true }).fill('Excluir teste');
  await appPage.getByRole('button', { name: 'Salvar hábito', exact: true }).click();
  const habit = appPage.getByRole('article', { name: 'Excluir teste', exact: true });
  await habit.getByRole('button', { name: 'Concluir hoje', exact: true }).click();
  await habit.getByRole('button', { name: 'Arquivar', exact: true }).click();
  let dialog = appPage.getByRole('alertdialog', { name: 'Arquivar hábito', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Confirmar', exact: true });
  const before = await confirm.evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
  }));
  await confirm.hover();
  expect(
    await confirm.evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
    })),
  ).toEqual(before);
  await confirm.click();
  await appPage.getByLabel('Mostrar arquivados').check();
  await habit.getByRole('button', { name: 'Excluir', exact: true }).click();
  dialog = appPage.getByRole('alertdialog', {
    name: 'Excluir hábito permanentemente',
    exact: true,
  });
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await expect(
    dialog.getByRole('button', { name: 'Excluir permanentemente', exact: true }),
  ).toBeDisabled();
  await appPage.keyboard.press('Escape');
  await expect(habit).toBeVisible();
  await habit.getByRole('button', { name: 'Excluir', exact: true }).click();
  await dialog.getByLabel('Entendo que a exclusão é permanente').check();
  await dialog.getByRole('button', { name: 'Excluir permanentemente', exact: true }).click();
  await expect(habit).toHaveCount(0);
  await expect(appPage.getByRole('button', { name: 'Novo hábito', exact: true })).toBeFocused();
  await appPage.reload();
  expect(
    await appPage.evaluate(async () => (await window.krono!.habits!.read()).habits.length),
  ).toBe(0);
});

test('excluir hábito de tempo conserva total global e remove filtro antigo de Produção', async ({
  appPage,
  electronApp,
}) => {
  const id = await appPage.evaluate(async () => {
    const habits = window.krono!.habits!,
      timer = window.krono!.timer!,
      id = crypto.randomUUID();
    let value = await habits.read();
    await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: value.revision,
      action: 'create',
      habitId: id,
      input: {
        name: 'Tempo para excluir',
        kind: 'time',
        targetMinutes: 1,
        frequency: { kind: 'daily' },
      },
    });
    value = await habits.read();
    await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: value.revision,
      action: 'select',
      habitId: id,
    });
    const state = await timer.read();
    await timer.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      sessionId: state.sessionId,
      action: 'start',
      preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    });
    return id;
  });
  await electronApp.evaluate(async () =>
    (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(1000),
  );
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Produção', exact: true })
    .click();
  await choose(appPage.getByRole('combobox', { name: 'Hábito em Produção', exact: true }), id);
  await expect(appPage.locator('.production-metrics')).toContainText('1 s');
  // A fase concluída ainda conserva a sessão atual para o próximo passo manual.
  await appPage.evaluate(async (id) => {
    const habits = window.krono!.habits!,
      value = await habits.read();
    const reply = await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: value.revision,
      action: 'delete',
      habitId: id,
      confirmPermanent: true,
    });
    if (reply.code !== 'invalid') throw new Error('CURRENT_SESSION_MUST_BE_PRESERVED');
    const timer = window.krono!.timer!,
      state = await timer.read();
    await timer.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      sessionId: state.sessionId,
      action: 'select-phase',
      phase: 'focus',
    });
  }, id);
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage
    .getByRole('article', { name: 'Tempo para excluir', exact: true })
    .getByRole('button', { name: 'Excluir', exact: true })
    .click();
  const dialog = appPage.getByRole('alertdialog', {
    name: 'Excluir hábito permanentemente',
    exact: true,
  });
  await dialog.getByLabel('Entendo que a exclusão é permanente').check();
  await dialog.getByRole('button', { name: 'Excluir permanentemente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Produção', exact: true })
    .click();
  await expect(
    appPage.getByRole('combobox', { name: 'Hábito em Produção', exact: true }),
  ).toContainText('Todos os Focos');
  await expect(appPage.locator('.production-metrics')).toContainText('1 s');
  const value = await appPage.evaluate(async () =>
    window.krono!.production!.read({ days: 30, habitId: null }),
  );
  expect(value.metrics.eligibleMs).toBe(1000);
  expect(value.metrics.sessions).toBe(1);
});
