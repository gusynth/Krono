import { test, expect } from '../fixtures/app';
import { mkdir } from 'node:fs/promises';
const gardenReady = new WeakSet<import('@playwright/test').Page>();
const openGarden = async (p: import('@playwright/test').Page) => {
  if (!gardenReady.has(p)) {
    await p.evaluate(async () => {
      const api = window.krono!.desktop!,
        current = await api.read();
      if (
        !current.preferences.profile?.onboarded ||
        !(current.preferences.garden?.enabled ?? current.preferences.garden?.introductionSeen)
      )
        await api.update({
          expectedRevision: current.preferences.revision,
          patch: {
            profile: { name: '', avatar: null, ...current.preferences.profile, onboarded: true },
            garden: {
              version: 1,
              introductionSeen: current.preferences.garden?.introductionSeen ?? false,
              enabled: true,
            },
          },
        });
    });
    gardenReady.add(p);
  }
  await p
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Perfil', exact: true })
    .click();
  await p.getByRole('button', { name: 'Abrir jardim', exact: true }).click();
};
test('beta explica a progressão, lembra a introdução e preserva tempo real', async ({
  appPage,
  electronApp,
}) => {
  await mkdir('artifacts/visual/garden-beta', { recursive: true });
  await openGarden(appPage);
  const dialog = appPage.getByRole('dialog', { name: 'Jardim de foco', exact: true });
  await expect(dialog).toContainText('Em construção');
  await expect(dialog).toContainText('Cada minuto de foco concluído vale 1 XP');
  await expect(dialog.locator('.garden-chapter-guide li')).toHaveCount(4);
  await dialog.getByRole('button', { name: 'Entrar no jardim', exact: true }).click();
  await expect(dialog.locator('canvas')).toBeVisible();
  await expect(dialog.locator('.garden-heading')).toContainText('0 XP');
  await dialog
    .getByRole('button', { name: 'Biblioteca', exact: false })
    .isDisabled()
    .then((value) => expect(value).toBe(true));
  await expect(dialog.locator('.garden-work-state')).toContainText('descanso');
  await appPage.screenshot({ path: 'artifacts/visual/garden-beta/start.png' });
  await dialog.getByRole('button', { name: 'Fechar jardim', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Abrir jardim', exact: true })).toBeFocused();
  await appPage
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Foco', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  const id = (await appPage.evaluate(() => window.krono!.timer!.read())).sessionId;
  expect(id).not.toBeNull();
  await openGarden(appPage);
  await expect(dialog.locator('canvas')).toBeVisible();
  await expect(dialog.locator('.garden-work-state')).toContainText('em andamento');
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
      60_000,
    );
  });
  await expect(dialog.locator('.garden-heading')).toContainText('0 XP');
  expect((await appPage.evaluate(() => window.krono!.timer!.read())).sessionId).toBe(id);
  await dialog.getByRole('button', { name: 'Como funciona', exact: true }).click();
  await expect(dialog.locator('.garden-chapter-guide')).toBeVisible();
  await dialog.getByRole('button', { name: 'Entrar no jardim', exact: true }).click();
  await appPage.keyboard.press('Escape');
  await appPage
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Foco', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Pausar', exact: true }).click();
  await openGarden(appPage);
  await expect(dialog.locator('.garden-work-state')).toContainText('descanso');
  await appPage.keyboard.press('Escape');
  await appPage.reload();
  await openGarden(appPage);
  await expect(dialog.locator('canvas')).toBeVisible();
  await expect(dialog.locator('.garden-chapter-guide')).toHaveCount(0);
});
test('capítulos usam crédito persistido, visitas não duplicam XP e falha não vira zero', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(async () => {
    await (
      globalThis as unknown as { seedGardenMinutes: (n: number) => Promise<void> }
    ).seedGardenMinutes(1800);
  });
  expect(await appPage.evaluate(() => window.krono!.production!.garden())).toEqual({
    version: 1,
    eligibleMs: 108_000_000,
    sessions: 8,
  });
  await openGarden(appPage);
  await appPage.getByRole('button', { name: 'Entrar no jardim', exact: true }).click();
  const dialog = appPage.getByRole('dialog', { name: 'Jardim de foco', exact: true });
  await expect(dialog.locator('.garden-heading')).toContainText('Observatório');
  const shots = new Set<string>();
  for (const name of ['Jardim', 'Pátio', 'Biblioteca', 'Observatório']) {
    await dialog.getByRole('button', { name, exact: true }).click();
    await expect(dialog.getByRole('heading', { name, exact: true })).toBeVisible();
    shots.add(
      await dialog.locator('canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
    );
    await appPage.screenshot({ path: `artifacts/visual/garden-beta/chapter-${shots.size}.png` });
  }
  expect(shots.size).toBe(4);
  expect((await appPage.evaluate(() => window.krono!.production!.garden())).eligibleMs).toBe(
    108_000_000,
  );
  await appPage.keyboard.press('Escape');
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { stopStorage: () => Promise<number> }).stopStorage();
  });
  await openGarden(appPage);
  await expect(dialog.getByRole('alert')).toContainText('histórico continua preservado');
  await expect(dialog.locator('canvas')).toHaveCount(0);
});
test('movimento para ao ocultar, pausar, reduzir e fechar; janela pequena mantém ações', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(800, 700);
    w.showInactive();
  });
  await openGarden(appPage);
  await appPage.getByRole('button', { name: 'Entrar no jardim', exact: true }).click();
  const canvas = appPage.locator('.garden-canvas');
  await expect(canvas).toBeVisible();
  const image = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  let before = await image();
  await expect.poll(image).not.toBe(before);
  await appPage.getByRole('button', { name: 'Pausar animação', exact: true }).click();
  before = await image();
  await appPage.waitForTimeout(400);
  expect(await image()).toBe(before);
  await appPage.getByRole('button', { name: 'Retomar animação', exact: true }).click();
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
  await appPage.waitForTimeout(250);
  before = await image();
  await appPage.waitForTimeout(400);
  expect(await image()).toBe(before);
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.showInactive(),
  );
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    appPage.getByRole('button', { name: 'Movimento reduzido', exact: true }),
  ).toBeDisabled();
  await appPage.waitForTimeout(200);
  before = await image();
  await appPage.waitForTimeout(400);
  expect(await image()).toBe(before);
  const dialog = appPage.getByRole('dialog', { name: 'Jardim de foco', exact: true });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await dialog
    .getByRole('button', { name: 'Voltar ao Krono', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole('button', { name: 'Voltar ao Krono', exact: true }),
  ).toBeInViewport();
  await appPage.screenshot({ path: 'artifacts/visual/garden-beta/small.png' });
  await appPage.keyboard.press('Escape');
  await expect(canvas).toHaveCount(0);
});
