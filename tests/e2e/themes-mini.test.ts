import { test, expect } from '../fixtures/app';
const open = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
};
const choose = async (page: import('@playwright/test').Page, name: string) => {
  await open(page);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await page.keyboard.press('Escape');
};

test('encerramento é modal: Escape cancela, Tab fica contido e foco retorna', async ({
  appPage,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  const trigger = appPage.getByRole('button', { name: 'Encerrar sessão', exact: true });
  await trigger.click();
  const dialog = appPage.getByRole('alertdialog', { name: 'Encerrar sessão' });
  await expect(dialog.getByRole('button', { name: 'Continuar sessão' })).toBeFocused();
  await appPage.keyboard.press('Shift+Tab');
  await appPage.keyboard.press('Tab');
  expect(await appPage.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(
    true,
  );
  await appPage.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'running',
  );
});

test('três temas extras persistem sem mudar sessão, geometria ou controles', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.showInactive();
  });
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  const session = await appPage.evaluate(async () => (await window.krono!.timer!.read()).sessionId);
  for (const [name, id] of [
    ['Terminal / ASCII', 'terminal'],
    ['Aero', 'aero'],
    ['Windows 95 escuro', 'classic'],
    ['Krono', 'original'],
  ]) {
    await choose(appPage, name!);
    await expect(appPage.locator('.clean-study')).toHaveAttribute('data-theme', id!);
    expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).sessionId)).toBe(
      session,
    );
    await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
    const overflow = await appPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await choose(appPage, 'Windows 95 escuro');
  await appPage.reload();
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-theme', 'classic');
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
});

test('mini usa uma janela e sessão, pausa/retoma, libera topo e restaura dimensões', async ({
  appPage,
  electronApp,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  const session = await appPage.evaluate(async () => (await window.krono!.timer!.read()).sessionId);
  const before = await electronApp.evaluate(({ BrowserWindow }) => ({
    count: BrowserWindow.getAllWindows().length,
    bounds: BrowserWindow.getAllWindows()[0]!.getBounds(),
  }));
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await expect(appPage.getByRole('region', { name: 'Mini temporizador' })).toBeVisible();
  await appPage.keyboard.press('Control+,');
  await expect(appPage.getByRole('dialog', { name: 'Ajustes', exact: true })).toHaveCount(0);
  expect(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(before.count);
  await appPage.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Retomar', exact: true }).click();
  await appPage.getByRole('button', { name: 'Manter mini timer no topo' }).click();
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.isAlwaysOnTop(),
    ),
  ).toBe(true);
  await appPage.getByRole('button', { name: 'Voltar à janela completa' }).click();
  await expect(appPage.getByRole('heading', { name: 'Foco', exact: true })).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).sessionId)).toBe(
    session,
  );
  const after = await electronApp.evaluate(({ BrowserWindow }) => ({
    count: BrowserWindow.getAllWindows().length,
    bounds: BrowserWindow.getAllWindows()[0]!.getBounds(),
    pinned: BrowserWindow.getAllWindows()[0]!.isAlwaysOnTop(),
  }));
  expect(after.count).toBe(before.count);
  expect(after.pinned).toBe(false);
  expect(after.bounds.width).toBe(before.bounds.width);
  expect(after.bounds.height).toBe(before.bounds.height);
  expect(
    await appPage.evaluate(async () => {
      try {
        await window.krono!.mini!.command('invalid' as 'read');
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});

test('atalhos são locais, configuráveis e não atravessam diálogos ou entradas', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.showInactive(),
  );
  await expect.poll(() => appPage.evaluate(() => document.visibilityState)).toBe('visible');
  await appPage.keyboard.press('Control+Space');
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await appPage.keyboard.press('Control+Space');
  await expect(appPage.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await appPage.keyboard.press('Control+,');
  await expect(appPage.getByRole('dialog', { name: 'Ajustes', exact: true })).toBeVisible();
  await appPage.keyboard.press('Control+Space');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'paused',
  );
  await appPage.getByRole('button', { name: 'Atalhos', exact: true }).click();
  await appPage.getByRole('combobox', { name: 'Atalho do temporizador' }).click();
  await appPage.getByRole('option', { name: 'Ctrl + Shift + Espaço', exact: true }).click();
  await appPage.keyboard.press('Escape');
  await appPage.keyboard.press('Control+Space');
  await expect(appPage.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await appPage.keyboard.press('Control+Shift+Space');
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await appPage.keyboard.press('Alt+3');
  await expect(appPage.getByRole('heading', { name: 'Hábitos', exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  await appPage.getByRole('textbox', { name: 'Nome', exact: true }).focus();
  await appPage.keyboard.press('Alt+2');
  await expect(appPage.getByRole('heading', { name: 'Hábitos', exact: true })).toBeVisible();
});

test('temas respeitam redução, alto contraste, erro e tamanho reduzido', async ({
  appPage,
  electronApp,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(800, 640),
  );
  for (const name of ['Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await choose(appPage, name);
    await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
    await appPage
      .getByRole('navigation')
      .getByRole('button', { name: 'Produção', exact: true })
      .click();
    await expect(appPage.getByRole('heading', { name: 'Produção', exact: true })).toBeVisible();
    expect(
      await appPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await appPage.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await expect(appPage.getByRole('navigation')).toBeVisible();
    await appPage.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    await appPage
      .getByRole('navigation')
      .getByRole('button', { name: 'Foco', exact: true })
      .click();
  }
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { stopStorage: () => Promise<unknown> }).stopStorage();
  });
  await expect(appPage.getByRole('button', { name: 'Tentar salvar novamente' })).toBeVisible();
});
