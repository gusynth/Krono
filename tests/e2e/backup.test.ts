import { test, expect } from '../fixtures/app';
import type { Page, ElectronApplication } from '@playwright/test';
async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Dados', exact: true }).click();
}
async function seed(app: ElectronApplication, count: number) {
  await app.evaluate(async (_electron, value) => {
    await (
      globalThis as unknown as { seedProductionSessions: (count: number) => Promise<void> }
    ).seedProductionSessions(value);
  }, count);
}
const region = (page: Page) =>
  page.getByRole('region', { name: 'Backup e restauração', exact: true });

test('validação do backup não bloqueia pausa ou persistência do timer', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(() => {
    (
      globalThis as unknown as { backupTest: { holdValidation: boolean } }
    ).backupTest.holdValidation = true;
  });
  await appPage.evaluate(async () => {
    const api = window.krono!.timer!,
      value = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: value.revision,
      sessionId: value.sessionId,
      action: 'start',
    });
  });
  await openSettings(appPage);
  await region(appPage).getByRole('button', { name: 'Salvar backup', exact: true }).click();
  await expect
    .poll(() =>
      electronApp.evaluate(
        () =>
          (globalThis as unknown as { backupTest: { validating: boolean } }).backupTest.validating,
      ),
    )
    .toBe(true);
  // Só libera a validação depois de confirmar que o writer aceitou pausa.
  expect(
    await appPage.evaluate(async () => {
      const api = window.krono!.timer!,
        value = await api.read();
      return (
        await api.command({
          commandId: crypto.randomUUID(),
          expectedRevision: value.revision,
          sessionId: value.sessionId,
          action: 'pause',
        })
      ).code;
    }),
  ).toBe('ok');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'paused',
  );
  await electronApp.evaluate(() => {
    (globalThis as unknown as { releaseBackupValidation: () => void }).releaseBackupValidation();
  });
  await expect(region(appPage)).toContainText('Backup salvo e validado.');
});

