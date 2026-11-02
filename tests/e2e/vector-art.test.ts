import { test, expect } from '../fixtures/app';

test('base sem ornamentos preserva navegação, números, formulários e redução de efeitos', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  const arc = appPage.locator('.clean-time .time-arc');
  await expect(arc).toHaveCount(0);
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
  for (const destination of ['Perfil', 'Hábitos', 'Produção']) {
    await appPage
      .getByRole('navigation')
      .getByRole('button', { name: destination, exact: true })
      .click();
    await expect(
      appPage.locator('.clean-heading img,.clean-heading .editorial-engraving'),
    ).toHaveCount(0);
    await expect(appPage.locator('.corner-backdrop')).toHaveCount(0);
    await appPage.screenshot({ path: `artifacts/visual/vector-${destination}.png` });
  }
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  for (const name of ['Aparência', 'Sistema', 'Dados', 'Atalhos', 'Sobre']) {
    await appPage.getByRole('button', { name, exact: true }).click();
    await expect(appPage.locator('.settings-engraving')).toHaveCount(0);
  }
  await appPage.getByRole('button', { name: 'Aparência', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Reduzir transparência/efeitos', exact: true }).click();
  await expect(appPage.locator('.corner-backdrop')).toHaveCount(0);
  await appPage.keyboard.press('Escape');
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(arc).toBeHidden();
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
});

test('expansão conserva o símbolo e revela o nome sem quadro opaco antes da transição', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  for (let cycle = 0; cycle < 3; cycle++) {
    await appPage.getByRole('button', { name: 'Recolher navegação', exact: true }).click();
    await expect(appPage.locator('.clean-study')).toHaveAttribute('data-collapsed', 'true');
    const frames = await appPage.evaluate(async () => {
      const name = document.querySelector<HTMLElement>('.brand-name')!,
        symbol = document.querySelector('.brand-symbol')!;
      (document.querySelector('.navigation-toggle') as HTMLButtonElement).click();
      const start = performance.now(),
        samples: { opacity: number; x: number; y: number }[] = [];
      await new Promise<void>((resolve) => {
        function sample() {
          const r = symbol.getBoundingClientRect();
          samples.push({ opacity: Number(getComputedStyle(name).opacity), x: r.x, y: r.y });
          if (performance.now() - start < 650) requestAnimationFrame(sample);
          else resolve();
        }
        requestAnimationFrame(sample);
      });
      return samples;
    });
    expect(frames.slice(0, 3).every((frame) => frame.opacity < 0.1)).toBe(true);
    expect(frames.some((frame) => frame.opacity > 0.1 && frame.opacity < 0.9)).toBe(true);
    expect(frames.at(-1)!.opacity).toBe(1);
    expect(
      Math.max(...frames.map((frame) => frame.x)) - Math.min(...frames.map((frame) => frame.x)),
    ).toBeLessThan(1);
    expect(
      Math.max(...frames.map((frame) => frame.y)) - Math.min(...frames.map((frame) => frame.y)),
    ).toBeLessThan(1);
  }
});
