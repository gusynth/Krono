import { test, expect } from '../fixtures/app';

test('limpeza de diálogos após destruição real da janela não acessa objeto destruído', async ({
  electronApp,
}) => {
  await (
    await electronApp.firstWindow()
  )
    .getByRole('navigation', { name: 'Navegação principal' })
    .waitFor();
  expect(
    await electronApp.evaluate(async () =>
      (
        globalThis as unknown as { verifyDestroyedDialogCleanup: () => Promise<unknown> }
      ).verifyDestroyedDialogCleanup(),
    ),
  ).toEqual({ error: null, choice: 'cancel', destroyed: true, listeners: [0, 0, 0] });
});

test('preferências do desktop persistem, validam volume e prévia usa porta isolada', async ({
  electronApp,
  appPage,
}) => {
  await appPage.getByRole('button', { name: 'Ajustes' }).click();
  await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Pausar ao bloquear a tela' }).focus();
  await appPage.keyboard.press('Space');
  await expect(appPage.getByRole('switch', { name: 'Pausar ao bloquear a tela' })).toBeChecked();
  await expect(appPage.getByRole('switch', { name: 'Pausar ao bloquear a tela' })).toBeFocused();
  await appPage.getByRole('switch', { name: 'Notificação ao concluir' }).uncheck();
  await appPage.getByRole('button', { name: 'Testar som' }).click();
  await expect(appPage.locator('.desktop-settings [role=status]')).toContainText(
    'Prévia concluída',
  );
  expect(
    await electronApp.evaluate(
      () => (globalThis as unknown as { desktopCalls: { sounds: number } }).desktopCalls.sounds,
    ),
  ).toBe(1);
  await appPage.screenshot({ path: 'artifacts/visual/desktop-settings.png', fullPage: true });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Ajustes' }).click();
  await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
  await expect(appPage.getByRole('switch', { name: 'Pausar ao bloquear a tela' })).toBeChecked();
  await expect(appPage.getByRole('switch', { name: 'Notificação ao concluir' })).not.toBeChecked();
  expect(
    await appPage.evaluate(async () => {
      try {
        await window.krono!.desktop!.update({ expectedRevision: 0, patch: { volume: NaN } });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});

test('X/bandeja, comandos e energia usam a mesma sessão; portas nativas simuladas', async ({
  electronApp,
  appPage,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  const sessionId = await appPage.evaluate(
    async () => (await window.krono!.timer!.read()).sessionId,
  );
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { desktopClose: () => Promise<void> }).desktopClose();
  });
  expect(
    await electronApp.evaluate(() => {
      const c = (globalThis as unknown as { desktopCalls: { hidden: number; informs: number } })
        .desktopCalls;
      return { hidden: c.hidden, informs: c.informs };
    }),
  ).toEqual({ hidden: 1, informs: 1 });
  await electronApp.evaluate(() =>
    (globalThis as unknown as { desktopMenu: (label: string) => void }).desktopMenu('Pausar'),
  );
  await expect(appPage.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Retomar', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { desktopLock: () => Promise<void> }).desktopLock();
  });
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'running',
  );
  await appPage.getByRole('button', { name: 'Ajustes' }).click();
  await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Pausar ao bloquear a tela' }).check();
  await appPage.keyboard.press('Escape');
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { desktopLock: () => Promise<void> }).desktopLock();
  });
  await expect(appPage.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Retomar', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { desktopSuspend: () => Promise<void> }).desktopSuspend();
    (globalThis as unknown as { desktopResume: () => void }).desktopResume();
  });
  await expect(appPage.getByRole('button', { name: 'Recuperar sessão' })).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).sessionId)).toBe(
    sessionId,
  );
});

test('conclusão salva gera um aviso único, preferência respeitada e dispensa sobrevive reload', async ({
  electronApp,
  appPage,
}) => {
  await appPage.evaluate(async () => {
    const snapshot = await window.krono!.timer!.read();
    await window.krono!.timer!.command({
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      sessionId: snapshot.sessionId,
      action: 'start',
      preset: { focusMs: 1000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    });
  });
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
      1000,
    );
    await (globalThis as unknown as { desktopFlush: () => Promise<void> }).desktopFlush();
  });
  await expect(appPage.locator('.desktop-feedback')).toContainText('Sessão salva');
  expect(
    await electronApp.evaluate(() => {
      const c = (
        globalThis as unknown as { desktopCalls: { notifications: number; sounds: number } }
      ).desktopCalls;
      return { notifications: c.notifications, sounds: c.sounds };
    }),
  ).toEqual({ notifications: 1, sounds: 1 });
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { desktopFlush: () => Promise<void> }).desktopFlush();
  });
  await appPage.screenshot({
    path: 'artifacts/visual/desktop-completion-notice.png',
    fullPage: true,
  });
  await appPage.locator('.session-notices summary').click();
  await appPage.getByRole('button', { name: 'Dispensar aviso' }).click();
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.locator('.desktop-feedback')).toHaveCount(0);
});

test('ativação de aviso restaura Foco sem iniciar outra sessão', async ({
  electronApp,
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('desktop:focus'),
  );
  await expect(appPage.getByRole('heading', { name: 'Foco', exact: true })).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'idle',
  );
});
