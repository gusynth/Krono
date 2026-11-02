import { test, expect } from '../fixtures/app';
import { visibility } from '../fixtures/clean';

test('pressed mantém hitbox e altera apenas a superfície do botão', async ({ appPage }) => {
  const button = appPage.getByRole('button', { name: 'Iniciar foco', exact: true });
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  const before = await button.boundingBox();
  await appPage.mouse.down();
  await expect
    .poll(() => button.locator(':scope > span').evaluate((el) => getComputedStyle(el).transform))
    .not.toBe('none');
  expect(await button.boundingBox()).toEqual(before);
  await appPage.screenshot({ path: 'artifacts/visual/pressed.png', fullPage: true });
  await appPage.mouse.up();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
});

test('quatro combinações independentes de redução e teclado', async ({ appPage }) => {
  await visibility(appPage, 'visible');
  for (const effects of [false, true])
    for (const movement of [false, true]) {
      await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
      await appPage.getByRole('switch', { name: 'Reduzir animações' }).setChecked(movement);
      await appPage
        .getByRole('switch', { name: 'Reduzir transparência/efeitos' })
        .setChecked(effects);
      await expect(appPage.locator('.clean-study')).toHaveAttribute(
        'data-effects',
        effects ? 'reduced' : 'full',
      );
      await expect(appPage.locator('.clean-study')).toHaveAttribute(
        'data-motion',
        movement ? 'reduced' : 'full',
      );
      await appPage.keyboard.press('Escape');
      await appPage.screenshot({
        path: `artifacts/visual/reductions-${effects}-${movement}.png`,
        fullPage: true,
      });
    }
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeFocused();
});

test('preferência do sistema remove deslocamentos e navegação rápida converge', async ({
  appPage,
}) => {
  await visibility(appPage, 'visible');
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
  await appPage.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'full');
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
  const nav = appPage.getByRole('navigation');
  for (let i = 0; i < 10; i++)
    await nav
      .getByRole('button', { name: i % 2 ? 'Hábitos' : 'Produção', exact: true })
      .evaluate((element) => (element as HTMLButtonElement).click());
  await expect(appPage.getByRole('heading', { name: 'Hábitos', exact: true })).toBeVisible();
});
