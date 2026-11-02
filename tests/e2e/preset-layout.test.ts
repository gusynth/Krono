import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';

test('Meus presets fica compacto abaixo dos ajustes e acomoda seis nomes longos', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  const names = Array.from({ length: 6 }, (_, i) => `Leitura e revisão de textos ${i + 1}`);
  await appPage.evaluate(async (names) => {
    const api = window.krono!.desktop!,
      s = await api.read();
    await api.update({
      expectedRevision: s.preferences.revision,
      patch: {
        presets: names.map((name, i) => ({
          name,
          configuration: {
            focusMinutes: 30 + i,
            shortBreakMinutes: 5,
            longBreakMinutes: 15,
            longEvery: 4,
            proportional: true,
          },
        })),
      },
    });
  }, names);
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  const summary = appPage.locator('.saved-presets > summary');
  await expect(summary).toContainText('6/6');
  const before = await summary.boundingBox(),
    field = await appPage
      .getByRole('spinbutton', { name: 'Focos antes da pausa longa', exact: true })
      .boundingBox();
  const focus = await appPage
    .getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true })
    .boundingBox();
  expect(Math.abs(focus!.x - field!.x)).toBeLessThan(1);
  await expect(
    appPage.locator('.pomodoro-pauses').getByText('Como as pausas são calculadas', { exact: true }),
  ).toBeVisible();
  expect(await summary.evaluate((e) => !!e.closest('.pomodoro-body'))).toBe(true);
  expect(
    await appPage.locator('.settings-save').evaluate((e) => getComputedStyle(e).position),
  ).toBe('static');
  expect(before!.width).toBeLessThan(170);
  expect(before!.height).toBeLessThanOrEqual(34);
  expect(before!.y).toBeGreaterThan(field!.y + field!.height);
  await appPage.screenshot({ path: 'artifacts/visual/presets-compact-closed.png' });
  await summary.click();
  await expect(appPage.locator('.preset-choice')).toHaveCount(6);
  const panel = await appPage.locator('.preset-popover .study-popover').boundingBox();
  expect(panel!.height).toBeLessThanOrEqual(620);
  expect(panel!.y).toBeGreaterThanOrEqual(24);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(876);
  expect(
    await appPage.locator('.preset-list').evaluate((e) => e.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(156);
  await appPage.getByRole('button', { name: names[0], exact: true }).click();
  await expect(
    appPage.getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true }),
  ).toHaveValue('30');
  await appPage.getByRole('button', { name: `Excluir preset ${names[5]}`, exact: true }).click();
  await expect(appPage.locator('.preset-choice')).toHaveCount(5);
  await appPage.getByRole('textbox', { name: 'Nome do preset', exact: true }).fill('Estudos');
  await appPage.getByRole('button', { name: 'Guardar preset', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Estudos', exact: true })).toBeVisible();
  await appPage.screenshot({ path: 'artifacts/visual/presets-compact-open.png' });
  for (const theme of ['Krono', 'Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await appPage.keyboard.press('Escape');
    await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
    await appPage.getByRole('button', { name: new RegExp(`^${theme} `) }).click();
    await appPage.keyboard.press('Escape');
    await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
    // O corpo agora rola sem passar sob o rodapé: medir cada trecho no viewport real.
    for (const selector of [
      '.saved-presets > summary > span',
      '.preset-choice > span',
      '.preset-hint',
      '.pomodoro-section-heading h3',
      '.proportional-setting > span',
      '.pause-preview dt',
      '.pause-preview dd',
      '.pause-start-note',
    ]) {
      await appPage
        .locator(selector)
        .first()
        .evaluate((el) =>
          (el.closest('.preset-list,.pause-preview') ?? el).scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'instant',
          }),
        );
      for (const sample of await contrast(appPage, [selector]))
        expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
    }
  }
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(680, 720);
    w.webContents.setZoomFactor(2);
  });
  await appPage
    .getByRole('button', { name: 'Guardar preset', exact: true })
    .scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      appPage
        .locator('.preset-popover .study-popover')
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    )
    .toBe(true);
  await appPage
    .getByRole('button', { name: 'Salvar configuração', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    appPage.getByRole('button', { name: 'Salvar configuração', exact: true }),
  ).toBeInViewport();
});
