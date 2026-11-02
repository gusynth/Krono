import { mkdir } from 'node:fs/promises';
import { test, expect } from '../fixtures/app';
import type { Page } from '@playwright/test';
const dialog = (p: Page) =>
  p.getByRole('dialog', { name: 'Conheça o jardim de foco', exact: true });
const legacy = async (p: Page) =>
  p.evaluate(async () => {
    const api = window.krono!.desktop!,
      s = await api.read();
    await api.update({
      expectedRevision: s.preferences.revision,
      patch: {
        profile: { name: 'Ana', avatar: 'gato', onboarded: true },
        garden: { version: 1, introductionSeen: false },
      },
    });
  });

test('perfil existente recebe convite uma vez, aceita e reencontra jardim após reabrir', async ({
  appPage: page,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.showInactive(),
  );
  await legacy(page);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('quatro capítulos');
  await mkdir('artifacts/visual/garden-invitation', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual/garden-invitation/invitation.png',
    animations: 'disabled',
  });
  await dialog(page).getByRole('button', { name: 'Quero experimentar', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir jardim', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await window.krono!.desktop!.read()).preferences.garden?.enabled,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});
test('agora não e Escape persistem recusa; Ajustes permitem ativar depois', async ({
  appPage: page,
}) => {
  await legacy(page);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  expect(
    await page.evaluate(
      async () => (await window.krono!.desktop!.read()).preferences.garden?.enabled,
    ),
  ).toBe(false);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Sistema', exact: true }).click();
  await page.getByRole('switch', { name: 'Mostrar jardim no Perfil', exact: true }).check();
  await page.keyboard.press('Escape');
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Perfil', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Abrir jardim', exact: true })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});
test('sessão e outro diálogo têm prioridade; convite aparece ao ficar disponível', async ({
  appPage: page,
}) => {
  await page.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await legacy(page);
  await expect(dialog(page)).toHaveCount(0);
  await page.evaluate(async () => {
    const api = window.krono!.timer!,
      s = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: s.revision,
      sessionId: s.sessionId,
      action: 'cancel',
    });
  });
  await expect(page.getByRole('dialog', { name: 'Ajustes', exact: true })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Agora não', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
});
test('falha de gravação conserva convite e permite nova tentativa sem perder a escolha', async ({
  appPage: page,
  electronApp,
}) => {
  await legacy(page);
  await expect(dialog(page)).toBeVisible();
  await electronApp.evaluate(() =>
    (
      globalThis as unknown as { setPreferenceWriteFailure: (v: boolean) => void }
    ).setPreferenceWriteFailure(true),
  );
  await dialog(page).getByRole('button', { name: 'Quero experimentar', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Não foi possível salvar');
  expect(
    await page.evaluate(
      async () => (await window.krono!.desktop!.read()).preferences.garden?.enabled,
    ),
  ).toBeUndefined();
  await electronApp.evaluate(() =>
    (
      globalThis as unknown as { setPreferenceWriteFailure: (v: boolean) => void }
    ).setPreferenceWriteFailure(false),
  );
  await dialog(page).getByRole('button', { name: 'Quero experimentar', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
});
