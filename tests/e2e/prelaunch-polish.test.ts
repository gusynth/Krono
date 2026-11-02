import { mkdir } from 'node:fs/promises';
import { test, expect } from '../fixtures/app';
const go = (p: import('@playwright/test').Page, name: string) =>
  p
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name, exact: true })
    .click();

test('perfil distribui avatares, iniciais vivas e fechamento; jardim tem lugar estável e pode ser ocultado', async ({
  appPage: page,
  electronApp,
}) => {
  await mkdir('artifacts/visual/prelaunch-polish', { recursive: true });
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.showInactive(),
  );
  await page.evaluate(async () => {
    const api = window.krono!.desktop!,
      s = await api.read();
    await api.update({
      expectedRevision: s.preferences.revision,
      patch: {
        profile: { name: 'Ana Lima', avatar: 'gato', onboarded: true },
        garden: { version: 1, introductionSeen: true, enabled: true },
      },
    });
  });
  await go(page, 'Perfil');
  await expect(page.getByRole('button', { name: 'Abrir jardim', exact: true })).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/visual/prelaunch-polish/profile.png',
  });
  await go(page, 'Foco');
  await expect(page.getByRole('button', { name: 'Abrir jardim', exact: true })).toBeHidden();
  await go(page, 'Perfil');
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar perfil', exact: true });
  await editor.getByRole('textbox').fill('Beatriz Costa');
  const initials = editor.getByRole('button', { name: 'Usar iniciais BC', exact: true });
  await expect(initials.locator('.initials-preview')).toHaveText('BC');
  const avatars = await editor.locator('.avatar-options img').evaluateAll((els) =>
    els.map((e) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }),
  );
  expect(new Set(avatars.map((e) => Math.round(e.w)))).toHaveProperty('size', 1);
  expect(new Set(avatars.map((e) => Math.round(e.y)))).toHaveProperty('size', 2);
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/visual/prelaunch-polish/avatars.png',
  });
  await initials.click();
  await editor.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver sessões deste dia', exact: true }).click();
  const day = page.getByRole('dialog', { name: /Sessões de/ });
  const x = day.getByRole('button', { name: 'Fechar detalhes do dia', exact: true });
  await expect(x.locator('svg')).toBeVisible();
  await expect(x).toHaveText('');
  const d = (await day.boundingBox())!,
    c = (await x.boundingBox())!;
  expect(d.x + d.width - c.x - c.width).toBeGreaterThanOrEqual(16);
  expect(c.y - d.y).toBeGreaterThanOrEqual(16);
  await expect(day.getByText('Nenhuma sessão neste dia.', { exact: true })).toBeVisible();
  await expect(day.getByRole('navigation')).toHaveCount(0);
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/visual/prelaunch-polish/day.png',
  });
  await x.click();
  await expect(
    page.getByRole('button', { name: 'Ver sessões deste dia', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Sistema', exact: true }).click();
  await page.getByRole('switch', { name: 'Mostrar jardim no Perfil', exact: true }).uncheck();
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.krono!.desktop!.read()).preferences.garden?.enabled),
    )
    .toBe(false);
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/visual/prelaunch-polish/settings.png',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir jardim', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir jardim', exact: true })).toHaveCount(0);
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(800, 640),
  );
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  expect(await editor.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(editor.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('produção elimina linhas duplicadas e paginação vazia; lembrete tem ação compacta e funcional', async ({
  appPage: page,
}) => {
  await go(page, 'Produção');
  await expect(
    page.getByRole('navigation', { name: 'Paginação do histórico', exact: true }),
  ).toHaveCount(0);
  const edit = page.getByRole('button', { name: 'Editar meta diária', exact: true });
  expect(await edit.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
  await edit.click();
  await expect(page.getByRole('dialog', { name: 'Editar meta diária', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Sistema', exact: true }).click();
  const time = page.getByRole('textbox', { name: 'Lembrete diário de hábitos', exact: true }),
    clear = page.getByRole('button', { name: 'Desativar lembrete', exact: true });
  await expect(clear).toBeDisabled();
  await time.fill('18:30');
  await time.press('Enter');
  await expect(clear).toBeEnabled();
  expect((await clear.boundingBox())!.height).toBeLessThanOrEqual(40);
  await clear.click();
  await expect(time).toHaveValue('');
  await expect(clear).toBeDisabled();
});
