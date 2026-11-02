import { test, expect } from '../fixtures/app';
import { visibility } from '../fixtures/clean';

// O harness geral é oculto. Motion exige frames reais numa janela de teste visível.
test.beforeEach(async ({ appPage, electronApp }) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].showInactive(),
  );
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-visible', 'true');
});

test('formulário anima em partes e salva sem esperar a animação; foco retorna ao botão', async ({
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  const opener = appPage.getByRole('button', { name: 'Novo hábito', exact: true });
  await opener.focus();
  await appPage.keyboard.press('Enter');
  const form = appPage.getByRole('form', { name: 'Criar hábito' });
  await expect(form.getByLabel('Nome', { exact: true })).toBeFocused();
  const animation = await form.evaluate((element) =>
    element.getAnimations().map((value) => ({
      duration: value.effect?.getTiming().duration,
      keyframes: (value.effect as KeyframeEffect).getKeyframes(),
    })),
  );
  expect(animation.some((value) => value.duration === 260 && value.keyframes.length === 2)).toBe(
    true,
  );
  await form.getByLabel('Nome', { exact: true }).fill('Leitura com movimento');
  await form.getByRole('button', { name: 'Salvar hábito' }).click();
  await expect(form).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(appPage.getByRole('article', { name: 'Leitura com movimento' })).toHaveCount(1);
  await appPage.waitForTimeout(350);
  expect(
    await appPage
      .locator('.clean-main')
      .evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length,
      ),
  ).toBe(0);
});

test('redução elimina movimento novo e evento web de invisibilidade cancela sem replay', async ({
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  await visibility(appPage, 'hidden');
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-visible', 'false');
  expect(
    await appPage
      .locator('.clean-main')
      .evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length,
      ),
  ).toBe(0);
  await visibility(appPage, 'visible');
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-visible', 'true');
  expect(
    await appPage.locator('.habit-form').evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await appPage.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  expect(
    await appPage
      .locator('.habit-form')
      .evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBe(0);
});

test('avisos agrupados preservam detalhes e dispensa sem ocupar a página inteira', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(async () => {
    await (
      globalThis as unknown as { seedProductionSessions: (count: number) => Promise<void> }
    ).seedProductionSessions(3);
  });
  const notices = appPage.locator('.session-notices');
  await expect(notices.locator('summary')).toContainText('3 avisos de sessão');
  await expect(notices).not.toHaveAttribute('open');
  expect((await notices.boundingBox())!.height).toBeLessThan(100);
  await notices.locator('summary').focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('button', { name: 'Dispensar aviso' })).toHaveCount(3);
  expect(
    await notices
      .locator('.history-content')
      .evaluate((element) =>
        element.getAnimations().some((animation) => animation.effect?.getTiming().duration === 260),
      ),
  ).toBe(true);
  await notices.locator('summary').click();
  expect(
    await notices.locator('.history-content').evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await notices.locator('summary').click();
  await appPage.getByRole('button', { name: 'Dispensar aviso' }).first().click();
  await expect(notices.locator('summary')).toContainText('2 avisos de sessão');
});

test('falha de entrega permanece sinalizada com os detalhes fechados', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(async () => {
    const fixture = globalThis as unknown as {
      desktopCalls: { notificationResult: 'failed' };
      seedProductionSessions: (count: number) => Promise<void>;
    };
    fixture.desktopCalls.notificationResult = 'failed';
    await fixture.seedProductionSessions(1);
  });
  const notices = appPage.locator('.session-notices');
  await expect(notices).not.toHaveAttribute('open');
  await expect(notices.locator('summary')).toContainText('Verificar entrega');
  await expect(notices).toHaveAttribute('data-attention', 'true');
  await notices.locator('summary').click();
  await expect(notices).toContainText('Notificação: falhou');
});
