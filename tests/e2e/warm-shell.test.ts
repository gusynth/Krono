import { test, expect } from '../fixtures/app';

for (const scale of [1, 1.25, 1.5, 2])
  test.describe(`Lateral em escala emulada ${scale}`, () => {
    test.use({ deviceScale: scale });
    test('seleções, recolhimento, resize, teclado e redução mantêm conteúdo e indicador alinhados', async ({
      appPage,
      electronApp,
    }) => {
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.showInactive(),
      );
      const nav = appPage.getByRole('navigation');
      await expect(appPage.locator('.brand-name')).toHaveText('Krono');
      await expect(appPage.locator('.clean-brand img:visible')).toHaveAttribute(
        'src',
        /cronus-256/,
      );
      for (const width of [1280, 800]) {
        await electronApp.evaluate(
          ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]!.setContentSize(w, 900),
          width,
        );
        for (const collapsed of [false, true]) {
          const toggle = appPage.getByRole('button', {
            name: collapsed ? 'Recolher navegação' : 'Expandir navegação',
            exact: true,
          });
          if (await toggle.isVisible()) await toggle.click();
          await expect(appPage.locator('.clean-study')).toHaveAttribute(
            'data-collapsed',
            String(collapsed),
          );
          for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
            await nav.getByRole('button', { name, exact: true }).click();
            await expect
              .poll(() =>
                nav.evaluate((root) => {
                  const button = root.querySelector('[aria-current]')!.getBoundingClientRect(),
                    line = root.querySelector('.clean-selection')!.getBoundingClientRect();
                  return Math.max(
                    Math.abs(button.left - line.left),
                    Math.abs(button.right - line.right),
                    Math.abs(button.bottom - line.bottom),
                  );
                }),
              )
              .toBeLessThan(1);
          }
          await nav.getByRole('button', { name: 'Foco', exact: true }).focus();
          await appPage.keyboard.press('Enter');
          await expect(nav.getByRole('button', { name: 'Foco', exact: true })).toBeFocused();
          await expect
            .poll(() =>
              appPage.evaluate(() => {
                const content = document.querySelector('.shell-content')!.getBoundingClientRect(),
                  digits = document.querySelector('.clean-digits')!.getBoundingClientRect();
                return Math.abs(digits.x + digits.width / 2 - content.x - content.width / 2);
              }),
            )
            .toBeLessThan(1);
          expect(
            await appPage.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            ),
          ).toBeLessThanOrEqual(1);
        }
      }
      await nav.getByRole('button', { name: 'Hábitos', exact: true }).click();
      await nav.getByRole('button', { name: 'Produção', exact: true }).click();
      await nav.getByRole('button', { name: 'Perfil', exact: true }).click();
      await appPage.emulateMedia({ reducedMotion: 'reduce' });
      await nav.getByRole('button', { name: 'Foco', exact: true }).click();
      expect(
        await appPage.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.id === 'selection-slide' || a.id.startsWith('krono-')).length,
        ),
      ).toBe(0);
      await appPage.screenshot({
        path: `artifacts/visual/warm-side-${scale}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

test('preferência persiste e alternativa superior mantém a sessão sem reiniciar', async ({
  appPage,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect
    .poll(async () => (await appPage.evaluate(() => window.krono!.timer!.read())).state)
    .toBe('running');
  const before = await appPage.evaluate(() => window.krono!.timer!.read());
  await appPage.getByRole('button', { name: 'Recolher navegação', exact: true }).click();
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const position = appPage.getByRole('combobox', { name: 'Posição da navegação' });
  await position.click();
  await appPage.getByRole('option', { name: 'Superior', exact: true }).click();
  await appPage.keyboard.press('Escape');
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-navigation', 'top');
  const after = await appPage.evaluate(() => window.krono!.timer!.read());
  expect(after.sessionId).toBe(before.sessionId);
  expect(after.state).toBe('running');
  await appPage.screenshot({ path: 'artifacts/visual/warm-top.png', animations: 'disabled' });
  await appPage.reload();
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-navigation', 'top');
  expect((await appPage.evaluate(() => window.krono!.timer!.read())).sessionId).toBe(
    before.sessionId,
  );
});

test('janela mínima em zoom de 200% mantém destinos e Ajustes alcançáveis', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.showInactive();
    window.setContentSize(800, 640);
    window.webContents.setZoomFactor(2);
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  for (const button of await appPage.getByRole('navigation').getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(await appPage.evaluate(() => innerHeight));
  }
  const settings = appPage.getByRole('button', { name: 'Ajustes', exact: true }),
    box = (await settings.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(await appPage.evaluate(() => innerHeight));
  await settings.click();
  await appPage.getByRole('button', { name: 'Dados', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Salvar backup', exact: true })).toBeFocused();
  await appPage.keyboard.press('Escape');
  await expect(settings).toBeFocused();
});

test('troca de destino durante recolhimento conserva continuidade e um único indicador', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.show();
    w.focus();
  });
  await expect.poll(() => appPage.evaluate(() => document.visibilityState)).toBe('visible');
  await appPage.evaluate(() => document.fonts.ready);
  await appPage.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.navigation-toggle')!.click();
    document.querySelector<HTMLButtonElement>('.clean-nav button[aria-label="Produção"]')!.click();
  });
  // Medir no segundo frame, sem outra viagem IPC que pode chegar após os 260 ms.
  const moving = await appPage.evaluate(
    () =>
      new Promise<boolean>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(
              document
                .querySelector('.clean-selection')!
                .getAnimations()
                .some((a) => a.id === 'selection-slide' && a.playState === 'running'),
            ),
          ),
        ),
      ),
  );
  expect(moving).toBe(true);
  await expect(appPage.locator('.clean-selection')).toHaveCount(1);
  await expect
    .poll(() =>
      appPage.getByRole('navigation').evaluate((root) => {
        const button = root.querySelector('[aria-current]')!.getBoundingClientRect(),
          line = root.querySelector('.clean-selection')!.getBoundingClientRect();
        return Math.max(
          Math.abs(button.bottom - line.bottom),
          Math.abs(button.left - line.left),
          Math.abs(button.right - line.right),
        );
      }),
    )
    .toBeLessThan(1);
});

test('quatro destinos e Ajustes não têm overflow nos quatro temas com a lateral', async ({
  appPage,
  electronApp,
}) => {
  test.setTimeout(90000);
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1000, 800),
  );
  for (const name of ['Krono', 'Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await appPage.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await appPage.keyboard.press('Escape');
    for (const destination of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
      await appPage
        .getByRole('navigation')
        .getByRole('button', { name: destination, exact: true })
        .click();
      expect(
        await appPage.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('capturas reais do novo tema com registros sintéticos nas quatro telas', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.showInactive();
    BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 900);
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage.evaluate(async () => {
    const desktop = window.krono!.desktop!,
      snapshot = await desktop.read();
    await desktop.update({
      expectedRevision: snapshot.preferences.revision,
      patch: { profile: { name: 'Alex', avatar: 'brasa', onboarded: true } },
    });
    const habits = window.krono!.habits!,
      state = await habits.read();
    await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      action: 'create',
      habitId: crypto.randomUUID(),
      input: {
        name: 'Leitura',
        kind: 'action',
        targetMinutes: 25,
        frequency: { kind: 'daily' },
        icon: 'book',
      },
    });
  });
  await electronApp.evaluate(async () => {
    await (
      globalThis as unknown as { seedProductionSessions: (count: number) => Promise<void> }
    ).seedProductionSessions(3);
  });
  await appPage.evaluate(async () => {
    const timer = window.krono!.timer!,
      state = await timer.read();
    await timer.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      sessionId: state.sessionId,
      action: 'select-phase',
      phase: 'focus',
    });
    const desktop = window.krono!.desktop!,
      snapshot = await desktop.read();
    for (const alert of snapshot.alerts) await desktop.dismiss(alert.sessionId);
  });
  for (const [name, file] of [
    ['Perfil', 'profile'],
    ['Foco', 'focus'],
    ['Hábitos', 'habits'],
    ['Produção', 'production'],
  ] as const) {
    await appPage.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await expect(appPage.getByRole('heading', { name, exact: true })).toBeVisible();
    if (name === 'Produção')
      await expect(appPage.locator('.production-metrics')).toContainText('3');
    if (name === 'Perfil')
      await expect(appPage.locator('.daily-review-metrics')).toContainText('3 s');
    await appPage.screenshot({
      path: `artifacts/visual/warm-${file}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    if (name === 'Foco') {
      await appPage
        .locator('.focus-stage')
        .screenshot({ path: 'artifacts/visual/warm-welcome-focus.png', animations: 'disabled' });
      await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
      await appPage
        .getByRole('region', { name: 'Configuração do preset', exact: true })
        .screenshot({ path: 'artifacts/visual/warm-welcome-pomodoro.png', animations: 'disabled' });
      await appPage.keyboard.press('Escape');
    }
    if (name === 'Hábitos')
      await appPage
        .locator('.habit-record')
        .first()
        .screenshot({ path: 'artifacts/visual/warm-welcome-habits.png', animations: 'disabled' });
    if (name === 'Produção')
      await appPage.locator('.production-metrics').screenshot({
        path: 'artifacts/visual/warm-welcome-production.png',
        animations: 'disabled',
      });
  }
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.screenshot({ path: 'artifacts/visual/warm-settings.png', animations: 'disabled' });
});
