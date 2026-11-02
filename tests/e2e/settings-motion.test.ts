import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';

test('troca de categorias anima conteúdo e seleção, redireciona e conserva formulário', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 950);
    w.show();
    w.focus();
  });
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.evaluate(() => document.fonts.ready);
  await appPage.locator('.settings-dialog').evaluate(async (e) => {
    await Promise.all(e.getAnimations().map((a) => a.finished.catch(() => {})));
  });
  const capture = await appPage.evaluate(async () => {
    const dialog = document.querySelector('.settings-dialog')!,
      heading = dialog.querySelector('h2')!;
    const before = heading.getBoundingClientRect().top;
    (document.querySelector('[aria-controls="system-settings"]') as HTMLButtonElement).click();
    return new Promise<{ ids: string[]; before: number; during: number }>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          resolve({
            ids: dialog.getAnimations({ subtree: true }).map((a) => a.id),
            before,
            during: heading.getBoundingClientRect().top,
          }),
        ),
      ),
    );
  });
  expect(capture.ids).toContain('settings-content-enter');
  expect(capture.ids).toContain('settings-content-exit');
  expect(capture.ids).toContain('settings-selection');
  expect(Math.abs(capture.before - capture.during)).toBeLessThan(1);
  await appPage.getByRole('textbox', { name: 'Lembrete diário de hábitos' }).fill('99:99');
  await appPage.evaluate(async () => {
    for (const id of ['data-settings', 'about-settings', 'shortcut-settings', 'system-settings']) {
      (document.querySelector(`[aria-controls="${id}"]`) as HTMLButtonElement).click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }
  });
  await expect(appPage.getByRole('textbox', { name: 'Lembrete diário de hábitos' })).toHaveValue(
    '99:99',
  );
  await expect.poll(() => appPage.locator('[data-settings-page]:not([hidden])').count()).toBe(1);
  expect(await appPage.locator('#system-settings').evaluate((e) => (e as HTMLElement).inert)).toBe(
    false,
  );
  await appPage.getByRole('button', { name: 'Dados', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('button', { name: 'Salvar backup', exact: true })).toBeFocused();
  await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
  await appPage.keyboard.press('Escape');
  await expect(appPage.getByRole('button', { name: 'Ajustes', exact: true })).toBeFocused();
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Reduzir animações', exact: true }).check();
  await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
  expect(
    await appPage
      .locator('.settings-dialog')
      .evaluate(
        (e) =>
          e.getAnimations({ subtree: true }).filter((a) => a.id.startsWith('settings-')).length,
      ),
  ).toBe(0);
  await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Reduzir animações', exact: true }).uncheck();
  await appPage.evaluate(() => {
    (document.querySelector('[aria-controls="system-settings"]') as HTMLButtonElement).click();
    document.documentElement.dataset.windowVisible = 'false';
    window.dispatchEvent(new Event('krono-visibility'));
  });
  await expect
    .poll(() =>
      appPage
        .locator('.settings-dialog')
        .evaluate(
          (e) =>
            e.getAnimations({ subtree: true }).filter((a) => a.id.startsWith('settings-')).length,
        ),
    )
    .toBe(0);
  await appPage.evaluate(() => {
    document.documentElement.dataset.windowVisible = 'true';
    window.dispatchEvent(new Event('krono-visibility'));
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage.getByRole('button', { name: 'Dados', exact: true }).click();
  expect(
    await appPage
      .locator('.settings-dialog')
      .evaluate(
        (e) =>
          e.getAnimations({ subtree: true }).filter((a) => a.id.startsWith('settings-')).length,
      ),
  ).toBe(0);
  await expect(appPage.locator('[data-settings-page]:not([hidden])')).toHaveCount(1);
});

test('áudio permanece agrupado, legível nos quatro temas e utilizável em janela estreita e zoom', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 950);
    w.showInactive();
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  for (const theme of ['Krono', 'Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
    await appPage.getByRole('button', { name: new RegExp(`^${theme} `) }).click();
    await appPage.getByRole('button', { name: 'Sistema', exact: true }).click();
    const audio = appPage.getByRole('group', { name: 'Áudio do aplicativo' });
    await audio.scrollIntoViewIfNeeded();
    for (const sample of await contrast(appPage, [
      '.desktop-preview',
      '.desktop-volume-controls output',
    ]))
      expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
    const slider = await audio.getByRole('slider').boundingBox(),
      button = await audio.getByRole('button').boundingBox();
    expect(Math.abs(slider!.y + slider!.height / 2 - button!.y - button!.height / 2)).toBeLessThan(
      2,
    );
    if (theme === 'Krono')
      await appPage.screenshot({ path: 'artifacts/visual/settings-audio-motion.png' });
  }
  await appPage.getByRole('button', { name: 'Testar som', exact: true }).click();
  await expect(appPage.locator('.desktop-preview-status')).toContainText('Prévia concluída');
  await appPage.getByRole('switch', { name: 'Som ao concluir', exact: true }).uncheck();
  await expect(appPage.getByRole('button', { name: 'Testar som', exact: true })).toBeDisabled();
  for (const zoom of [1, 2]) {
    await electronApp.evaluate(({ BrowserWindow }, zoom) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.setContentSize(680, 720);
      w.webContents.setZoomFactor(zoom);
    }, zoom);
    await appPage.getByRole('button', { name: 'Testar som', exact: true }).scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        appPage.locator('.settings-dialog').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      )
      .toBe(true);
    const box = await appPage.locator('.desktop-volume-controls .desktop-preview').boundingBox();
    expect(box!.x).toBeGreaterThan(0);
  }
});
