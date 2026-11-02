import { test, expect, _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { appVersion } from '../../shared/version';

test('novo processo Electron lê somente os dados restaurados e não repete alertas antigos', async () => {
  await mkdir('.test-data', { recursive: true });
  const profile = await mkdtemp(resolve('.test-data/backup-reopen-'));
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
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
      ),
    ),
    KRONO_TEST_PROFILE: profile,
  };
  const launch = () => electron.launch({ args: [resolve('.test-data/harness')], env });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
    await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
    await app.evaluate(async () => {
      await (
        globalThis as unknown as { seedProductionSessions: (count: number) => Promise<void> }
      ).seedProductionSessions(1);
    });
    await page.evaluate(async () => {
      const api = window.krono!.timer!,
        state = await api.read();
      const result = await api.command({
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        sessionId: state.sessionId,
        action: 'configure',
        configuration: {
          focusMinutes: 30,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          longEvery: 4,
          proportional: true,
        },
      });
      if (result.code !== 'ok') throw new Error('CONFIGURATION_NOT_SAVED');
    });
    await page.evaluate(async () => {
      const api = window.krono!.desktop!,
        value = await api.read();
      await api.update({
        expectedRevision: value.preferences.revision,
        patch: { profile: { name: 'Ana', avatar: 'mare', onboarded: true } },
      });
    });
    expect(await page.evaluate(async () => (await window.krono!.backup!.export()).code)).toBe(
      'saved',
    );
    await page.evaluate(async () => {
      const api = window.krono!.desktop!,
        value = await api.read();
      await api.update({
        expectedRevision: value.preferences.revision,
        patch: { profile: { name: 'Bia', avatar: 'lumi', onboarded: true } },
      });
    });
    await app.evaluate(async () => {
      await (
        globalThis as unknown as { seedProductionSessions: (count: number) => Promise<void> }
      ).seedProductionSessions(1);
    });
    expect(
      await page.evaluate(
        async () =>
          (await window.krono!.production!.read({ days: 1, habitId: null })).metrics.sessions,
      ),
    ).toBe(2);
    const inspected = await page.evaluate(async () => window.krono!.backup!.inspect());
    expect(
      await page.evaluate(
        async (token) =>
          (await window.krono!.backup!.restore({ token, confirmReplacement: true })).code,
        inspected.token!,
      ),
    ).toBe('restored');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
    await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Produção', exact: true })
      .click();
    await expect(page.locator('.production-metrics')).toContainText('1 s');
    await expect(page.locator('.production-history li')).toHaveCount(1);
    expect(
      await page.evaluate(
        async () =>
          (await window.krono!.production!.read({ days: 1, habitId: null })).metrics.sessions,
      ),
    ).toBe(1);
    expect(await page.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
      'awaiting-next',
    );
    expect(
      await page.evaluate(
        async () => (await window.krono!.timer!.read()).configuration?.focusMinutes,
      ),
    ).toBe(30);
    expect(
      await page.evaluate(async () => (await window.krono!.desktop!.read()).preferences.profile),
    ).toEqual({ name: 'Ana', avatar: 'mare', onboarded: true });
    const delivered = await app.evaluate(() => {
      const value = (
        globalThis as unknown as { desktopCalls: { sounds: number; notifications: number } }
      ).desktopCalls;
      return { sounds: value.sounds, notifications: value.notifications };
    });
    expect(delivered).toEqual({ sounds: 0, notifications: 0 });
    await page.screenshot({ path: 'artifacts/visual/backup-reopened.png', fullPage: true });
  } finally {
    await app.close();
  }
});
