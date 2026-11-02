import { test, expect } from '../fixtures/clean';

// Alternativa superior preservada; a composição lateral tem matriz própria.
test.use({ navigation: 'top' });

for (const scale of [1, 1.25, 1.5, 2]) {
  test.describe(`marca fornecida, escala ${scale}`, () => {
    test.use({ deviceScale: scale });
    test('centralização independente da marca e ações; seleções, resize, teclado e redução', async ({
      studyApp,
      studyPage,
    }, testInfo) => {
      test.setTimeout(90000);
      const nav = studyPage.getByRole('navigation');
      const brand = studyPage.getByRole('link', { name: 'Krono, Perfil' });
      await expect(brand).toHaveText('');
      await expect(brand.locator('img:visible')).toBeVisible();
      const measurements = [];
      async function measure() {
        const value = await nav.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const button = element.querySelector('[aria-current]')!.getBoundingClientRect();
          const line = element.querySelector('.clean-selection')!.getBoundingClientRect();
          return {
            centerError: bounds.x + bounds.width / 2 - document.documentElement.clientWidth / 2,
            leftError: line.left - button.left,
            rightError: line.right - button.right,
            navX: bounds.x,
            navWidth: bounds.width,
          };
        });
        return value;
      }
      for (const width of [980, 1280, 1920]) {
        await studyApp.evaluate(
          ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 900),
          width,
        );
        await expect.poll(() => studyPage.evaluate(() => innerWidth)).toBe(width);
        for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
          await nav
            .getByRole('button', { name, exact: true })
            .evaluate((element) => (element as HTMLButtonElement).click());
          await expect
            .poll(async () => {
              const value = await measure();
              return Math.max(
                Math.abs(value.centerError),
                Math.abs(value.leftError),
                Math.abs(value.rightError),
              );
            })
            .toBeLessThan(1);
          measurements.push({ scale, width, name, ...(await measure()) });
        }
        const before = await measure();
        // Reconstrói apenas a palavra anterior para comparar a mesma geometria, sem mudar o produto.
        await brand.evaluate((element) => {
          const label = document.createElement('span');
          label.textContent = 'krono';
          element.append(label);
        });
        const withWord = await measure();
        expect(Math.abs(before.navX - withWord.navX)).toBeLessThan(1);
        expect(before.navWidth).toBe(withWord.navWidth);
        await brand.locator('span').evaluate((element) => element.remove());
        await studyPage.locator('.clean-header-actions').evaluate((element) => {
          (element as HTMLElement).style.width = '220px';
          (element as HTMLElement).style.justifySelf = 'end';
        });
        expect(Math.abs((await measure()).centerError)).toBeLessThan(1);
        await studyPage
          .locator('.clean-header-actions')
          .evaluate((element) => (element as HTMLElement).removeAttribute('style'));
        if (width === 1280) {
          await nav.getByRole('button', { name: 'Foco', exact: true }).click();
          await studyPage.locator('.clean-header').screenshot({
            path: `artifacts/visual/approved-header-symbol-${scale}.png`,
            animations: 'disabled',
          });
        }
      }
      await nav.getByRole('button', { name: 'Hábitos', exact: true }).focus();
      await studyPage.keyboard.press('Enter');
      await expect(nav.getByRole('button', { name: 'Hábitos', exact: true })).toBeFocused();
      await studyPage.getByRole('button', { name: 'Ajustes' }).click();
      await studyPage.getByRole('switch', { name: 'Reduzir animações' }).check();
      await studyPage.keyboard.press('Escape');
      await nav.getByRole('button', { name: 'Produção', exact: true }).click();
      expect(
        await nav.locator('.clean-selection').evaluate((element) => element.getAnimations().length),
      ).toBe(0);
      expect(
        await studyPage.evaluate(
          () =>
            document.getAnimations().filter((animation) => animation.id.startsWith('krono-'))
              .length,
        ),
      ).toBe(0);
      await expect
        .poll(async () => {
          const value = await measure();
          return Math.max(
            Math.abs(value.centerError),
            Math.abs(value.leftError),
            Math.abs(value.rightError),
          );
        })
        .toBeLessThan(1);
      await testInfo.attach('marca-e-centralização', {
        body: JSON.stringify(measurements),
        contentType: 'application/json',
      });
    });
  });
}
