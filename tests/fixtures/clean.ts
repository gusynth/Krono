import { test as base, _electron, type Page, type ElectronApplication } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { appVersion } from '../../shared/version';
export const test = base.extend<{
  studyApp: ElectronApplication;
  studyPage: Page;
  deviceScale: number;
  navigation: 'side' | 'top';
}>({
  deviceScale: [1, { option: true }],
  navigation: ['side', { option: true }],
  studyApp: async ({ playwright, deviceScale }, use) => {
    void playwright;
    await build({
      entryPoints: ['tests/fixtures/clean-harness.ts'],
      outfile: '.test-data/clean-harness/main.mjs',
      bundle: true,
      platform: 'node',
      format: 'esm',
      external: ['electron'],
    });
    await writeFile(
      '.test-data/clean-harness/package.json',
      JSON.stringify({ name: 'krono-study', version: appVersion, main: 'main.mjs' }),
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
      ),
    );
    const app = await _electron.launch({
      args: [`--force-device-scale-factor=${deviceScale}`, resolve('.test-data/clean-harness')],
      env,
    });
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
  studyPage: async ({ studyApp, navigation }, use) => {
    const page = await studyApp.firstWindow();
    if (navigation === 'top') {
      await page.evaluate(() => {
        localStorage.setItem(
          'krono.appearance.v1',
          JSON.stringify({ reducedMotion: false, reducedEffects: false, navigation: 'top' }),
        );
      });
      await page.reload();
    }
    await studyApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
    await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
    await use(page);
  },
});
export { expect } from '@playwright/test';

/** Simulação de evento web de visibilidade; não afirma testar minimização nativa. */
export async function visibility(page: Page, value: 'hidden' | 'visible') {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
export async function iconAnimationCount(page: Page) {
  return page.evaluate(
    () => document.getAnimations().filter((animation) => animation.id.startsWith('krono-')).length,
  );
}
