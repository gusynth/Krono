import { test, expect } from '../fixtures/app';
import { mkdir } from 'node:fs/promises';

async function configure(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const api = window.krono!.timer!,
      state = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      sessionId: state.sessionId,
      action: 'configure',
      configuration: {
        focusMinutes: 1,
        proportional: false,
        shortBreakMinutes: 1,
        longBreakMinutes: 1,
        longEvery: 4,
      },
    });
    const habits = window.krono!.habits!,
      current = await habits.read(),
      id = crypto.randomUUID();
    await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: current.revision,
      action: 'create',
      habitId: id,
      input: {
        name: 'Leitura com um nome bastante longo para conferir o recorte visual',
        kind: 'time',
        targetMinutes: 1,
        frequency: { kind: 'daily' },
      },
    });
    const next = await habits.read();
    await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: next.revision,
      action: 'select',
      habitId: id,
    });
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
}
async function fits(page: import('@playwright/test').Page) {
  await expect
    .poll(() =>
      page.locator('.mini-timer').evaluate((root) => {
        const elements = [
          ...root.querySelectorAll(
            '.mini-context,.mini-digits,.mini-actions button,.mini-cycle-actions button,.mini-size',
          ),
        ];
        return elements.every((element) => {
          const r = element.getBoundingClientRect();
          return (
            r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1
          );
        });
      }),
    )
    .toBe(true);
  const digits = (await page.locator('.mini-digits').boundingBox())!,
    actions = (await page.locator('.mini-actions').boundingBox())!;
  expect(digits.y + digits.height).toBeLessThan(actions.y);
  const size = (await page.locator('.mini-size').boundingBox())!,
    controls = (await page.locator('.window-controls').boundingBox())!;
  expect(size.x + size.width).toBeLessThanOrEqual(controls.x);
}
test('mini preserva sessão e hábito; confirma encerramento sem crédito indevido e permite concluir a etapa', async ({
  appPage,
  electronApp,
}) => {
  await configure(appPage);
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  const initial = await appPage.evaluate(() => window.krono!.timer!.read());
  await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
  await fits(appPage);
  await expect(appPage.locator('.mini-habit')).toContainText('Leitura com um nome bastante longo');
  await appPage.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(appPage.locator('.mini-status')).toHaveText('Pausado');
  await appPage.getByRole('button', { name: 'Retomar', exact: true }).click();
  expect((await appPage.evaluate(() => window.krono!.timer!.read())).sessionId).toBe(
    initial.sessionId,
  );
  const end = appPage.getByRole('button', { name: 'Encerrar sessão', exact: true });
  await end.click();
  const dialog = appPage.getByRole('alertdialog', { name: 'Encerrar sessão', exact: true });
  await expect(dialog).toContainText('sem contar como foco concluído');
  await appPage.keyboard.press('Escape');
  await expect(end).toBeFocused();
  for (let i = 0; i < 2; i++)
    await electronApp.evaluate(async () => {
      await (globalThis as unknown as { advanceTimer: (n: number) => Promise<void> }).advanceTimer(
        30_000,
      );
    });
  await expect(appPage.locator('.mini-status')).toHaveText('Etapa concluída');
  await fits(appPage);
  await appPage.getByRole('button', { name: 'Iniciar pausa curta', exact: true }).click();
  await expect(appPage.locator('.mini-badge')).toHaveText('Pausa curta');
  await fits(appPage);
  await appPage.getByRole('button', { name: 'Encerrar ciclo', exact: true }).click();
  const cycle = appPage.getByRole('alertdialog', { name: 'Encerrar ciclo', exact: true });
  await cycle.getByRole('button', { name: 'Encerrar ciclo', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Iniciar foco', exact: true })).toBeVisible();
  const production = await appPage.evaluate(() =>
    window.krono!.production!.read({ days: 1, habitId: null }),
  );
  expect(production.metrics.eligibleMs).toBe(60_000);
  expect(production.metrics.sessions).toBe(1);
  await appPage.getByRole('button', { name: 'Manter mini timer no topo' }).click();
  await appPage.getByRole('button', { name: 'Voltar à janela completa' }).click();
  expect(
    await electronApp.evaluate(({ BrowserWindow }) => ({
      windows: BrowserWindow.getAllWindows().length,
      pinned: BrowserWindow.getAllWindows()[0]!.isAlwaysOnTop(),
    })),
  ).toEqual({ windows: 1, pinned: false });
});
for (const deviceScale of [1, 1.25, 1.5, 2])
  test.describe(`mini ${deviceScale}`, () => {
    test.use({ deviceScale });
    test('duas dimensões, temas e diálogos cabem sem sobreposição', async ({ appPage }) => {
      await configure(appPage);
      await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
      await appPage.getByRole('button', { name: 'Mini timer', exact: true }).click();
      await fits(appPage);
      await appPage.getByRole('button', { name: 'Ampliar mini timer', exact: true }).click();
      await fits(appPage);
      await expect(appPage.locator('.mini-timer .finish-estimate')).toBeVisible();
      await mkdir('artifacts/visual/mini-refinement', { recursive: true });
      await appPage.screenshot({
        path: `artifacts/visual/mini-refinement/comfortable-${deviceScale}.png`,
      });
      await appPage.getByRole('button', { name: 'Diminuir mini timer', exact: true }).click();
      await fits(appPage);
      await appPage.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
      const dialog = appPage.getByRole('alertdialog');
      await dialog.getByRole('button', { name: 'Encerrar', exact: true }).scrollIntoViewIfNeeded();
      const box = (await dialog
        .getByRole('button', { name: 'Encerrar', exact: true })
        .boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(
        (await appPage.evaluate(() => innerHeight)) + 1,
      );
      await appPage.keyboard.press('Escape');
      for (const theme of ['terminal', 'aero', 'classic', 'original']) {
        await appPage.evaluate((value) => {
          const prefs = JSON.parse(localStorage.getItem('krono.appearance.v1') ?? '{}');
          localStorage.setItem('krono.appearance.v1', JSON.stringify({ ...prefs, theme: value }));
        }, theme);
        await appPage.reload();
        await expect(appPage.locator('.mini-timer')).toBeVisible();
        await fits(appPage);
      }
      await appPage.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
      await fits(appPage);
      await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
    });
  });
