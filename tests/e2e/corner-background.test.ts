import { test, expect } from '../fixtures/app';

test('artes rejeitadas não são montadas em nenhum destino', async ({ appPage }) => {
  for (const destination of ['Perfil', 'Hábitos', 'Produção', 'Foco']) {
    await appPage
      .getByRole('navigation')
      .getByRole('button', { name: destination, exact: true })
      .click();
    await expect(appPage.locator('.corner-backdrop,.editorial-engraving,.time-arc')).toHaveCount(0);
    await expect(appPage.getByRole('heading', { name: destination, exact: true })).toBeVisible();
  }
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
});
