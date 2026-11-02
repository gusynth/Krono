import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';
test('acabamento: contraste da data, refresh, fase, foco único e rodapé do perfil', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  await appPage.getByRole('button', { name: 'Pausa curta', exact: true }).click();
  await expect
    .poll(() =>
      appPage.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.id === 'semantic-content' && a.playState === 'running').length,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    appPage.getByRole('button', { name: 'Iniciar pausa curta', exact: true }),
  ).toBeVisible();
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await expect(appPage.locator('.mini-primary')).toHaveText('Iniciar pausa curta');
  await appPage.getByRole('button', { name: 'Voltar à janela completa', exact: true }).click();
  await appPage.getByRole('button', { name: 'Foco', exact: true }).last().click();
  await appPage.getByRole('switch', { name: 'Somente este foco', exact: true }).click();
  await expect(
    appPage.getByRole('switch', { name: 'Somente este foco', exact: true }),
  ).toBeChecked();
  expect(await appPage.locator('.clean-primary').evaluate((e) => getComputedStyle(e).opacity)).toBe(
    '1',
  );
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Produção', exact: true })
    .click();
  await appPage
    .getByRole('button', { name: 'Abrir calendário: Data final de Produção', exact: true })
    .click();
  for (const sample of await contrast(appPage, ['.date-popover [aria-selected=true]']))
    expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
  await appPage.screenshot({ path: 'artifacts/visual/editorial-calendar-fixed.png' });
  await appPage.keyboard.press('Escape');
  await appPage.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect
    .poll(() =>
      appPage.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.id === 'interface-feedback' && a.playState === 'running').length,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await appPage
      .getByRole('button', { name: 'Editar meta diária', exact: true })
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)');
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Perfil', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Agora não', exact: true }).click();
  await appPage.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  const modal = appPage.getByRole('dialog', { name: 'Editar perfil', exact: true });
  await expect(modal.getByRole('button', { name: /^Avatar / })).toHaveCount(12);
  await modal.getByRole('button', { name: 'Avatar Gato', exact: true }).click();
  const initials = await modal
      .getByRole('button', { name: 'Usar iniciais', exact: false })
      .boundingBox(),
    save = await modal.getByRole('button', { name: 'Salvar perfil', exact: true }).boundingBox();
  expect(Math.abs(initials!.y - save!.y)).toBeLessThan(12);
  await appPage.screenshot({ path: 'artifacts/visual/editorial-profile-fixed.png' });
  await modal.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await appPage.reload();
  expect(
    (await appPage.evaluate(() => window.krono!.desktop!.read())).preferences.profile?.avatar,
  ).toBe('gato');
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage.getByRole('button', { name: 'Pausa curta', exact: true }).click();
  expect(
    await appPage.evaluate(
      () => document.getAnimations().filter((a) => a.id === 'semantic-content').length,
    ),
  ).toBe(0);
});
