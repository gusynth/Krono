import { choose } from '../fixtures/choice';
import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../fixtures/app';
const navigate = (page: Page, name = 'Produção') =>
  page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
async function seed(app: ElectronApplication, count: number) {
  await app.evaluate(async (_electron, number) => {
    await (
      globalThis as unknown as { seedProductionSessions: (count: number) => Promise<void> }
    ).seedProductionSessions(number);
  }, count);
}

test('Produção real: meta por teclado, Foco concluído, excedente, histórico e data passada', async ({
  appPage,
  electronApp,
}) => {
  await navigate(appPage);
  await expect(appPage.getByRole('region', { name: 'Histórico de sessões' })).toContainText(
    'Nenhuma sessão de foco neste período.',
  );
  await appPage.getByRole('button', { name: 'Editar meta diária', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  const form = appPage.getByRole('form', { name: 'Editar meta diária' });
  await expect(form.getByRole('checkbox', { name: 'Sem meta', exact: true })).toBeFocused();
  await form.getByRole('checkbox', { name: 'Sem meta', exact: true }).uncheck();
  await form.getByLabel('Alvo em minutos', { exact: true }).fill('1');
  await form.getByRole('checkbox', { name: 'Aplicar a partir de hoje', exact: false }).check();
  await form.getByRole('button', { name: 'Salvar meta' }).click();
  await expect(form).toHaveCount(0);
  await expect(
    appPage.getByRole('button', { name: 'Editar meta diária', exact: true }),
  ).toBeFocused();
  await navigate(appPage, 'Foco');
  await appPage.evaluate(async () => {
    const api = window.krono!.timer!,
      state = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      sessionId: state.sessionId,
      action: 'start',
      phase: 'focus',
      preset: { focusMs: 120_000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    });
  });
  await electronApp.evaluate(async () => {
    const clock = globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> };
    await clock.advanceTimer(60_000);
    await clock.advanceTimer(60_000);
  });
  await expect(appPage.locator('.clean-context')).toContainText('2 min / 1 min');
  await navigate(appPage);
  const daily = appPage.getByRole('article', { name: 'Meta diária', exact: true });
  await expect(daily).toContainText('200%');
  expect(
    await appPage.evaluate(async () => (await window.krono!.production!.goals()).daily.ringPercent),
  ).toBe(100);
  await expect(appPage.locator('.production-metrics')).toContainText('2 min');
  await expect(appPage.locator('.production-history li')).toHaveCount(1);
  await appPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await appPage
    .locator('.clean-header')
    .screenshot({ path: 'artifacts/visual/production-header.png', animations: 'disabled' });
  await appPage.screenshot({ path: 'artifacts/visual/production-real.png', fullPage: true });
  await appPage.getByLabel('Data final de Produção', { exact: true }).fill('31/12/2025');
  await expect(
    appPage.getByRole('button', { name: 'Editar meta diária', exact: true }),
  ).toBeDisabled();
  await expect(daily).toContainText('Sem meta');
});

