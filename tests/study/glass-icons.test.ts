import { test, expect, visibility, iconAnimationCount } from '../fixtures/clean';

// Alternativa superior preservada; a composição lateral tem matriz própria.
test.use({ navigation: 'top' });

test('ícones compactos: cabeçalho, hitboxes, estados e quadros de ativação', async ({
  studyPage,
}) => {
  test.setTimeout(90000);
  await visibility(studyPage, 'visible');
  const nav = studyPage.getByRole('navigation');
  const header = studyPage.locator('.clean-header');
  for (const button of await nav.getByRole('button').all()) {
    const hitbox = await button.boundingBox();
    const object = await button.locator('svg').boundingBox();
    expect(hitbox!.height).toBeGreaterThanOrEqual(44);
    expect(hitbox!.width).toBeGreaterThanOrEqual(44);
    expect(object!.width).toBe(34);
    expect(
      await button.locator('svg').evaluate((element) => getComputedStyle(element).pointerEvents),
    ).toBe('none');
  }
  await header.screenshot({
    path: 'artifacts/visual/glass-header-rest.png',
    animations: 'disabled',
  });
  await nav.getByRole('button', { name: 'Hábitos', exact: true }).click();
  await expect.poll(() => iconAnimationCount(studyPage)).toBe(0);
  await nav.getByRole('button', { name: 'Produção', exact: true }).hover();
  await header.screenshot({
    path: 'artifacts/visual/glass-header-hover-selected.png',
    animations: 'disabled',
  });

  // Quadros determinísticos dos gestos reais, sem alterar o código da aplicação.
  let frame = 0;
  for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await studyPage.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.id.startsWith('krono-'))
        .forEach((animation) => animation.pause()),
    );
    for (const fraction of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      await studyPage.evaluate(
        (value) =>
          document
            .getAnimations()
            .filter((animation) => animation.id.startsWith('krono-'))
            .forEach((animation) => {
              const timing = animation.effect!.getTiming();
              animation.currentTime = (Number(timing.duration) + Number(timing.delay)) * value;
            }),
        fraction,
      );
      await header.screenshot({
        path: `artifacts/visual/glass-frame-${String(frame++).padStart(2, '0')}.png`,
        animations: 'allow',
      });
    }
  }
  await studyPage.getByRole('button', { name: 'Ajustes' }).click();
  await studyPage.getByRole('switch', { name: 'Reduzir animações' }).check();
  await studyPage.keyboard.press('Escape');
  await nav.getByRole('button', { name: 'Foco', exact: true }).focus();
  await studyPage.keyboard.press('Enter');
  await expect(nav.getByRole('button', { name: 'Foco', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(await iconAnimationCount(studyPage)).toBe(0);
  await header.screenshot({
    path: 'artifacts/visual/glass-header-reduced.png',
    animations: 'disabled',
  });
});

for (const scale of [1, 1.25, 1.5, 2]) {
  test.describe(`escala de dispositivo Chromium ${scale}`, () => {
    test.use({ deviceScale: scale });
    test('nomes, alinhamento, tamanho e transparência', async ({ studyPage }) => {
      expect(await studyPage.evaluate(() => devicePixelRatio)).toBeCloseTo(scale, 1);
      const nav = studyPage.getByRole('navigation');
      for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção'])
        await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
      expect(
        await studyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
        await nav.getByRole('button', { name, exact: true }).click();
        await expect
          .poll(() =>
            nav.evaluate((element) => {
              const line = element.querySelector('.clean-selection')!.getBoundingClientRect();
              const button = element.querySelector('[aria-current]')!.getBoundingClientRect();
              return Math.max(
                Math.abs(line.left - button.left),
                Math.abs(line.right - button.right),
              );
            }),
          )
          .toBeLessThan(1);
      }
      await nav.screenshot({
        path: `artifacts/visual/glass-nav-scale-${scale}.png`,
        animations: 'disabled',
      });
      // Fundos locais contrastantes revelam halos/bordas; não são tema do produto.
      for (const background of ['#16161a', '#eeeeee']) {
        await nav.evaluate((element, color) => {
          (element as HTMLElement).style.background = color;
        }, background);
        await nav.screenshot({
          path: `artifacts/visual/glass-transparency-${scale}-${background.slice(1)}.png`,
          animations: 'disabled',
        });
      }
    });
  });
}
