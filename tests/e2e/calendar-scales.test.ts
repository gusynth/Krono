import { test, expect } from '../fixtures/app';

for (const scale of [1, 1.25, 1.5, 2])
  test.describe(`Escala de dispositivo emulada ${scale}`, () => {
    test.use({ deviceScale: scale });
    test('calendário e seleção ficam definidos e contidos na janela', async ({
      appPage,
      electronApp,
    }) => {
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].showInactive(),
      );
      await appPage.evaluate(() => document.fonts.ready);
      expect(await appPage.evaluate(() => devicePixelRatio)).toBeCloseTo(scale, 1);
      await appPage
        .getByRole('navigation')
        .getByRole('button', { name: 'Produção', exact: true })
        .click();
      await appPage
        .getByRole('button', { name: 'Abrir calendário: Data final de Produção' })
        .click();
      const popup = appPage.getByRole('dialog', { name: 'Calendário: Data final de Produção' });
      const rect = (await popup.boundingBox())!,
        width = await appPage.evaluate(() => innerWidth);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      await expect(
        popup.getByRole('gridcell', { name: '1 de janeiro de 2026', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await appPage.screenshot({ path: `artifacts/calendars/scale-${scale}.png`, fullPage: true });
      await appPage.keyboard.press('ArrowLeft');
      await appPage.keyboard.press('Enter');
      await expect(appPage.getByRole('textbox', { name: 'Data final de Produção' })).toHaveValue(
        '31/12/2025',
      );
    });
  });
