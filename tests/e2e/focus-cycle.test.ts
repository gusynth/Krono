import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';

test('encerrar ciclo conserva dois focos e recomeça em um após reabrir', async ({
  appPage,
  electronApp,
}) => {
  for (let n = 0; n < 2; n++) {
    await appPage.evaluate(async () => {
      const api = window.krono!.timer!,
        s = await api.read();
      await api.command({
        commandId: crypto.randomUUID(),
        expectedRevision: s.revision,
        sessionId: s.sessionId,
        action: 'start',
        phase: 'focus',
        preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
      });
    });
    await electronApp.evaluate(async () => {
      await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
        1000,
      );
    });
  }
  await expect(appPage.locator('.cycle-label')).toHaveText('Foco 2 de 4');
  await appPage.getByRole('button', { name: 'Encerrar ciclo', exact: true }).click();
  await expect(appPage.locator('.cycle-label')).toHaveText('Foco 1 de 4');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).cycle)).toBe(2);
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
  await expect(appPage.locator('.cycle-label')).toHaveText('Foco 1 de 4');
});

test('foco único termina no mini, não deixa pausa pendente e opção vale só uma vez', async ({
  appPage,
  electronApp,
}) => {
  await appPage.evaluate(async () => {
    const api = window.krono!.timer!,
      s = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: s.revision,
      sessionId: s.sessionId,
      action: 'configure',
      configuration: {
        focusMinutes: 1,
        shortBreakMinutes: 1,
        longBreakMinutes: 1,
        longEvery: 4,
        proportional: false,
      },
    });
  });
  await appPage.getByRole('switch', { name: 'Somente este foco' }).click();
  await expect(appPage.getByRole('switch', { name: 'Somente este foco' })).toBeChecked();
  await expect(appPage.locator('.cycle-label')).toHaveText('Foco único');
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  for (let n = 0; n < 4; n++)
    await electronApp.evaluate(async () => {
      await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
        15000,
      );
    });
  await expect(appPage.locator('.mini-status')).toHaveText('Foco concluído');
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
  await expect(appPage.getByRole('switch', { name: 'Somente este foco' })).not.toBeChecked();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).cycle)).toBe(1);
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).singleFocus)).toBe(
    false,
  );
  await appPage.getByRole('button', { name: 'Encerrar ciclo', exact: true }).click();
  const dialog = appPage.getByRole('alertdialog', { name: 'Encerrar ciclo', exact: true });
  await expect(dialog).toContainText('parcial');
  await appPage.keyboard.press('Escape');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'running',
  );
  await appPage.getByRole('button', { name: 'Encerrar ciclo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Encerrar ciclo', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
});

test('conjunto pendente de outra semana reinicia sem apagar o contador histórico', async ({
  appPage,
  electronApp,
}) => {
  await appPage.evaluate(async () => {
    const api = window.krono!.timer!,
      s = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: s.revision,
      sessionId: s.sessionId,
      action: 'start',
      preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    });
  });
  await electronApp.evaluate(async () => {
    const clock = globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> };
    await clock.advanceTimer(1000);
    await clock.advanceTimer(7 * 86400000);
  });
  await expect(appPage.locator('.clean-time')).toHaveAttribute('data-state', 'idle');
  await expect(appPage.locator('.cycle-label')).toHaveText('Foco 1 de 4');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).cycle)).toBe(1);
});

test('controles de ciclo mantêm contraste e cabem nos quatro temas e mini mínimo', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['Krono', 'Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
    await appPage.getByRole('button', { name: new RegExp(`^${theme} `) }).click();
    await appPage.keyboard.press('Escape');
    await appPage.getByRole('switch', { name: 'Somente este foco' }).scrollIntoViewIfNeeded();
    for (const sample of await contrast(appPage, ['.single-focus-option span']))
      expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
    if (theme === 'Krono')
      await appPage.screenshot({ path: 'artifacts/visual/daily-focus-cycle.png' });
  }
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(360, 250),
  );
  await expect
    .poll(() =>
      appPage
        .getByRole('button', { name: 'Encerrar ciclo', exact: true })
        .evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight),
    )
    .toBe(true);
  expect(await appPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
    false,
  );
  await appPage.getByRole('button', { name: 'Encerrar ciclo', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  await expect(
    appPage.getByRole('alertdialog', { name: 'Encerrar ciclo', exact: true }),
  ).toBeVisible();
  await appPage.keyboard.press('Escape');
  await expect(appPage.getByRole('button', { name: 'Encerrar ciclo', exact: true })).toBeFocused();
});

test('acesso ao mini timer fica na barra de Foco, longe dos controles de janela', async ({
  appPage,
  electronApp,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [
    [1280, 900],
    [680, 720],
  ]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0]!.setContentSize(size[0]!, size[1]!),
      size,
    );
    const launch = appPage.locator('.clean-mode-row > .mini-launch');
    await expect(launch).toHaveText('Mini timer');
    await expect
      .poll(() =>
        launch.evaluate(
          (e) =>
            e.getBoundingClientRect().top -
            (document.querySelector('.window-controls')?.getBoundingClientRect().bottom ?? 0),
        ),
      )
      .toBeGreaterThanOrEqual(24);
    expect(await appPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
  await appPage.screenshot({ path: 'artifacts/visual/focus-mini-launch-position.png' });
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await expect(appPage.getByRole('region', { name: 'Mini temporizador' })).toBeVisible();
});
