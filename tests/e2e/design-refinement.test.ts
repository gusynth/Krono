import { test, expect } from '../fixtures/app';
import { mkdir } from 'node:fs/promises';
import { contrast } from '../fixtures/contrast';
const go = (p: import('@playwright/test').Page, name: string) =>
  p.getByRole('navigation').getByRole('button', { name, exact: true }).click();
test('Perfil unifica o dia, lista compacta recolhe detalhes e ações continuam acessíveis', async ({
  appPage,
  electronApp,
}) => {
  await mkdir('artifacts/visual/design-refinement', { recursive: true });
  await appPage.evaluate(async () => {
    const api = window.krono!.desktop!,
      s = await api.read();
    await api.update({
      expectedRevision: s.preferences.revision,
      patch: { profile: { name: 'Ana', avatar: 'gato', onboarded: true } },
    });
    const h = window.krono!.habits!,
      state = await h.read();
    await h.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      action: 'create',
      habitId: crypto.randomUUID(),
      input: { name: 'Leitura', kind: 'action', frequency: { kind: 'daily' }, targetMinutes: 25 },
    });
  });
  await appPage.reload();
  await go(appPage, 'Perfil');
  await expect(appPage.locator('.profile-overview')).toHaveCount(0);
  await expect(appPage.locator('.daily-review-metrics dd')).toHaveCount(4);
  await appPage.screenshot({ path: 'artifacts/visual/design-refinement/profile.png' });
  await go(appPage, 'Hábitos');
  await appPage.getByRole('checkbox', { name: 'Lista compacta', exact: true }).check();
  const row = appPage.getByRole('article', { name: 'Leitura', exact: true });
  expect((await row.boundingBox())!.height).toBeLessThan(230);
  await expect(row.getByRole('button', { name: 'Concluir hoje', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Excluir', exact: true })).toBeHidden();
  await row.getByText('Ações', { exact: true }).click();
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(appPage.getByRole('dialog', { name: 'Editar hábito', exact: true })).toBeVisible();
  await appPage.keyboard.press('Escape');
  await expect(row.getByRole('button', { name: 'Editar', exact: true })).toBeFocused();
  await appPage.screenshot({ path: 'artifacts/visual/design-refinement/habits.png' });
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(800, 700),
  );
  await go(appPage, 'Perfil');
  expect(await appPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});
test('quatro intensidades do calendário preservam contraste nos temas', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(async () => {
    const fixture = globalThis as unknown as {
      seedGardenMinutes: (n: number) => Promise<void>;
      advanceTimer: (n: number) => Promise<void>;
    };
    for (const n of [5, 20, 35, 50]) {
      await fixture.seedGardenMinutes(n);
      await fixture.advanceTimer(86_400_000);
    }
  });
  await go(appPage, 'Produção');
  await expect(appPage.locator('.production-heatmap button[data-empty=false]')).toHaveCount(4);
  for (const theme of ['Krono', 'Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
    await appPage.getByRole('button', { name: new RegExp(`^${theme} `) }).click();
    await appPage.keyboard.press('Escape');
    await appPage.locator('.production-calendar-grid').scrollIntoViewIfNeeded();
    const colors = await appPage
      .locator('.production-heatmap button[data-empty=false]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(new Set(colors).size).toBe(4);
    for (const sample of await contrast(appPage, [
      '.production-heatmap button[data-empty=false] > span',
    ]))
      expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
  }
});
test('mapa tem dias proporcionais e presets não ficam embaixo de Salvar', async ({ appPage }) => {
  await go(appPage, 'Produção');
  const day = appPage.locator('.production-heatmap button').last();
  const box = (await day.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  await expect(day).toContainText('1');
  await day.focus();
  await day.press('Enter');
  await expect(appPage.getByRole('dialog')).toContainText('Sessões de');
  await appPage.keyboard.press('Escape');
  await go(appPage, 'Foco');
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  await appPage.locator('.saved-presets > summary').click();
  await appPage
    .getByRole('textbox', { name: 'Nome do preset', exact: true })
    .scrollIntoViewIfNeeded();
  const input = (await appPage
      .getByRole('textbox', { name: 'Nome do preset', exact: true })
      .boundingBox())!,
    save = (await appPage
      .getByRole('button', { name: 'Salvar configuração', exact: true })
      .boundingBox())!;
  expect(input.y + input.height).toBeLessThanOrEqual(save.y);
  await expect(
    appPage.getByRole('button', { name: 'Salvar configuração', exact: true }),
  ).toBeInViewport();
  await appPage.screenshot({ path: 'artifacts/visual/design-refinement/pomodoro.png' });
});
