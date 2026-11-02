import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { appVersion } from '../../shared/version';

export const test = base.extend<{
  electronApp: ElectronApplication;
  appPage: Page;
  deviceScale: number;
  navigation: 'side' | 'top';
  welcome: boolean;
}>({
  deviceScale: [1, { option: true }],
  navigation: ['side', { option: true }],
  welcome: [false, { option: true }],
  electronApp: async ({ playwright, deviceScale, welcome }, use) => {
    void playwright;
    await build({
      entryPoints: ['tests/fixtures/electron-harness.ts'],
      outfile: '.test-data/harness/main.mjs',
      bundle: true,
      platform: 'node',
      format: 'esm',
      external: ['electron', 'better-sqlite3'],
    });
    await writeFile(
      '.test-data/harness/package.json',
      JSON.stringify({ name: 'krono-test', version: appVersion, main: 'main.mjs' }),
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
      ),
    );
    const app = await electron.launch({
      args: [`--force-device-scale-factor=${deviceScale}`, resolve('.test-data/harness')],
      env: { ...env, KRONO_TEST_WELCOME: welcome ? '1' : '0' },
    });
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
  appPage: async ({ electronApp, navigation }, use) => {
    const page = await electronApp.firstWindow();
    if (navigation === 'top') {
      await page.evaluate(() => {
        localStorage.setItem(
          'krono.appearance.v1',
          JSON.stringify({ reducedMotion: false, reducedEffects: false, navigation: 'top' }),
        );
      });
      await page.reload();
    }
    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('button', { name: 'Foco', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
    await use(page);
  },
});
export { expect } from '@playwright/test';
