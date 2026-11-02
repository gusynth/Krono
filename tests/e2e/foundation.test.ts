import { test, expect } from '../fixtures/app';

test('renderer isolado, SQLite disponível e tempo continua no main oculto', async ({
  electronApp,
  appPage,
}) => {
  expect((await appPage.evaluate(() => window.krono!.foundation())).storage).toBe('ready');
  await expect(appPage.locator('.clean-footer')).toHaveCount(0);
  expect(
    await appPage.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
  ).toBe('undefined');
  expect(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
  ).toBe(false);
  await expect
    .poll(() =>
      electronApp.evaluate(
        () => (globalThis as unknown as { probeResult?: { state: string } }).probeResult?.state,
      ),
    )
    .toBe('awaiting-next');
  expect(
    await appPage.evaluate(() => typeof (window as unknown as { process?: unknown }).process),
  ).toBe('undefined');
});

test('navegação mantém hábitos persistentes e Produção real sem dados inventados', async ({
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await expect(appPage.getByRole('heading', { name: 'Nenhum hábito cadastrado' })).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.habits!.read()).habits)).toEqual(
    [],
  );
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Produção', exact: true })
    .click();
  await expect(appPage.getByRole('region', { name: 'Histórico de sessões' })).toContainText(
    'Nenhuma sessão de foco neste período.',
  );
});

test('worker encerrado mostra erro na consulta seguinte, sem falso salvo', async ({
  electronApp,
  appPage,
}) => {
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { stopStorage: () => Promise<number> }).stopStorage();
  });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.locator('.shell-storage-error')).toContainText(
    'Os arquivos existentes foram preservados.',
  );
  await expect(appPage.locator('.shell-storage-error')).toContainText(
    'Use Ajustes para selecionar um backup e iniciar o resgate.',
  );
  await expect(appPage.locator('.shell-storage-error')).toContainText(
    'Se houver um resgate pendente, feche e reabra para verificá-lo.',
  );
  await expect(appPage.locator('.shell-storage-error')).not.toContainText(
    'Nenhum dado foi substituído',
  );
  await expect(appPage.locator('.clean-time')).toHaveAttribute('data-state', 'storage-error');
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(appPage.locator('.settings-diagnostic')).toContainText('Temporizador indisponível');
});

for (const [width, height] of [
  [980, 700],
  [1280, 800],
  [1920, 1080],
]) {
  test(`layout ${width}×${height} sem overflow horizontal`, async ({ electronApp, appPage }) => {
    await electronApp.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]),
      [width, height],
    );
    expect(
      await appPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await appPage.screenshot({ path: `artifacts/visual/foco-${width}.png`, fullPage: true });
  });
}
