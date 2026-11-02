import { mergeTests } from '@playwright/test';
import { test as desktopTest, expect } from '../fixtures/app';
import { test as studyTest } from '../fixtures/clean';
const test = mergeTests(desktopTest, studyTest);

test('desktop e prévia usam o mesmo cabeçalho aprovado e mantêm isolamento', async ({
  electronApp,
  appPage,
  studyApp,
  studyPage,
}) => {
  for (const app of [electronApp, studyApp])
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 900),
    );
  for (const page of [appPage, studyPage]) {
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280);
    await expect(page.locator('.clean-header')).toHaveCount(1);
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.locator('.clean-notice')).toHaveCount(1);
    expect(
      await page.locator('.clean-header').evaluate((element) => getComputedStyle(element).display),
    ).toBe('flex');
    expect(
      await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined');
  }
  const geometry = async (page: typeof appPage) =>
    page.getByRole('navigation').evaluate((element) => ({
      center: element.getBoundingClientRect().x + element.getBoundingClientRect().width / 2,
      width: element.getBoundingClientRect().width,
      buttons: Array.from(element.querySelectorAll('button'), (button) => ({
        width: button.getBoundingClientRect().width,
        x: button.getBoundingClientRect().x,
      })),
    }));
  expect(await geometry(appPage)).toEqual(await geometry(studyPage));
  expect((await appPage.evaluate(() => window.krono!.foundation())).storage).toBe('ready');
  await expect(appPage.locator('.clean-footer')).toHaveCount(0);
  await expect(studyPage.locator('.clean-notice')).toContainText('demonstrativos');
  await appPage
    .locator('.clean-header')
    .screenshot({ path: 'artifacts/visual/unified-desktop-header.png', animations: 'disabled' });
  await studyPage
    .locator('.clean-header')
    .screenshot({ path: 'artifacts/visual/unified-preview-header.png', animations: 'disabled' });
  await appPage.screenshot({
    path: 'artifacts/visual/unified-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('desktop preserva sessão real e barra completa ao navegar', async ({ appPage }) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  const nav = appPage.getByRole('navigation');
  await nav.getByRole('button', { name: 'Hábitos', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('heading', { name: 'Seus hábitos', exact: true })).toBeVisible();
  await expect(appPage.getByRole('button', { name: 'Novo hábito', exact: true })).toBeEnabled();
  for (const name of ['Produção', 'Foco']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect
      .poll(() =>
        nav.evaluate((element) => {
          const line = element.querySelector('.clean-selection')!.getBoundingClientRect();
          const button = element.querySelector('[aria-current]')!.getBoundingClientRect();
          return Math.max(Math.abs(line.left - button.left), Math.abs(line.right - button.right));
        }),
      )
      .toBeLessThan(1);
  }
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await expect(appPage.getByRole('combobox', { name: 'Hábito para o próximo Foco' })).toBeVisible();
  await expect(appPage.locator('.clean-notice')).toContainText('Produção com registro local');
});
