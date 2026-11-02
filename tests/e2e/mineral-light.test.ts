import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';

test('luz mineral anima só na navegação e termina sem replay ou loop', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  const running = () =>
    appPage.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.id === 'mineral-light-arrival' && a.playState === 'running').length,
    );
  const go = (name: string) =>
    appPage.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await appPage.evaluate(() => {
    const k = 'krono.appearance.v1';
    localStorage.setItem(
      k,
      JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), ambient: false }),
    );
  });
  await appPage.reload();
  await expect.poll(running).toBe(0);
  await go('Hábitos');
  await expect.poll(running).toBe(1);
  const light = appPage.locator('.mineral-light').first();
  expect(
    await light.evaluate((el) =>
      el.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === 1),
    ),
  ).toBe(true);
  await expect
    .poll(() => light.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.72);
  await expect.poll(running, { timeout: 2000 }).toBe(0);
  expect(await light.evaluate((el) => getComputedStyle(el).willChange)).toBe('auto');
  await go('Hábitos');
  expect(await running()).toBe(0);
  await go('Produção');
  await expect.poll(running).toBe(1);
  await go('Hábitos');
  expect(await running()).toBeLessThanOrEqual(1);
  await appPage.evaluate(() => {
    document.documentElement.dataset.windowVisible = 'false';
    window.dispatchEvent(new Event('krono-visibility'));
  });
  await expect.poll(running).toBe(0);
  await appPage.evaluate(() => {
    document.documentElement.dataset.windowVisible = 'true';
    window.dispatchEvent(new Event('krono-visibility'));
  });
  expect(await running()).toBe(0);
  await go('Produção');
  await expect.poll(running).toBe(1);
  await appPage.emulateMedia({ forcedColors: 'active' });
  await expect(light).toBeHidden();
  await expect.poll(running).toBe(0);
  await appPage.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
  await go('Foco');
  expect(await running()).toBe(0);
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
  for (const sample of await contrast(appPage, [
    '.time-state',
    '.clean-context small',
    '#focus-title',
  ]))
    expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
  await expect(appPage.locator('.corner-backdrop,.editorial-engraving,.time-arc')).toHaveCount(0);
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Reduzir transparência/efeitos', exact: true }).click();
  await expect(appPage.locator('.mineral-light')).toHaveCount(0);
  await appPage.keyboard.press('Escape');
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
});
