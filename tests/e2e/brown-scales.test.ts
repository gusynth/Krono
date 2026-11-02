import { test, expect } from '../fixtures/app';
for (const scale of [1, 1.25, 1.5, 2])
  test.describe(`marrom escala ${scale}`, () => {
    test.use({ deviceScale: scale });
    test('telas estreitas mantêm controles e diálogo dentro da janela', async ({
      appPage,
      electronApp,
    }) => {
      await electronApp.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0]!;
        w.setContentSize(800, 700);
        w.showInactive();
      });
      await appPage.emulateMedia({ reducedMotion: 'reduce' });
      for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
        await appPage.getByRole('navigation').getByRole('button', { name, exact: true }).click();
        expect(
          await appPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
      }
      await appPage
        .locator('.production-metrics dd')
        .first()
        .evaluate((el) => {
          el.textContent = '125 h 45 min';
        });
      for (const box of await appPage.locator('.production-metrics dd').evaluateAll((els) =>
        els.map((el) => ({
          width: el.clientWidth,
          scroll: el.scrollWidth,
          spacing: getComputedStyle(el).letterSpacing,
        })),
      )) {
        expect(box.scroll).toBeLessThanOrEqual(box.width + 1);
        expect(['normal', '0px']).toContain(box.spacing);
      }
      await appPage.getByRole('button', { name: 'Editar meta diária', exact: true }).click();
      const dialog = appPage.getByRole('dialog', { name: 'Editar meta diária', exact: true });
      await expect(dialog).toBeVisible();
      const r = (await dialog.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(801);
      await appPage.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(
        appPage.getByRole('button', { name: 'Editar meta diária', exact: true }),
      ).toBeFocused();
    });
  });
