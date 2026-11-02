import { test, expect } from '../fixtures/app';
import { choose } from '../fixtures/choice';
import { mkdir } from 'node:fs/promises';
const go = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
async function seed(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const api = window.krono!.habits!,
      ids = [
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003',
      ];
    for (let i = 0; i < ids.length; i++) {
      const state = await api.read();
      await api.command({
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        action: 'create',
        habitId: ids[i]!,
        input: {
          name: ['Leitura', 'Treino', 'Escrita'][i]!,
          kind: 'action',
          frequency: { kind: 'daily' },
          targetMinutes: 25,
        },
      });
    }
    const state = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      action: 'check',
      habitId: ids[1]!,
      expectedDate: state.today,
    });
    const desktop = window.krono!.desktop!,
      prefs = await desktop.read();
    await desktop.update({
      expectedRevision: prefs.preferences.revision,
      patch: { profile: { name: 'Ana', avatar: 'coruja', onboarded: true } },
    });
    return ids;
  });
}
test('ordem manual por teclado persiste e filtros preservam posições ocultas', async ({
  appPage,
  electronApp,
}) => {
  const ids = await seed(appPage);
  await appPage.reload();
  await go(appPage, 'Hábitos');
  const names = () => appPage.locator('.habit-record h2').allTextContents();
  expect(await names()).toEqual(['Leitura', 'Treino', 'Escrita']);
  await appPage.getByRole('button', { name: 'Organizar', exact: true }).click();
  const first = appPage.getByRole('article', { name: 'Leitura', exact: true });
  await first.getByRole('button', { name: 'Mover Leitura para baixo', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  await expect(first).toBeFocused();
  expect(await names()).toEqual(['Treino', 'Leitura', 'Escrita']);
  await choose(appPage.getByRole('combobox', { name: 'Exibir hábitos', exact: true }), 'pending');
  await first.getByRole('button', { name: 'Mover Leitura para baixo', exact: true }).click();
  await expect(appPage.locator('.habit-order-status')).toHaveText('Ordem dos hábitos salva.');
  await expect(first).toBeFocused();
  expect(await names()).toEqual(['Escrita', 'Leitura']);
  await choose(appPage.getByRole('combobox', { name: 'Exibir hábitos', exact: true }), 'all');
  expect(await names()).toEqual(['Treino', 'Escrita', 'Leitura']);
  expect((await appPage.evaluate(() => window.krono!.timer!.read())).sessionId).toBeNull();
  expect(
    (await appPage.evaluate(() => window.krono!.desktop!.read())).preferences.habitOrder,
  ).toEqual([ids[1], ids[2], ids[0]]);
  await mkdir('artifacts/visual/habit-review', { recursive: true });
  await expect
    .poll(() =>
      appPage
        .locator('.habit-record')
        .evaluateAll((items) =>
          items.every((item) => Number(getComputedStyle(item).opacity) === 1),
        ),
    )
    .toBe(true);
  await appPage.screenshot({ path: 'artifacts/visual/habit-review/order.png' });
  await appPage.reload();
  await go(appPage, 'Hábitos');
  expect(await names()).toEqual(['Treino', 'Escrita', 'Leitura']);
  await choose(appPage.getByRole('combobox', { name: 'Exibir hábitos', exact: true }), 'completed');
  expect(await names()).toEqual(['Treino']);
  await choose(appPage.getByRole('combobox', { name: 'Exibir hábitos', exact: true }), 'all');
  await appPage.getByRole('button', { name: 'Organizar', exact: true }).click();
  await electronApp.evaluate(() => {
    (
      globalThis as unknown as { setPreferenceWriteFailure: (value: boolean) => void }
    ).setPreferenceWriteFailure(true);
  });
  await appPage.getByRole('button', { name: 'Mover Treino para baixo', exact: true }).click();
  await expect(appPage.locator('.habit-order-status')).toContainText('Não foi possível salvar');
  expect(await names()).toEqual(['Treino', 'Escrita', 'Leitura']);
  expect(
    (await appPage.evaluate(() => window.krono!.desktop!.read())).preferences.habitOrder,
  ).toEqual([ids[1], ids[2], ids[0]]);
  await electronApp.evaluate(() => {
    (
      globalThis as unknown as { setPreferenceWriteFailure: (value: boolean) => void }
    ).setPreferenceWriteFailure(false);
  });
  await appPage.getByRole('button', { name: 'Mover Treino para baixo', exact: true }).click();
  await expect(appPage.locator('.habit-order-status')).toHaveText('Ordem dos hábitos salva.');
  expect(await names()).toEqual(['Escrita', 'Treino', 'Leitura']);
});
test('revisão histórica mantém arquivados, crédito, sessões, limites e retorno do foco', async ({
  appPage,
  electronApp,
}) => {
  const ids = await seed(appPage);
  await electronApp.evaluate(async () => {
    const fixture = globalThis as unknown as {
      seedProductionSessions: (n: number) => Promise<void>;
      advanceTimer: (ms: number) => Promise<void>;
    };
    await fixture.seedProductionSessions(2);
    await fixture.advanceTimer(86_400_000);
  });
  await appPage.evaluate(async (id) => {
    const api = window.krono!.habits!,
      state = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      action: 'archive',
      habitId: id,
    });
  }, ids[1]!);
  await appPage.reload();
  await go(appPage, 'Perfil');
  const review = appPage.getByRole('region', { name: 'Revisão diária', exact: true });
  await expect(review.locator('.daily-review-metrics')).toContainText('0 s');
  await review.getByRole('textbox', { name: 'Dia da revisão', exact: true }).fill('01/01/2026');
  await expect(review.locator('.daily-review-metrics')).toContainText('2 s');
  await expect(review.locator('.daily-review-metrics')).toContainText('1 de 3');
  await review.locator('.daily-review-habits > summary').click();
  await expect(review.locator('li')).toHaveCount(3);
  await expect(review.locator('li').filter({ hasText: 'Treino' })).toContainText('Concluído');
  await expect(review.locator('li').filter({ hasText: 'Escrita' })).toContainText('Não concluído');
  const details = review.getByRole('button', { name: 'Ver sessões deste dia', exact: true });
  await details.click();
  await expect(appPage.getByRole('dialog').locator('.day-sessions li')).toHaveCount(2);
  await appPage.keyboard.press('Escape');
  await expect(details).toBeFocused();
  await expect(review.locator('.date-control input')).toHaveCSS('border-radius', '8px');
  await review.scrollIntoViewIfNeeded();
  await appPage.screenshot({ path: 'artifacts/visual/habit-review/review.png' });
  const input = review.getByRole('textbox', { name: 'Dia da revisão', exact: true });
  await input.fill('05/12/2025');
  await input.blur();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(review.locator('.daily-review-metrics')).toContainText('2 s');
  await input.fill('03/01/2026');
  await input.blur();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('02/01/2026');
  await expect(review.locator('.daily-review-metrics')).toContainText('0 s');
});
for (const deviceScale of [1, 2])
  test.describe(`revisão escala ${deviceScale}`, () => {
    test.use({ deviceScale });
    test('controles cabem na janela mínima e funcionam com redução e alto contraste', async ({
      appPage,
      electronApp,
    }) => {
      await seed(appPage);
      await appPage.reload();
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(800, 700);
      });
      await appPage.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
      await go(appPage, 'Perfil');
      const review = appPage.getByRole('region', { name: 'Revisão diária', exact: true });
      await review.scrollIntoViewIfNeeded();
      const box = (await review.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(801);
      await review
        .getByRole('button', { name: 'Abrir calendário: Dia da revisão', exact: true })
        .click();
      const calendar = appPage.getByRole('dialog', {
        name: 'Calendário: Dia da revisão',
        exact: true,
      });
      await expect(
        calendar.getByRole('gridcell', { name: '2 de janeiro de 2026', exact: true }),
      ).toBeDisabled();
      await appPage.keyboard.press('Escape');
      await review.getByRole('button', { name: 'Ver sessões deste dia', exact: true }).click();
      await expect(appPage.getByRole('dialog')).toContainText('Nenhuma sessão neste dia.');
      await appPage.keyboard.press('Escape');
    });
  });
