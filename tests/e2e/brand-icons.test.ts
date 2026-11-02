import { test, expect } from '../fixtures/app';

test('runtime decodifica ICOs e PNGs com transparência e mantém símbolo editorial e identidade Krono', async ({
  appPage,
  electronApp,
}) => {
  const result = await electronApp.evaluate(({ nativeImage, BrowserWindow, app }) => {
    const root = app.getAppPath().replace(/[\\/]\.test-data[\\/]harness$/, '');
    const checks = [];
    for (const kind of ['principal', 'tray-light', 'tray-dark']) {
      const ico = nativeImage.createFromPath(`${root}/dist-electron/assets/${kind}.ico`);
      if (ico.isEmpty()) throw new Error(`ICO_EMPTY:${kind}`);
      for (const size of [16, 20, 24, 32, 48, 64, 256]) {
        const image = nativeImage.createFromPath(
            `${root}/assets/desktop/brand/${kind}-${size}.png`,
          ),
          pixels = image.toBitmap();
        if (image.isEmpty() || image.getSize().width !== size || image.getSize().height !== size)
          throw new Error(`PNG_INVALID:${kind}:${size}`);
        if (kind.startsWith('tray')) {
          if (
            [3, size * 4 - 1, pixels.length - 1, pixels.length - size * 4 + 3].some(
              (index) => pixels[index] !== 0,
            )
          )
            throw new Error('OPAQUE_CORNER');
          const visible = [...pixels].filter(
            (_, index) => index % 4 === 3 && pixels[index] > 128,
          ).length;
          if (visible < size * size * 0.15 || visible > size * size * 0.6)
            throw new Error(`BAD_OCCUPANCY:${visible}`);
        }
        checks.push(`${kind}:${size}`);
      }
    }
    return { checks, title: BrowserWindow.getAllWindows()[0].getTitle() };
  });
  expect(result.checks).toHaveLength(21);
  expect(result.title).toBe('Krono');
  const logo = appPage
    .getByRole('link', { name: 'Krono, Perfil', exact: true })
    .locator('img:visible');
  await expect(logo).toHaveAttribute('src', /cronus-256/);
  await expect(logo).toHaveCSS('width', '38px');
  await expect(appPage.getByRole('navigation').getByRole('button')).toHaveCount(4);
});