test('metas agendadas persistem e editar o agendamento não altera o passado', async ({
  appPage,
}) => {
  await navigate(appPage);
  await appPage.getByRole('button', { name: 'Editar meta semanal', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Editar meta semanal' });
  await form.getByRole('checkbox', { name: 'Sem meta', exact: true }).uncheck();
  await form.getByLabel('Alvo em minutos', { exact: true }).fill('90');
  await form.getByRole('button', { name: 'Salvar meta' }).click();
  const weekly = appPage.getByRole('article', { name: 'Meta semanal', exact: true });
  await expect(weekly).toContainText('A partir de 05/01/2026: 1 h 30 min');
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await navigate(appPage);
  await expect(weekly).toContainText('Sem meta');
  await appPage.getByRole('button', { name: 'Editar meta semanal', exact: true }).click();
  await expect(form.getByLabel('Alvo em minutos', { exact: true })).toHaveValue('90');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  const invalid = await appPage.evaluate(async () => {
    try {
      const state = await window.krono!.production!.goals();
      await window.krono!.production!.command({
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        expectedDate: state.today,
        habitId: null,
        cadence: 'daily',
        targetMinutes: 0,
        applyCurrent: true,
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(invalid).toBe(true);
  await appPage.getByLabel('Data final de Produção', { exact: true }).fill('02/01/2026');
  await appPage.getByLabel('Data final de Produção', { exact: true }).blur();
  await expect(appPage.locator('.production-route').getByRole('alert')).toContainText(
    'Escolha uma data até hoje.',
  );
  await expect(appPage.getByLabel('Data final de Produção', { exact: true })).toBeEnabled();
  await appPage.getByLabel('Data final de Produção', { exact: true }).fill('01/01/2026');
  await expect(weekly).toContainText('A partir de 05/01/2026');
  await expect(appPage.locator('.production-route').getByRole('alert')).toHaveCount(0);
});

test('filtro de hábito conserva o mesmo fato sem duplicar o total global', async ({
  appPage,
  electronApp,
}) => {
  const habitId = await appPage.evaluate(async () => {
    const api = window.krono!.habits!,
      id = crypto.randomUUID(),
      state = await api.read();
    const created = await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      action: 'create',
      habitId: id,
      input: {
        name: 'Hábito para recorte',
        kind: 'time',
        frequency: { kind: 'daily' },
        targetMinutes: 1,
      },
    });
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: created.snapshot!.revision,
      action: 'select',
      habitId: id,
    });
    return id;
  });
  await seed(electronApp, 1);
  await navigate(appPage);
  expect(
    await appPage.evaluate(
      async () =>
        (await window.krono!.production!.read({ days: 30, habitId: null })).metrics.eligibleMs,
    ),
  ).toBe(1000);
  await choose(appPage.getByRole('combobox', { name: 'Hábito em Produção' }), habitId);
  await expect
    .poll(() =>
      appPage.evaluate(
        async (id) =>
          (await window.krono!.production!.read({ days: 30, habitId: id })).metrics.eligibleMs,
        habitId,
      ),
    )
    .toBe(1000);
  await expect(appPage.locator('.production-history')).toContainText('Hábito para recorte');
  await choose(appPage.getByRole('combobox', { name: 'Hábito em Produção' }), '');
  await expect(appPage.locator('.production-metrics')).toContainText('1 s');
});

test('histórico paginado mantém 20 linhas, teclado e página estável durante nova conclusão', async ({
  appPage,
  electronApp,
}) => {
  await seed(electronApp, 25);
  await navigate(appPage);
  const history = appPage.getByRole('region', { name: 'Histórico de sessões' });
  await expect(history.locator('li')).toHaveCount(20);
  await history.getByRole('button', { name: 'Próxima página' }).focus();
  await appPage.keyboard.press('Enter');
  await expect(history.locator('li')).toHaveCount(5);
  await expect(history).toContainText('Página 2');
  await expect(history.getByRole('heading', { name: 'Histórico de sessões' })).toBeFocused();
  await seed(electronApp, 1);
  await expect(appPage.getByText('Há mudanças para consultar.', { exact: false })).toBeVisible();
  await expect(history).toContainText('Página 2');
  await expect(history.locator('li')).toHaveCount(5);
  await history.getByRole('button', { name: 'Página anterior' }).click();
  await expect(history.locator('li')).toHaveCount(20);
  await expect(history).toContainText('Página 1');
  await appPage.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(appPage.locator('.production-metrics')).toContainText('26');
  await choose(appPage.getByRole('combobox', { name: 'Período de Produção' }), '7');
  await choose(appPage.getByRole('combobox', { name: 'Período de Produção' }), '90');
  await expect(appPage.getByRole('combobox', { name: 'Período de Produção' })).toHaveText(
    '90 dias',
  );
  await expect(appPage.locator('.production-heatmap button')).toHaveCount(90);
});

test('confirmação perdida da meta permite retry único; falha de consulta não vira estado vazio', async ({
  appPage,
  electronApp,
}) => {
  await navigate(appPage);
  await appPage.getByRole('button', { name: 'Editar meta diária', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Editar meta diária' });
  await form.getByRole('checkbox', { name: 'Sem meta', exact: true }).uncheck();
  await form.getByLabel('Alvo em minutos', { exact: true }).fill('30');
  await form.getByRole('checkbox', { name: 'Aplicar a partir de hoje', exact: false }).check();
  await electronApp.evaluate(() => {
    (globalThis as unknown as { loseGoalAckOnce: () => void }).loseGoalAckOnce();
  });
  await form.getByRole('button', { name: 'Salvar meta' }).click();
  await expect(form.getByRole('alert')).toContainText('Não foi possível confirmar');
  await form.getByRole('button', { name: 'Tentar confirmar novamente' }).click();
  await expect(form).toHaveCount(0);
  expect(
    await appPage.evaluate(async () => (await window.krono!.production!.goals()).revision),
  ).toBe(1);
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { stopStorage: () => Promise<number> }).stopStorage();
  });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await navigate(appPage);
  await expect(appPage.locator('.production-route').getByRole('alert')).toContainText(
    'Não foi possível consultar',
  );
  await expect(
    appPage.getByText('Nenhuma sessão de foco neste período.', { exact: true }),
  ).toHaveCount(0);
});

test('Produção e formulário mantêm cabeçalho, redução e escalas de conteúdo sem overflow', async ({
  appPage,
  electronApp,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await navigate(appPage);
  await appPage.getByRole('button', { name: 'Editar meta diária', exact: true }).click();
  for (const factor of [1, 1.25, 1.5, 2]) {
    await electronApp.evaluate(({ BrowserWindow }, zoom) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setContentSize(1280, 900);
      window.webContents.setZoomFactor(zoom);
    }, factor);
    await expect
      .poll(() => appPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
    await expect(
      appPage.getByRole('form').getByRole('button', { name: 'Salvar meta' }),
    ).toBeVisible();
    if (factor === 1) {
      await appPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await appPage.screenshot({
        path: 'artifacts/visual/production-goal-form.png',
        fullPage: true,
      });
    }
  }
});
