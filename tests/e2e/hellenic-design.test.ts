import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';

test('direção mineral cobre telas, ajustes e mini sem perder comandos ou legibilidade', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect(appPage.locator('.brand-name')).toHaveText('Krono');
  await expect(appPage.locator('.brand-symbol')).toHaveAttribute('src', /cronus-256/);
  await expect(appPage.locator('.engraved-object')).toHaveCount(4);
  await expect(appPage.locator('.ambient-background')).toHaveCount(0);
  expect(
    await appPage
      .locator('.clean-primary > span')
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgb(227, 230, 226)');
  expect((await contrast(appPage, ['.clean-primary > span']))[0]!.ratio).toBeGreaterThanOrEqual(
    4.5,
  );
  await appPage.getByRole('switch', { name: 'Somente este foco', exact: true }).click();
  await expect(
    appPage.getByRole('switch', { name: 'Somente este foco', exact: true }),
  ).toBeChecked();
  expect(
    await appPage
      .locator('.single-focus-option i')
      .evaluate((e) => getComputedStyle(e, '::after').backgroundColor),
  ).toBe('rgb(25, 27, 24)');
  for (const destination of ['Foco', 'Perfil', 'Hábitos', 'Produção']) {
    await appPage
      .getByRole('navigation')
      .getByRole('button', { name: destination, exact: true })
      .click();
    await expect(appPage.getByRole('heading', { name: destination, exact: true })).toBeVisible();
    expect(
      (
        await contrast(appPage, [
          `#${({ Foco: 'focus', Perfil: 'profile', Hábitos: 'habits', Produção: 'production' } as Record<string, string>)[destination]}-title`,
        ])
      )[0]!.ratio,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await appPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await appPage.screenshot({ path: `artifacts/visual/hellenic-${destination}.png` });
  }
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  for (const tab of ['Aparência', 'Sistema', 'Dados', 'Atalhos', 'Sobre']) {
    await appPage.getByRole('button', { name: tab, exact: true }).click();
    expect(
      await appPage.locator('.settings-dialog').evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
    await appPage.screenshot({ path: `artifacts/visual/hellenic-settings-${tab}.png` });
  }
  await appPage.keyboard.press('Escape');
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  expect((await contrast(appPage, ['.pause-preview dt']))[0]!.ratio).toBeGreaterThanOrEqual(4.5);
  await appPage.screenshot({ path: 'artifacts/visual/hellenic-pomodoro.png' });
  await appPage.keyboard.press('Escape');
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await expect(appPage.locator('.mini-timer')).toBeVisible();
  await expect(appPage.locator('.mini-brand img')).toHaveAttribute('src', /cronus-256/);
  expect((await contrast(appPage, ['.mini-primary']))[0]!.ratio).toBeGreaterThanOrEqual(4.5);
  await appPage.screenshot({ path: 'artifacts/visual/hellenic-mini.png' });
  await appPage.locator('.mini-primary').click();
  await expect(appPage.locator('.mini-primary')).toContainText('Pausar');
  await appPage.locator('.mini-primary').click();
  await expect(appPage.locator('.mini-primary')).toContainText('Retomar');
  await appPage.getByRole('button', { name: 'Voltar à janela completa', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
});

test('seleção integral acompanha teclado, recolhimento e resize com margem para a assinatura', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  for (const width of [1280, 800, 560]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 800),
      width,
    );
    if (width >= 640) {
      const toggle = appPage.getByRole('button', { name: 'Recolher navegação', exact: true });
      if (await toggle.isVisible()) await toggle.click();
    }
    for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
      await appPage.getByRole('navigation').getByRole('button', { name, exact: true }).click();
      await expect
        .poll(() =>
          appPage.locator('.clean-nav').evaluate((root) => {
            const b = root.querySelector('[aria-current]')!.getBoundingClientRect(),
              s = root.querySelector('.clean-selection')!.getBoundingClientRect();
            return Math.max(
              Math.abs(b.x - s.x),
              Math.abs(b.y - s.y),
              Math.abs(b.width - s.width),
              Math.abs(b.height - s.height),
            );
          }),
        )
        .toBeLessThan(1);
    }
    expect(
      await appPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    if (width >= 640) {
      await appPage.getByRole('button', { name: 'Expandir navegação', exact: true }).click();
      await expect(appPage.locator('.brand-name')).toBeVisible();
    }
  }
  await appPage.emulateMedia({ forcedColors: 'active' });
  expect(
    await appPage
      .locator('.clean-nav button[aria-current]')
      .evaluate(
        (e) =>
          getComputedStyle(e).color !==
          getComputedStyle(e.closest('nav')!.querySelector('.clean-selection')!).backgroundColor,
      ),
  ).toBe(true);
});
