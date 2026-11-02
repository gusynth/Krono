import { test, expect } from '../fixtures/app';

test('áudio local silencioso libera a janela auxiliar após cada reprodução', async ({
  electronApp,
  appPage,
}) => {
  void appPage;
  const result = await electronApp.evaluate(async () =>
    (
      globalThis as unknown as {
        verifyMutedAudioLifecycle: () => Promise<{
          baseline: number;
          windows: number[];
          listenersReleased: boolean;
        }>;
      }
    ).verifyMutedAudioLifecycle(),
  );
  expect(result.windows).toEqual([result.baseline, result.baseline, result.baseline]);
  expect(result.listenersReleased).toBe(true);
});

test('hábitos em lotes, busca sem acento, legenda única e estados vazios', async ({ appPage }) => {
  await appPage.evaluate(async () => {
    const api = window.krono!.habits!;
    for (let index = 0; index < 25; index++) {
      const value = await api.read();
      await api.command({
        commandId: crypto.randomUUID(),
        expectedRevision: value.revision,
        action: 'create',
        habitId: crypto.randomUUID(),
        input: {
          name: index === 24 ? 'Meditação' : `Hábito ${String(index).padStart(2, '0')}`,
          kind: 'action',
          targetMinutes: 25,
          frequency: { kind: 'daily' },
        },
      });
    }
  });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await expect(appPage.locator('.habit-record')).toHaveCount(20);
  await expect(appPage.getByLabel('Legenda dos últimos 28 dias')).toHaveCount(1);
  await expect(appPage.getByRole('status').filter({ hasText: 'Mostrando 20 de 25' })).toBeVisible();
  const more = appPage.getByRole('button', { name: 'Mostrar mais hábitos' });
  await more.focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.locator('.habit-record')).toHaveCount(25);
  await expect(appPage.locator('.habit-record').nth(20)).toBeFocused();
  await expect(appPage.getByRole('status').filter({ hasText: 'Mostrando 25 de 25' })).toBeVisible();
  const search = appPage.getByRole('searchbox', { name: 'Buscar hábitos' });
  await search.fill('meditacao');
  await expect(appPage.locator('.habit-record')).toHaveCount(1);
  await expect(appPage.getByRole('article', { name: 'Meditação' })).toBeVisible();
  await search.fill('sem resultado');
  await expect(appPage.getByRole('heading', { name: 'Nenhum hábito encontrado' })).toBeVisible();
  await search.fill('');
  await expect(appPage.locator('.habit-record')).toHaveCount(20);
  const count = await appPage.evaluate(
    async () => (await window.krono!.habits!.read()).habits.length,
  );
  expect(count).toBe(25);
});

test('aparência persiste, ajustes fecham com foco e dados inválidos não quebram o shell', async ({
  appPage,
}) => {
  const open = appPage.getByRole('button', { name: 'Ajustes', exact: true });
  await open.click();
  const settings = appPage.getByRole('region', { name: 'Ajustes', exact: true });
  await settings.getByRole('switch', { name: 'Reduzir animações', exact: true }).check();
  await settings
    .getByRole('switch', { name: 'Reduzir transparência/efeitos', exact: true })
    .check();
  await settings.getByRole('button', { name: 'Fechar ajustes' }).click();
  await expect(open).toBeFocused();
  await expect(settings).toBeHidden();
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-effects', 'reduced');
  await open.click();
  await expect(
    settings.getByRole('switch', { name: 'Reduzir animações', exact: true }),
  ).toBeChecked();
  await appPage.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await appPage.evaluate(() => localStorage.setItem('krono.appearance.v1', '{invalid'));
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.getByRole('heading', { name: 'Foco', exact: true })).toBeVisible();
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-effects', 'full');
});

test('formulário vazio não duplica estado inicial; Produção mantém explicação consultável', async ({
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito' }).click();
  await expect(appPage.getByRole('heading', { name: 'Nenhum hábito cadastrado' })).toHaveCount(0);
  await appPage.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(appPage.getByRole('heading', { name: 'Nenhum hábito cadastrado' })).toBeVisible();
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Produção', exact: true })
    .click();
  const details = appPage.locator('.production-insights > details');
  await expect(details.locator('.history-content')).toHaveCount(0);
  await details.locator('summary').focus();
  await appPage.keyboard.press('Enter');
  await expect(details).toContainText('Pausas e tempo offline não entram nos totais');
});
