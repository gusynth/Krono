import { test, expect } from '../fixtures/app';

for (const scale of [1, 1.25, 1.5, 2])
  test.describe(`Assinatura Krono — escala emulada ${scale}`, () => {
    test.use({ deviceScale: scale });
    test('margens, recolhimento, janela estreita e alternativa superior', async ({
      appPage,
      electronApp,
    }) => {
      test.setTimeout(90000);
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.showInactive(),
      );
      const brand = appPage.getByRole('link', { name: 'Krono, Perfil', exact: true });
      const image = brand.locator('img:visible');
      await expect(image).toHaveAttribute('src', /cronus-256/);
      await expect(image).toHaveCSS('width', '38px');
      await expect(brand.locator('.brand-name')).toHaveText('Krono');
      expect(
        await image.evaluate((el) => {
          const img = el as HTMLImageElement;
          return [img.naturalWidth, img.naturalHeight];
        }),
      ).toEqual([256, 256]);
      const margin = () =>
        appPage.evaluate(() => {
          const header = document.querySelector('.clean-header')!.getBoundingClientRect();
          const logo = document.querySelector('.clean-brand')!.getBoundingClientRect();
          const symbol = document.querySelector('.brand-symbol')!.getBoundingClientRect();
          const button = document.querySelector('.navigation-toggle')!.getBoundingClientRect();
          return {
            left: logo.left - header.left,
            gap: button.left - logo.right,
            right: header.right - button.right,
            ratio: symbol.width / symbol.height,
          };
        });
      for (const width of [1280, 800]) {
        await electronApp.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900),
          width,
        );
        await expect.poll(async () => (await margin()).left).toBeGreaterThanOrEqual(16);
        const value = await margin();
        expect(value.gap).toBeGreaterThanOrEqual(8);
        expect(value.right).toBeGreaterThanOrEqual(16);
        expect(value.ratio).toBeCloseTo(1, 3);
      }
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 900),
      );
      // O tamanho nativo arredonda um pixel CSS em algumas escalas fracionárias.
      await expect
        .poll(() => appPage.evaluate(() => Math.abs(innerWidth - 1280)))
        .toBeLessThanOrEqual(1);
      if (scale === 1)
        await appPage.screenshot({
          path: 'artifacts/visual/kronos-wordmark-side.png',
          animations: 'disabled',
        });
      for (const name of ['Recolher navegação', 'Expandir navegação']) {
        await appPage.getByRole('button', { name, exact: true }).click();
        const frames = await appPage.evaluate(async () => {
          const values: { left: number; right: number; overlap: boolean }[] = [],
            start = performance.now();
          await new Promise<void>((resolve) => {
            const sample = () => {
              const header = document.querySelector('.clean-header')!.getBoundingClientRect();
              const logo = document.querySelector('.clean-brand')!.getBoundingClientRect();
              const button = document.querySelector('.navigation-toggle')!.getBoundingClientRect();
              values.push({
                left: logo.left - header.left,
                right: header.right - logo.right,
                overlap:
                  logo.left < button.right &&
                  logo.right > button.left &&
                  logo.top < button.bottom &&
                  logo.bottom > button.top,
              });
              if (performance.now() - start < 350) requestAnimationFrame(sample);
              else resolve();
            };
            requestAnimationFrame(sample);
          });
          return values;
        });
        for (const frame of frames) {
          expect(frame.left).toBeGreaterThanOrEqual(12);
          expect(frame.right).toBeGreaterThanOrEqual(12);
          expect(frame.overlap).toBe(false);
        }
        await expect(image).toHaveAttribute('src', /cronus-256/);
        if (scale === 1 && name === 'Recolher navegação')
          await appPage.screenshot({
            path: 'artifacts/visual/kronos-wordmark-collapsed.png',
            animations: 'disabled',
          });
      }
      await electronApp.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        window.setContentSize(800, 640);
        window.webContents.setZoomFactor(2);
      });
      await expect(image).toHaveAttribute('src', /cronus-256/);
      await expect
        .poll(() =>
          appPage.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(1);
      await electronApp.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        window.webContents.setZoomFactor(1);
        window.setContentSize(1280, 900);
      });
      await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
      await appPage.getByRole('combobox', { name: 'Posição da navegação', exact: true }).click();
      await appPage.getByRole('option', { name: 'Superior', exact: true }).click();
      await appPage.keyboard.press('Escape');
      await expect(image).toHaveCSS('width', '38px');
      expect(
        await appPage.getByRole('navigation').evaluate((el) => {
          const box = el.getBoundingClientRect();
          return Math.abs(box.x + box.width / 2 - document.documentElement.clientWidth / 2);
        }),
      ).toBeLessThan(1);
      if (scale === 1)
        await appPage.screenshot({
          path: 'artifacts/visual/kronos-wordmark-top.png',
          animations: 'disabled',
        });
      await appPage.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await expect(image).toBeVisible();
      await brand.focus();
      await expect(brand).toBeFocused();
      await appPage.keyboard.press('Enter');
      await expect(appPage.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible();
    });
  });
