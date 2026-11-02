import { test, expect } from '../fixtures/clean';

test('navegação em tamanho real: normal, hover, selecionado e foco de teclado', async ({
  studyPage,
}) => {
  const nav = studyPage.getByRole('navigation');
  await nav.screenshot({ path: 'artifacts/visual/clean-nav-normal.png', animations: 'disabled' });
  await nav.getByRole('button', { name: 'Produção', exact: true }).hover();
  await nav.screenshot({ path: 'artifacts/visual/clean-nav-hover.png', animations: 'disabled' });
  await studyPage.locator('.clean-brand').focus();
  await studyPage.keyboard.press('Tab');
  await expect(
    studyPage.getByRole('button', { name: 'Recolher navegação', exact: true }),
  ).toBeFocused();
  await studyPage.keyboard.press('Tab');
  await expect(nav.getByRole('button', { name: 'Perfil', exact: true })).toBeFocused();
  await studyPage.keyboard.press('Tab');
  await expect(nav.getByRole('button', { name: 'Foco', exact: true })).toBeFocused();
  await nav.screenshot({ path: 'artifacts/visual/clean-nav-keyboard.png', animations: 'disabled' });
  await studyPage.getByRole('button', { name: 'Pausa curta', exact: true }).click();
  await expect(studyPage.locator('.clean-digits')).toHaveText('05:00');
  await studyPage.screenshot({
    path: 'artifacts/visual/clean-rest.png',
    fullPage: true,
    animations: 'disabled',
  });
});
