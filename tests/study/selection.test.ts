import { test, expect, visibility } from '../fixtures/clean';

// Alternativa superior preservada; a composição lateral tem matriz própria.
test.use({ navigation: 'top' });
import type { Page } from '@playwright/test';

export async function geometry(page: Page) {
  return page.getByRole('navigation').evaluate((root) => {
    const line = root.querySelector('.clean-selection')!.getBoundingClientRect();
    const button = root.querySelector('[aria-current]')!.getBoundingClientRect();
    const content = root.querySelector('[aria-current] .nav-content')!.getBoundingClientRect();
    return {
      left: line.left - button.left,
      right: line.right - button.right,
      width: line.width,
      buttonWidth: button.width,
      height: line.height,
      gap: line.top - content.bottom,
    };
  });
}
async function aligned(page: Page) {
  await expect
    .poll(async () => {
      const value = await geometry(page);
      return Math.max(Math.abs(value.left), Math.abs(value.right));
    })
    .toBeLessThan(1);
}

test('barra proporcional: limites reais, trilho com borda/padding, resize e fontes', async ({
  studyPage,
  studyApp,
}, testInfo) => {
  test.setTimeout(90000);
  await visibility(studyPage, 'visible');
  const nav = studyPage.getByRole('navigation');
  const line = nav.locator('.clean-selection');
  const original = await line.elementHandle();
  const measurements = [];
  await aligned(studyPage);
  measurements.push({
    viewport: await studyPage.evaluate(() => innerWidth),
    name: 'Foco inicial',
    ...(await geometry(studyPage)),
  });
  for (const width of [980, 1280, 1920]) {
    await studyApp.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 900),
      width,
    );
    await expect.poll(() => studyPage.evaluate(() => innerWidth)).toBe(width);
    for (const name of ['Foco', 'Hábitos', 'Produção']) {
      await nav.getByRole('button', { name, exact: true }).click();
      await aligned(studyPage);
      measurements.push({ viewport: width, name, ...(await geometry(studyPage)) });
      expect(await line.evaluate((element, identity) => element === identity, original)).toBe(true);
      await expect(line).toHaveCount(1);
      await studyPage.locator('.clean-header').screenshot({
        path: `artifacts/visual/proportional-${width}-${name}.png`,
        animations: 'disabled',
      });
    }
  }
  expect(
    new Set(
      measurements.filter((value) => value.viewport === 1280).map((value) => value.buttonWidth),
    ).size,
  ).toBe(3);
  expect(
    Math.max(...measurements.map((value) => value.gap)) -
      Math.min(...measurements.map((value) => value.gap)),
  ).toBeLessThan(1);
  expect(measurements.every((value) => value.height === 3)).toBe(true);
  // Exercita o sistema local de coordenadas, sem alterar o estilo do produto.
  await nav.evaluate((element) => {
    Object.assign((element as HTMLElement).style, {
      border: '3px solid transparent',
      padding: '0 11px',
    });
  });
  await aligned(studyPage);
  await nav
    .getByRole('button', { name: 'Foco', exact: true })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await studyApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1100, 900),
  );
  await expect.poll(() => studyPage.evaluate(() => innerWidth)).toBe(1100);
  await aligned(studyPage);
  // Mudança de métricas tipográficas equivale à geometria que uma fonte tardia altera.
  await nav.getByRole('button', { name: 'Foco', exact: true }).evaluate((element) => {
    (element as HTMLElement).style.fontSize = '19px';
  });
  await aligned(studyPage);
  await testInfo.attach('bordas-e-distancia', {
    body: JSON.stringify({ toleranceCssPx: 1, measurements }),
    contentType: 'application/json',
  });
});

test('mesma barra: redireciona posição e largura, teclado, repetição, redução e invisibilidade', async ({
  studyPage,
}) => {
  await visibility(studyPage, 'visible');
  const nav = studyPage.getByRole('navigation');
  const line = nav.locator('.clean-selection');
  await aligned(studyPage);
  await nav
    .getByRole('button', { name: 'Produção', exact: true })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await line.evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 80;
  });
  const before = await line.boundingBox();
  await nav
    .getByRole('button', { name: 'Hábitos', exact: true })
    .evaluate((element) => (element as HTMLButtonElement).click());
  const current = await line.evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, width: bounds.width, duration: animation.effect!.getTiming().duration };
  });
  expect(Math.abs(current.x - before!.x)).toBeLessThan(1);
  expect(Math.abs(current.width - before!.width)).toBeLessThan(1);
  expect(current.duration).toBe(260);
  for (let index = 0; index < 20; index++) {
    await nav
      .getByRole('button', { name: ['Foco', 'Produção', 'Hábitos'][index % 3], exact: true })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect(line).toHaveCount(1);
    expect(await line.evaluate((element) => element.getAnimations().length)).toBeLessThanOrEqual(1);
  }
  await nav.getByRole('button', { name: 'Foco', exact: true }).focus();
  await studyPage.keyboard.press('Enter');
  await aligned(studyPage);
  await expect(nav.getByRole('button', { name: 'Foco', exact: true })).toBeFocused();
  const layout = await nav
    .getByRole('button')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
  await studyPage.keyboard.press('Enter');
  expect(
    await nav
      .getByRole('button')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width)),
  ).toEqual(layout);
  await studyPage.getByRole('button', { name: 'Ajustes' }).click();
  await studyPage.getByRole('switch', { name: 'Reduzir animações' }).check();
  await studyPage.keyboard.press('Escape');
  await nav.getByRole('button', { name: 'Produção', exact: true }).click();
  expect(await line.evaluate((element) => element.getAnimations().length)).toBe(0);
  await aligned(studyPage);
  await visibility(studyPage, 'hidden');
  await visibility(studyPage, 'visible');
  expect(await line.evaluate((element) => element.getAnimations().length)).toBe(0);
});
