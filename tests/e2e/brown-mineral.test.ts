import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';
import { mkdir, writeFile } from 'node:fs/promises';
test('marrom: ambiente, cancelamentos, contraste e salvar sempre visível', async ({
  appPage,
  electronApp,
}) => {
  await mkdir('artifacts/visual/brown', { recursive: true });
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.showInactive();
    w.setContentSize(1280, 900);
  });
  const ambient = () =>
    appPage.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.id === 'mineral-light-ambient' && a.playState === 'running').length,
    );
  await expect.poll(ambient).toBe(2);
  await appPage.waitForTimeout(600);
  const geometry = await appPage.locator('.clean-digits').boundingBox();
  const phases = [];
  for (const time of [0, 14000, 28000, 42000, 56000]) {
    phases.push(
      await appPage.locator('.mineral-light').evaluateAll(
        (els, t) =>
          els.map((el) => {
            const a = el.getAnimations()[0]!;
            a.pause();
            a.currentTime = t;
            return getComputedStyle(el).opacity;
          }),
        time,
      ),
    );
  }
  expect(new Set(phases.map((p) => p.join())).size).toBeGreaterThan(2);
  expect(await appPage.locator('.clean-digits').boundingBox()).toEqual(geometry);
  await appPage.screenshot({ path: 'artifacts/visual/brown/focus.png' });
  for (const sample of await contrast(appPage, [
    '.time-state',
    '.clean-context small',
    '#focus-title',
  ]))
    expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await expect.poll(ambient).toBe(2);
  await appPage.evaluate(() => {
    document.documentElement.dataset.windowVisible = 'false';
    window.dispatchEvent(new Event('krono-visibility'));
  });
  await expect.poll(ambient).toBe(0);
  await appPage.evaluate(() => {
    document.documentElement.dataset.windowVisible = 'true';
    window.dispatchEvent(new Event('krono-visibility'));
  });
  await expect.poll(ambient).toBe(2);
  await appPage.emulateMedia({ forcedColors: 'active' });
  await expect.poll(ambient).toBe(0);
  await expect(appPage.locator('.mineral-light').first()).toBeHidden();
  await appPage.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
  await expect.poll(ambient).toBe(0);
  await appPage.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(ambient).toBe(2);
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Fundo ambiente', exact: true }).setChecked(false);
  await expect.poll(ambient).toBe(0);
  await appPage.getByRole('button', { name: 'Sobre', exact: true }).click();
  await appPage.waitForTimeout(300);
  expect((await appPage.locator('.settings-dialog').boundingBox())!.height).toBeLessThan(600);
  await appPage.screenshot({ path: 'artifacts/visual/brown/settings.png' });
  await appPage.keyboard.press('Escape');
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  await appPage.getByText('Meus presets', { exact: true }).click();
  const save = appPage.getByRole('button', { name: 'Salvar configuração', exact: true });
  const sb = (await save.boundingBox())!,
    pb = (await appPage.locator('.preset-popover [popover]').boundingBox())!;
  expect(sb.y + sb.height).toBeLessThanOrEqual(pb.y + pb.height + 1);
  await appPage.screenshot({ path: 'artifacts/visual/brown/pomodoro.png' });
  await appPage.keyboard.press('Escape');
  for (const name of ['Perfil', 'Hábitos', 'Produção']) {
    await appPage.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await appPage.waitForTimeout(600);
    if (name === 'Produção')
      expect(
        await appPage
          .locator('.production-metrics dd[data-empty=true]')
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe('18px');
    await appPage.screenshot({ path: `artifacts/visual/brown/${name}.png` });
  }
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await expect.poll(ambient).toBe(0);
  await appPage.screenshot({ path: 'artifacts/visual/brown/mini.png' });
  await writeFile('artifacts/visual/brown/intensity.json', JSON.stringify(phases));
});

test('ambiente: compara custo ligado/desligado/estático e não acumula camadas', async ({
  appPage,
  electronApp,
}) => {
  const samples = [];
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.showInactive(),
  );
  for (const mode of ['animated', 'static', 'disabled']) {
    await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await appPage
      .getByRole('switch', { name: 'Fundo ambiente', exact: true })
      .setChecked(mode !== 'static');
    await appPage
      .getByRole('switch', { name: 'Reduzir transparência/efeitos', exact: true })
      .setChecked(mode === 'disabled');
    await appPage.keyboard.press('Escape');
    await appPage.waitForTimeout(1000);
    await electronApp.evaluate(({ app }) => app.getAppMetrics());
    await appPage.waitForTimeout(4000);
    samples.push({
      mode,
      metrics: await electronApp.evaluate(({ app }) =>
        app.getAppMetrics().map((m) => ({
          type: m.type,
          cpu: m.cpu.percentCPUUsage,
          memory: m.memory.workingSetSize,
        })),
      ),
      layers: await appPage.locator('.mineral-light').count(),
    });
  }
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage
    .getByRole('switch', { name: 'Reduzir transparência/efeitos', exact: true })
    .setChecked(false);
  await appPage.keyboard.press('Escape');
  for (let i = 0; i < 12; i++)
    await appPage
      .getByRole('navigation')
      .getByRole('button', { name: i % 2 ? 'Foco' : 'Hábitos', exact: true })
      .click();
  expect(await appPage.locator('.mineral-light').count()).toBe(2);
  expect(
    await appPage.evaluate(
      () => document.getAnimations().filter((a) => a.id === 'mineral-light-ambient').length,
    ),
  ).toBe(2);
  await writeFile('artifacts/visual/brown/cost.json', JSON.stringify(samples, null, 2));
});
