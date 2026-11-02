import { test, expect } from '../fixtures/app';
import { mkdir } from 'node:fs/promises';
const go = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
test('dia detalhado pagina, mantém recorte e retorna foco; falha não vira vazio', async ({
  appPage,
  electronApp,
}) => {
  await mkdir('artifacts/visual/daily-workflow', { recursive: true });
  await electronApp.evaluate(async () => {
    await (
      globalThis as unknown as { seedProductionSessions: (n: number) => Promise<void> }
    ).seedProductionSessions(23);
  });
  await go(appPage, 'Produção');
  await expect(appPage.locator('.production-metrics')).toContainText('23');
  const day = appPage.locator('.production-heatmap button').last();
  await day.focus();
  await appPage.keyboard.press('Enter');
  const dialog = appPage.getByRole('dialog', { name: 'Sessões de 01/01/2026', exact: true });
  await expect(dialog.locator('.day-sessions li')).toHaveCount(20);
  await expect(dialog.locator('.day-totals')).toContainText('23 s');
  await electronApp.evaluate(async () => {
    await (
      globalThis as unknown as { seedProductionSessions: (n: number) => Promise<void> }
    ).seedProductionSessions(2);
  });
  await dialog.getByRole('button', { name: 'Próxima página', exact: true }).click();
  await expect(dialog.locator('.day-sessions li')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Primeira página', exact: true }).click();
  await expect(dialog.locator('.day-sessions li')).toHaveCount(20);
  await appPage.screenshot({ path: 'artifacts/visual/daily-workflow/day.png' });
  await appPage.keyboard.press('Escape');
  await expect(day).toBeFocused();
  await electronApp.evaluate(() => {
    (globalThis as unknown as { failNextDay: () => void }).failNextDay();
  });
  await day.click();
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível');
  await dialog.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(dialog.locator('.day-sessions li')).toHaveCount(20);
  await appPage.keyboard.press('Escape');
  await day.press('ArrowLeft');
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('dialog')).toContainText('Nenhuma sessão neste dia.');
  await appPage.keyboard.press('Escape');
});
test('preparar hábito não inicia nem reatribui sessão; previsão acompanha pausa e mini', async ({
  appPage,
  electronApp,
}) => {
  const ids = await appPage.evaluate(async () => {
    const api = window.krono!.habits!,
      ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (let i = 0; i < 2; i++) {
      const state = await api.read();
      await api.command({
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        action: 'create',
        habitId: ids[i]!,
        input: {
          name: i ? 'Treino' : 'Leitura',
          kind: 'time',
          frequency: { kind: 'daily' },
          targetMinutes: 25,
          icon: 'book',
        },
      });
    }
    return ids;
  });
  await appPage.reload();
  await go(appPage, 'Hábitos');
  await appPage
    .getByRole('article', { name: 'Leitura', exact: true })
    .getByRole('button', { name: 'Preparar foco', exact: true })
    .click();
  expect((await appPage.evaluate(() => window.krono!.timer!.read())).sessionId).toBeNull();
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  const current = await appPage.evaluate(() => window.krono!.timer!.read());
  expect(current.habitId).toBe(ids[0]);
  await expect(appPage.locator('.finish-estimate').first()).toContainText('Termina');
  await appPage.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(appPage.locator('.finish-estimate').first()).toHaveText(
    'Previsão atualizada ao retomar',
  );
  await go(appPage, 'Hábitos');
  await appPage
    .getByRole('article', { name: 'Treino', exact: true })
    .getByRole('button', { name: 'Preparar foco', exact: true })
    .click();
  const preserved = await appPage.evaluate(() => window.krono!.timer!.read());
  expect(preserved.sessionId).toBe(current.sessionId);
  expect(preserved.habitId).toBe(ids[0]);
  expect(preserved.state).toBe('paused');
  await appPage.getByRole('button', { name: 'Retomar', exact: true }).click();
  await expect(appPage.locator('.finish-estimate').first()).toContainText('Termina');
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await appPage.getByRole('button', { name: 'Ampliar mini timer', exact: true }).click();
  await expect(appPage.locator('.mini-timer .finish-estimate')).toContainText('Termina');
  expect((await appPage.evaluate(() => window.krono!.timer!.read())).sessionId).toBe(
    current.sessionId,
  );
  await appPage.screenshot({ path: 'artifacts/visual/daily-workflow/mini.png' });
  await appPage.getByRole('button', { name: 'Voltar à janela completa', exact: true }).click();
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
      3000,
    );
  });
  expect((await appPage.evaluate(() => window.krono!.timer!.read())).state).toBe('running');
});

for (const deviceScale of [1, 1.25, 1.5, 2])
  test.describe(`detalhes escala ${deviceScale}`, () => {
    test.use({ deviceScale });
    test('dia pequeno preserva teclado, contraste e margens', async ({ appPage, electronApp }) => {
      await electronApp.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0]!;
        w.setContentSize(800, 700);
        w.showInactive();
      });
      await go(appPage, 'Produção');
      const day = appPage.locator('.production-heatmap button').last();
      await day.focus();
      await day.press('Enter');
      const dialog = appPage.getByRole('dialog', { name: 'Sessões de 01/01/2026', exact: true });
      await expect(dialog).toContainText('Nenhuma sessão neste dia.');
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(801);
      expect(box.y + box.height).toBeLessThanOrEqual(701);
      await appPage.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await expect(
        dialog.getByRole('button', { name: 'Fechar detalhes do dia', exact: true }),
      ).toBeVisible();
      await appPage.keyboard.press('Escape');
      await expect(day).toBeFocused();
    });
  });