test('backup real: salvar, confirmar por teclado, restaurar, guardar estado anterior e bloquear comandos antigos', async ({
  appPage,
  electronApp,
}) => {
  await seed(electronApp, 1);
  const brandBefore = (await appPage.locator('.clean-brand').boundingBox())!;
  await openSettings(appPage);
  await region(appPage).getByRole('button', { name: 'Salvar backup', exact: true }).click();
  await expect(region(appPage)).toContainText('Backup salvo e validado.');
  await seed(electronApp, 1);
  await region(appPage).getByRole('button', { name: 'Selecionar backup', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  const group = appPage.getByRole('group', { name: 'Confirmar restauração' });
  await expect(group).toContainText('1 sessão e 0 hábitos');
  await expect(group.getByRole('checkbox')).toBeFocused();
  const brandAfter = (await appPage.locator('.clean-brand').boundingBox())!;
  expect(Math.abs(brandAfter.y - brandBefore.y)).toBeLessThanOrEqual(1);
  await expect(group.getByRole('button', { name: 'Restaurar e reiniciar' })).toBeDisabled();
  await appPage.keyboard.press('Space');
  await expect(group.getByRole('checkbox')).toBeChecked();
  await appPage.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document
      .querySelector('.settings-popover .study-popover')
      ?.scrollTo({ top: 2000, behavior: 'instant' });
  });
  await appPage.screenshot({ path: 'artifacts/visual/backup-confirm.png' });
  await group.getByRole('button', { name: 'Restaurar e reiniciar' }).click();
  await expect(region(appPage)).toContainText('Dados restaurados.');
  expect(
    await electronApp.evaluate(
      () => (globalThis as unknown as { backupTest: { restarts: number } }).backupTest.restarts,
    ),
  ).toBe(1);
  expect(
    await electronApp.evaluate(async () =>
      (
        globalThis as unknown as { backupPreviousFiles: () => Promise<string[]> }
      ).backupPreviousFiles(),
    ),
  ).toHaveLength(1);
  const blocked = await appPage.evaluate(async () => {
    try {
      await window.krono!.production!.read({ days: 1, habitId: null });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});
test('restauração: cancelar por teclado preserva os registros e devolve foco', async ({
  appPage,
  electronApp,
}) => {
  await seed(electronApp, 1);
  await openSettings(appPage);
  await region(appPage).getByRole('button', { name: 'Salvar backup', exact: true }).click();
  await expect(region(appPage)).toContainText('Backup salvo');
  await region(appPage).getByRole('button', { name: 'Selecionar backup', exact: true }).click();
  const cancel = region(appPage).getByRole('button', { name: 'Cancelar restauração' });
  await cancel.focus();
  await appPage.keyboard.press('Enter');
  await expect(
    region(appPage).getByRole('button', { name: 'Selecionar backup', exact: true }),
  ).toBeFocused();
  expect(
    await appPage.evaluate(
      async () =>
        (await window.krono!.production!.read({ days: 1, habitId: null })).metrics.sessions,
    ),
  ).toBe(1);
  expect(
    await electronApp.evaluate(
      () => (globalThis as unknown as { backupTest: { restarts: number } }).backupTest.restarts,
    ),
  ).toBe(0);
});
test('backup inválido e sessão ativa não substituem os dados', async ({ appPage, electronApp }) => {
  await openSettings(appPage);
  await region(appPage).getByRole('button', { name: 'Salvar backup', exact: true }).click();
  await expect(region(appPage)).toContainText('Backup salvo');
  await region(appPage).getByRole('button', { name: 'Selecionar backup', exact: true }).click();
  await expect(region(appPage).getByRole('checkbox')).toBeVisible();
  await appPage.evaluate(async () => {
    const api = window.krono!.timer!,
      value = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: value.revision,
      sessionId: value.sessionId,
      action: 'start',
    });
  });
  await region(appPage).getByRole('checkbox').check();
  await region(appPage).getByRole('button', { name: 'Restaurar e reiniciar' }).click();
  await expect(region(appPage)).toContainText('Encerre a sessão atual');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'running',
  );
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { corruptBackup: () => Promise<void> }).corruptBackup();
  });
  await region(appPage).getByRole('button', { name: 'Selecionar backup', exact: true }).click();
  await expect(region(appPage)).toContainText('Arquivo incompatível, inválido');
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'running',
  );
});
test('backup: diálogos cancelados, cliques rápidos e ACK perdido não repetem restore', async ({
  appPage,
  electronApp,
}) => {
  await openSettings(appPage);
  await electronApp.evaluate(() => {
    (
      globalThis as unknown as { backupTest: { destination: string | null } }
    ).backupTest.destination = null;
  });
  await region(appPage).getByRole('button', { name: 'Salvar backup', exact: true }).click();
  await expect(region(appPage)).toContainText('Operação cancelada.');
  await electronApp.evaluate(() => {
    const value = (
      globalThis as unknown as {
        backupTest: { destination: string | null; source: string | null; loseAck: boolean };
      }
    ).backupTest;
    value.destination = value.source;
    value.loseAck = true;
  });
  await region(appPage).getByRole('button', { name: 'Salvar backup', exact: true }).click();
  await expect(region(appPage)).toContainText('Backup salvo');
  await region(appPage).getByRole('button', { name: 'Selecionar backup', exact: true }).click();
  await region(appPage).getByRole('checkbox').check();
  const result = await appPage.evaluate(async () => {
    const element = document.querySelector('.backup-confirm button') as HTMLButtonElement;
    element.click();
    element.click();
  });
  void result;
  await expect(region(appPage)).toContainText('Dados restaurados.');
  expect(
    await electronApp.evaluate(
      () => (globalThis as unknown as { backupTest: { restarts: number } }).backupTest.restarts,
    ),
  ).toBe(1);
});
test('backup: redução de movimento, teclado e escalas de conteúdo preservam controles', async ({
  appPage,
  electronApp,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await openSettings(appPage);
  await region(appPage).getByRole('button', { name: 'Salvar backup', exact: true }).click();
  await expect(region(appPage)).toContainText('Backup salvo');
  await region(appPage).getByRole('button', { name: 'Selecionar backup', exact: true }).click();
  for (const zoom of [1, 1.25, 1.5, 2]) {
    await electronApp.evaluate(({ BrowserWindow }, factor) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor);
    }, zoom);
    await expect(
      region(appPage).getByRole('button', { name: 'Cancelar restauração' }),
    ).toBeEnabled();
    const overflow = await appPage.evaluate(() => {
      const box = document.querySelector('.settings-popover .study-popover')!;
      return box.scrollWidth - box.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
