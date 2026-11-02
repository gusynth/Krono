import type { ElectronApplication } from '@playwright/test';
import { test, expect } from '../fixtures/app';

async function advance(app: ElectronApplication, ms: number) {
  await app.evaluate(async (_electron, value) => {
    await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
      value,
    );
  }, ms);
}
test('Foco real: teclado, pausa, reload, conclusão única e próxima etapa manual', async ({
  electronApp,
  appPage,
}) => {
  const action = appPage.getByRole('button', { name: 'Iniciar foco', exact: true });
  await action.focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'running',
  );
  await advance(electronApp, 15_000);
  await expect(appPage.locator('.clean-digits')).toHaveText('24:45');
  await appPage.getByRole('button', { name: 'Pausar', exact: true }).click();
  await advance(electronApp, 60_000);
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await expect(appPage.locator('.clean-digits')).toHaveText('24:45');
  await appPage.getByRole('button', { name: 'Retomar', exact: true }).click();
  for (let index = 0; index < 99; index++) await advance(electronApp, 15_000);
  await expect(
    appPage.getByRole('button', { name: 'Iniciar pausa curta', exact: true }),
  ).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).cycle)).toBe(1);
  await advance(electronApp, 60_000);
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe(
    'awaiting-next',
  );
  await appPage.screenshot({ path: 'artifacts/visual/focus-completed.png', fullPage: true });
  await appPage.getByRole('button', { name: 'Iniciar pausa curta', exact: true }).click();
  await expect(appPage.locator('.clean-digits')).toHaveText('05:00');
});

test('comandos inválidos, repetidos e conflito de revisão são protegidos no main', async ({
  appPage,
}) => {
  const result = await appPage.evaluate(async () => {
    const api = window.krono!.timer!;
    const command = {
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      sessionId: null,
      action: 'start' as const,
    };
    const first = await api.command(command);
    const repeated = await api.command(command);
    const stale = await api.command({ ...command, commandId: crypto.randomUUID() });
    const invalid = await api.command({
      ...command,
      commandId: crypto.randomUUID(),
      preset: { focusMs: 0, shortBreakMs: 0, longBreakMs: 0, longEvery: 0 },
    });
    return { first, repeated, stale, invalid };
  });
  expect(result.first.code).toBe('ok');
  expect(result.repeated.code).toBe('ok');
  expect(result.repeated.snapshot.sessionId).toBe(result.first.snapshot.sessionId);
  expect(result.stale.code).toBe('conflict');
  expect(result.invalid.code).toBe('invalid');
});

test('encerrar exige confirmação, mantém histórico parcial sem crédito e permite nova sessão', async ({
  electronApp,
  appPage,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await advance(electronApp, 15_000);
  await appPage.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  const dialog = appPage.getByRole('alertdialog');
  await expect(dialog).toContainText('não será contado');
  await dialog.getByRole('button', { name: 'Continuar sessão' }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).cycle)).toBe(0);
});

test('falha de worker suspende contagem, não anuncia sucesso e mantém retry explícito', async ({
  electronApp,
  appPage,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { stopStorage: () => Promise<number> }).stopStorage();
  });
  await expect(appPage.getByRole('alert')).toContainText('Não foi possível salvar');
  await expect(appPage.locator('.clean-time')).toHaveAttribute('data-state', 'storage-error');
  await expect(appPage.getByRole('button', { name: 'Tentar salvar novamente' })).toBeVisible();
  await appPage.screenshot({ path: 'artifacts/visual/focus-storage-error.png', fullPage: true });
});

test('reabrir autoridade recupera apenas checkpoint e a UI exige recuperar ou descartar', async ({
  electronApp,
  appPage,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await advance(electronApp, 15_000);
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { restartTimer: () => Promise<unknown> }).restartTimer();
  });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Recuperar sessão' })).toBeVisible();
  await expect(appPage.getByRole('alert')).toContainText('offline não foi contado');
  await expect(appPage.locator('.clean-digits')).toHaveText('24:45');
  await appPage.screenshot({ path: 'artifacts/visual/focus-recovery.png', fullPage: true });
  await appPage.getByRole('button', { name: 'Recuperar sessão' }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await advance(electronApp, 15_000);
  await expect(appPage.locator('.clean-digits')).toHaveText('24:30');
});
