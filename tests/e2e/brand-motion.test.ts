import { test, expect } from '../fixtures/app';

test('assinatura tem quadros intermediários na saída/entrada e cancela ao inverter ou reduzir', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  const samples = async () =>
    appPage.locator('.brand-name').evaluate(async (el) => {
      const values: { opacity: number; shown: boolean }[] = [];
      const start = performance.now();
      await new Promise<void>((resolve) => {
        function sample() {
          values.push({
            opacity: Number(getComputedStyle(el).opacity),
            shown: getComputedStyle(el).display !== 'none',
          });
          if (performance.now() - start < 700) requestAnimationFrame(sample);
          else resolve();
        }
        requestAnimationFrame(sample);
      });
      return values;
    });
  await appPage.getByRole('button', { name: 'Recolher navegação', exact: true }).click();
  const exit = await samples();
  expect(exit.some((s) => s.shown && s.opacity > 0.1 && s.opacity < 0.9)).toBe(true);
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-collapsed', 'true');
  await appPage.getByRole('button', { name: 'Expandir navegação', exact: true }).click();
  const enter = await samples();
  expect(enter.some((s) => s.shown && s.opacity > 0.1 && s.opacity < 0.9)).toBe(true);
  expect(enter.at(-1)!.opacity).toBe(1);
  await appPage.locator('.navigation-toggle').click();
  await appPage.locator('.navigation-toggle').click();
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-collapsed', 'false');
  await expect
    .poll(() => appPage.locator('.brand-name').evaluate((e) => Number(getComputedStyle(e).opacity)))
    .toBe(1);
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage.locator('.navigation-toggle').click();
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-collapsed', 'true');
  expect(
    await appPage
      .locator('.brand-name')
      .evaluate((e) => e.getAnimations().filter((a) => a.playState === 'running').length),
  ).toBe(0);
});
