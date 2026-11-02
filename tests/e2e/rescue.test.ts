import { test, expect, _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { appVersion } from '../../shared/version';

test('resgate: erro explícito, cancelar, arquivo inválido, teclado, cliques rápidos e novo processo', async () => {
  await mkdir('.test-data', { recursive: true });
  const profile = await mkdtemp(resolve('.test-data/rescue-e2e-'));
  await build({
    entryPoints: ['tests/fixtures/rescue-harness.ts'],
    outfile: '.test-data/rescue-harness/main.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['electron', 'better-sqlite3'],
  });
  await writeFile(
    '.test-data/rescue-harness/package.json',
    JSON.stringify({ name: 'krono-rescue-test', version: appVersion, main: 'main.mjs' }),
  );
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
      ),
    ),
    KRONO_TEST_PROFILE: profile,
  };
  const launch = (seed: boolean) =>
    electron.launch({
      args: [resolve('.test-data/rescue-harness')],
      env: { ...env, KRONO_TEST_SEED: seed ? '1' : '0' },
    });
  let app = await launch(true);
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('A base local está indisponível.', { exact: false })).toBeVisible();
    expect(
      await app.evaluate(async () =>
        (
          globalThis as unknown as { verifyOriginal: (archived: boolean) => Promise<boolean> }
        ).verifyOriginal(false),
      ),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Dados', exact: true }).click();
    const region = page.getByRole('region', { name: 'Backup e restauração', exact: true }),
      choose = region.getByRole('button', { name: 'Selecionar backup', exact: true });
    await choose.click();
    await expect(region.getByRole('checkbox')).toBeFocused();
    await expect(region).toContainText('Seus arquivos originais serão preservados');
    await region.getByRole('button', { name: 'Cancelar restauração' }).focus();
    await page.keyboard.press('Enter');
    await expect(choose).toBeFocused();
    await app.evaluate(async () =>
      (globalThis as unknown as { invalidBackup: () => Promise<void> }).invalidBackup(),
    );
    await choose.click();
    await expect(region).toContainText('Arquivo incompatível, inválido');
    expect(
      await app.evaluate(async () =>
        (
          globalThis as unknown as { verifyOriginal: (archived: boolean) => Promise<boolean> }
        ).verifyOriginal(false),
      ),
    ).toBe(true);
    await app.evaluate(() => (globalThis as unknown as { validBackup: () => void }).validBackup());
    await choose.focus();
    await page.keyboard.press('Enter');
    const action = region.getByRole('button', { name: 'Resgatar e reiniciar' });
    await expect(action).toBeDisabled();
    for (const zoom of [1, 1.25, 1.5, 2, 1]) {
      await app.evaluate(({ BrowserWindow }, factor) => {
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor);
      }, zoom);
      expect(
        await page.evaluate(() => {
          const panel = document.querySelector('.settings-popover .study-popover')!;
          return panel.scrollWidth - panel.clientWidth;
        }),
      ).toBeLessThanOrEqual(1);
    }
    await region.getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await expect(action).toBeEnabled();
    await page.evaluate(() => {
      const panel = document.querySelector('.settings-popover .study-popover')!;
      panel.scrollTo({ top: panel.scrollHeight, behavior: 'instant' });
    });
    await page.screenshot({ path: 'artifacts/visual/rescue-confirm.png' });
    await action.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(region).toContainText('Resgate concluído.');
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { rescueTest: { restarts: number } }).rescueTest.restarts,
      ),
    ).toBe(1);
    expect(
      await app.evaluate(async () =>
        (
          globalThis as unknown as { verifyOriginal: (archived: boolean) => Promise<boolean> }
        ).verifyOriginal(true),
      ),
    ).toBe(true);
    await app.close();
    app = await launch(false);
    page = await app.firstWindow();
    // Backup anterior ao perfil: a apresentação inicial agora exige conclusão, sem alterar o resgate.
    const introduction = page.getByRole('dialog', { name: 'Conheça o Krono', exact: true });
    await introduction.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
    for (let i = 0; i < 3; i++)
      await introduction.getByRole('button', { name: 'Continuar', exact: true }).click();
    await introduction.getByRole('button', { name: 'Agora não', exact: true }).click();
    await introduction.getByRole('radio', { name: /Prefiro sem jardim/ }).check();
    await introduction.getByRole('button', { name: 'Começar a usar', exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
    await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
    expect(await page.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe('idle');
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Hábitos', exact: true })
      .click();
    await expect(page.getByText('Hábito preservado', { exact: true })).toBeVisible();
    expect(
      await app.evaluate(async () =>
        (
          globalThis as unknown as { verifyOriginal: (archived: boolean) => Promise<boolean> }
        ).verifyOriginal(true),
      ),
    ).toBe(true);
    await page.screenshot({ path: 'artifacts/visual/rescue-reopened.png', fullPage: true });
  } finally {
    await app.close();
  }
});
