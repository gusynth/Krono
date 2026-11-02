import { contrast } from '../fixtures/contrast';
import { test, expect } from '../fixtures/app';
import { readFile } from 'node:fs/promises';
test('Ajustes separa categorias, mantém preferências e exporta pelo worker real', async ({
  appPage,
  electronApp,
}) => {
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('button', { name: 'Dados', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Salvar backup', exact: true })).toBeFocused();
  await expect(appPage.getByRole('group', { name: 'Tema do aplicativo' })).toBeHidden();
  const automatic = appPage.getByRole('switch', { name: 'Backup automático local', exact: true });
  await automatic.check();
  await expect
    .poll(
      async () =>
        (await appPage.evaluate(() => window.krono!.desktop!.read())).preferences.autoBackup,
    )
    .toBe(true);
  await electronApp.evaluate(async () => {
    await (
      globalThis as unknown as { runAutomaticBackup: () => Promise<void> }
    ).runAutomaticBackup();
  });
  const status = await appPage.evaluate(() => window.krono!.maintenance!.status());
  expect(status.lastBackupUtcMs).toBeGreaterThan(0);
  expect(status.error).toBeNull();
  await appPage
    .getByRole('button', { name: 'Exportar últimos 365 dias (CSV)', exact: true })
    .click();
  await expect(
    appPage.getByRole('status').filter({ hasText: 'Histórico exportado.' }),
  ).toBeVisible();
  const path = await electronApp.evaluate(() =>
    (globalThis as unknown as { maintenanceCSV: () => string }).maintenanceCSV(),
  );
  expect(await readFile(path, 'utf8')).toContain('Tempo ativo (s)');
  await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
  await appPage.getByRole('textbox', { name: 'Lembrete diário de hábitos' }).fill('18:30');
  await appPage.getByRole('textbox', { name: 'Lembrete diário de hábitos' }).press('Tab');
  await expect
    .poll(
      async () =>
        (await appPage.evaluate(() => window.krono!.desktop!.read())).preferences.habitReminder,
    )
    .toBe('18:30');
  await appPage.keyboard.press('Escape');
  await appPage.reload();
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('button', { name: 'Dados', exact: true }).click();
  await expect(automatic).toBeChecked();
});
test('presets são guardados, reaplicados e incluídos nas preferências; mini não maximiza', async ({
  appPage,
  electronApp,
}) => {
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  await appPage.getByText('Meus presets', { exact: true }).click();
  await appPage.getByRole('textbox', { name: 'Nome do preset', exact: true }).fill('Leitura');
  await appPage.getByRole('button', { name: 'Guardar preset', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Leitura', exact: true })).toBeVisible();
  await appPage
    .getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true })
    .fill('40');
  await appPage.getByRole('button', { name: 'Leitura', exact: true }).click();
  await expect(
    appPage.getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true }),
  ).toHaveValue('25');
  await appPage.keyboard.press('Escape');
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await expect(appPage.locator('.window-controls')).toHaveCount(1);
  await expect(appPage.getByRole('button', { name: 'Maximizar janela', exact: true })).toHaveCount(
    0,
  );
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.isMaximizable(),
    ),
  ).toBe(false);
  await appPage.getByRole('button', { name: 'Ampliar mini timer', exact: true }).click();
  expect(
    await electronApp.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[0],
    ),
  ).toBe(460);
  await appPage.getByRole('button', { name: 'Voltar à janela completa', exact: true }).click();
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.isMaximizable(),
    ),
  ).toBe(true);
});

test('mini com hábito longo conserva ações na altura mínima e confirma encerramento', async ({
  appPage,
  electronApp,
}) => {
  const name = 'Leitura e revisão de conteúdo com nome longo para conferir os limites do mini';
  await appPage.evaluate(async (name) => {
    const api = window.krono!.habits!,
      initial = await api.read(),
      id = crypto.randomUUID();
    const created = await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: initial.revision,
      action: 'create',
      habitId: id,
      input: { name, kind: 'time', frequency: { kind: 'daily' }, targetMinutes: 25 },
    });
    if (created.code !== 'ok') throw Error(created.code);
    const next = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: next.revision,
      action: 'select',
      habitId: id,
    });
  }, name);
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await expect(appPage.locator('.mini-habit')).toHaveText(name);
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(360, 250),
  );
  await expect
    .poll(() =>
      appPage
        .getByRole('button', { name: 'Encerrar sessão', exact: true })
        .evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight),
    )
    .toBe(true);
  expect(await appPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
    false,
  );
  await appPage.screenshot({ path: 'artifacts/visual/refined-mini.png' });
  await appPage.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  const dialog = appPage.getByRole('alertdialog', { name: 'Encerrar sessão', exact: true });
  await expect(dialog).toBeVisible();
  await appPage.keyboard.press('Escape');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'running',
  );
  await appPage.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
});

test('novas categorias mantêm controles legíveis nos quatro temas e foco acessível', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  for (const theme of ['Krono', 'Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
    await appPage.getByRole('button', { name: new RegExp(`^${theme} `) }).click();
    await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
    await expect(appPage.getByRole('button', { name: 'Sistema', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await appPage
      .getByRole('textbox', { name: 'Lembrete diário de hábitos' })
      .scrollIntoViewIfNeeded();
    for (const sample of await contrast(appPage, ['.reminder-time']))
      expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
    if (theme === 'Krono')
      await appPage.screenshot({
        path: 'artifacts/visual/refined-settings-system.png',
        animations: 'disabled',
      });
    await appPage.getByRole('button', { name: 'Dados', exact: true }).click();
    await appPage
      .getByRole('button', { name: 'Exportar últimos 365 dias (CSV)', exact: true })
      .scrollIntoViewIfNeeded();
    for (const sample of await contrast(appPage, ['.maintenance-settings .backup-actions button']))
      expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
  }
  await appPage.emulateMedia({ forcedColors: 'active' });
  const button = appPage.getByRole('button', {
    name: 'Exportar últimos 365 dias (CSV)',
    exact: true,
  });
  await appPage.keyboard.press('Tab');
  await button.focus();
  expect(await button.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
});
