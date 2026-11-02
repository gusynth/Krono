import { test, expect } from '../fixtures/app';
import { choose } from '../fixtures/choice';

test.beforeEach(async ({ appPage, electronApp }) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].showInactive(),
  );
  await appPage.evaluate(() => document.fonts.ready);
});
const destination = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true }).click();

test('calendário de Produção permite teclado e data digitada, impede futuro e fecha ao navegar', async ({
  appPage,
}) => {
  await destination(appPage, 'Produção');
  const field = appPage.getByRole('textbox', { name: 'Data final de Produção', exact: true }),
    trigger = appPage.getByRole('button', {
      name: 'Abrir calendário: Data final de Produção',
      exact: true,
    });
  await expect(field).toHaveValue('01/01/2026');
  await expect(field).toHaveAttribute('type', 'text');
  await trigger.focus();
  await appPage.keyboard.press('Enter');
  const dialog = appPage.getByRole('dialog', { name: 'Calendário: Data final de Produção' });
  await expect(
    dialog.getByRole('gridcell', { name: '1 de janeiro de 2026', exact: true }),
  ).toBeFocused();
  await expect(dialog.getByRole('gridcell')).toHaveCount(42);
  await expect(
    dialog.getByRole('gridcell', { name: '2 de janeiro de 2026', exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Próximo mês' })).toBeDisabled();
  await appPage.keyboard.press('ArrowLeft');
  await appPage.keyboard.press('Enter');
  await expect(field).toHaveValue('31/12/2025');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(
    dialog.getByRole('gridcell', { name: '31 de dezembro de 2025', exact: true }),
  ).toBeFocused();
  await appPage.keyboard.press('PageDown');
  await expect(
    dialog.getByRole('gridcell', { name: '1 de janeiro de 2026', exact: true }),
  ).toBeFocused();
  await appPage.keyboard.press('Escape');
  await expect(field).toHaveValue('31/12/2025');
  await field.fill('31/02/2026');
  await field.blur();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(appPage.locator('.production-route').getByRole('alert')).toContainText(
    'data válida',
  );
  await field.fill('02/01/2026');
  await field.blur();
  await expect(appPage.locator('.production-route').getByRole('alert')).toContainText('até hoje');
  await field.fill('01/01/2026');
  await trigger.click();
  await appPage.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await destination(appPage, 'Hábitos');
  await expect(appPage.locator('.date-popover:popover-open')).toHaveCount(0);
});

test('hábito escolhe ícone e data âncora com popups; persistência, cancelamento e cabeçalho compacto', async ({
  appPage,
}) => {
  await destination(appPage, 'Hábitos');
  const header = appPage.locator('.habits-title-block');
  const spacing = await header.evaluate(
    (element) =>
      element.querySelector('p')!.getBoundingClientRect().top -
      element.querySelector('h2')!.getBoundingClientRect().bottom,
  );
  expect(spacing).toBeGreaterThanOrEqual(6);
  expect(spacing).toBeLessThanOrEqual(10);
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Criar hábito' });
  await form.getByLabel('Nome', { exact: true }).fill('Treino');
  const picker = form.getByRole('button', { name: 'Escolher ícone do hábito' });
  await picker.click();
  const icons = appPage.getByRole('dialog', { name: 'Ícone do hábito', exact: true });
  await expect(icons.getByRole('button', { name: 'Leitura', exact: true })).toBeFocused();
  await appPage.keyboard.press('ArrowRight');
  await appPage.keyboard.press('ArrowRight');
  await expect(icons.getByRole('button', { name: 'Treino', exact: true })).toBeFocused();
  await appPage.keyboard.press('Enter');
  await expect(picker).toBeFocused();
  await expect(picker).toHaveText('Treino');
  await choose(form.getByRole('combobox', { name: 'Frequência', exact: true }), 'alternate');
  await form
    .getByRole('button', { name: 'Abrir calendário: Data âncora (dia ativo)', exact: true })
    .click();
  const calendar = appPage.getByRole('dialog', { name: 'Calendário: Data âncora (dia ativo)' });
  await expect(
    calendar.getByRole('gridcell', { name: '2 de janeiro de 2026', exact: true }),
  ).toBeEnabled();
  await calendar.getByRole('gridcell', { name: '2 de janeiro de 2026', exact: true }).click();
  await expect(form.getByLabel('Data âncora (dia ativo)', { exact: true })).toHaveValue(
    '02/01/2026',
  );
  await form.getByRole('button', { name: 'Salvar hábito', exact: true }).click();
  const saved = await appPage.evaluate(async () => (await window.krono!.habits!.read()).habits[0]);
  expect(saved.icon).toBe('dumbbell');
  expect(saved.frequency).toEqual({ kind: 'alternate', anchor: '2026-01-02' });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await destination(appPage, 'Hábitos');
  const habit = appPage.getByRole('article', { name: 'Treino', exact: true });
  await expect(habit.locator('.habit-glyph .lucide-dumbbell')).toHaveCount(1);
  await habit.getByRole('button', { name: 'Editar', exact: true }).click();
  const edit = appPage.getByRole('form', { name: 'Editar hábito' });
  await edit.getByRole('button', { name: 'Escolher ícone do hábito' }).click();
  await icons.getByRole('button', { name: 'Estudo', exact: true }).click();
  await edit.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(
    await appPage.evaluate(async () => (await window.krono!.habits!.read()).habits[0].icon),
  ).toBe('dumbbell');
});

test('popups ficam na janela em zoom, com redução/alto contraste e sem interceptação fechados', async ({
  appPage,
  electronApp,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await destination(appPage, 'Produção');
  for (const zoom of [1, 1.25, 1.5, 2]) {
    const width = await electronApp.evaluate(({ BrowserWindow }, factor) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setContentSize(800, 1000);
      window.webContents.setZoomFactor(factor);
      return window.getContentSize()[0] / factor;
    }, zoom);
    await expect
      .poll(() => appPage.evaluate((expected) => Math.abs(innerWidth - expected), width))
      .toBeLessThan(1);
    const trigger = appPage.getByRole('button', {
      name: 'Abrir calendário: Data final de Produção',
    });
    await trigger.click();
    const calendar = appPage.getByRole('dialog', { name: 'Calendário: Data final de Produção' });
    const rect = (await calendar.boundingBox())!,
      size = await appPage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
    expect(
      await calendar.evaluate(
        (element) =>
          element.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
    ).toBe(0);
    await calendar.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(appPage.locator('.date-popover')).toHaveCSS('pointer-events', 'none');
  }
  await appPage.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await destination(appPage, 'Hábitos');
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  await appPage.getByRole('button', { name: 'Escolher ícone do hábito' }).click();
  const icons = appPage.getByRole('dialog', { name: 'Ícone do hábito', exact: true });
  const rect = (await icons.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(await appPage.evaluate(() => innerWidth));
  await expect(icons.getByRole('button', { name: 'Leitura', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await appPage.keyboard.press('Escape');
  await expect(appPage.getByRole('button', { name: 'Escolher ícone do hábito' })).toBeFocused();
});

test('barra integrada reserva controles Windows; minimizar/restaurar/maximizar mantém sessão', async ({
  appPage,
  electronApp,
}) => {
  await expect(appPage.getByTestId('window-titlebar')).toBeVisible();
  const caption = await appPage.getByTestId('window-titlebar').evaluate((element) => ({
    region: getComputedStyle(element).getPropertyValue('app-region'),
    width: element.getBoundingClientRect().width,
    available: innerWidth,
  }));
  expect(caption.region).toBe('drag');
  expect(caption.width).toBeLessThan(caption.available - 90);
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  const initial = await appPage.evaluate(async () => window.krono!.timer!.read());
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()),
    )
    .toBe(true);
  await electronApp.evaluate(async ({ BrowserWindow }) => {
    await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
      1000,
    );
    const window = BrowserWindow.getAllWindows()[0];
    window.restore();
    window.showInactive();
    window.maximize();
  });
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()),
    )
    .toBe(true);
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()),
    )
    .toBe(false);
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(true),
  );
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
    )
    .toBe(true);
  await expect(appPage.getByTestId('window-titlebar')).toBeHidden();
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(false),
  );
  await expect(appPage.getByTestId('window-titlebar')).toBeVisible();
  const restored = await appPage.evaluate(async () => window.krono!.timer!.read());
  expect(restored.sessionId).toBe(initial.sessionId);
  expect(restored.state).toBe('running');
  expect(restored.remainingMs).toBe(initial.remainingMs! - 1000);
  expect(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1);
});

test('calendário âncora navega por mês/ano e cancelamento preserva data; ocultar fecha popup', async ({
  appPage,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await destination(appPage, 'Hábitos');
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Criar hábito' });
  await choose(form.getByRole('combobox', { name: 'Frequência', exact: true }), 'alternate');
  const field = form.getByRole('textbox', { name: 'Data âncora (dia ativo)', exact: true }),
    trigger = form.getByRole('button', { name: 'Abrir calendário: Data âncora (dia ativo)' });
  await field.fill('29/02/2028');
  await trigger.click();
  const popup = appPage.getByRole('dialog', { name: 'Calendário: Data âncora (dia ativo)' });
  await expect(
    popup.getByRole('gridcell', { name: '29 de fevereiro de 2028', exact: true }),
  ).toBeFocused();
  await appPage.keyboard.press('PageDown');
  await expect(
    popup.getByRole('gridcell', { name: '29 de março de 2028', exact: true }),
  ).toBeFocused();
  await appPage.keyboard.press('Home');
  await expect(
    popup.getByRole('gridcell', { name: '27 de março de 2028', exact: true }),
  ).toBeFocused();
  await appPage.keyboard.press('Shift+PageUp');
  await expect(
    popup.getByRole('gridcell', { name: '27 de março de 2027', exact: true }),
  ).toBeFocused();
  await appPage.keyboard.press('Escape');
  await expect(field).toHaveValue('29/02/2028');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await popup.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(popup.getByRole('heading')).toHaveText('janeiro de 2028');
  await popup.getByRole('button', { name: 'Próximo mês' }).click();
  await expect(popup.getByRole('heading')).toHaveText('fevereiro de 2028');
  // Evento web isolado, sem afirmar minimização do aplicativo instalado.
  await appPage.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(appPage.locator('.date-popover:popover-open')).toHaveCount(0);
});

test('calendário tem transição finita e cliques rápidos não acumulam menus ou camadas', async ({
  appPage,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'full');
  await destination(appPage, 'Produção');
  await expect(
    appPage.getByRole('button', { name: 'Abrir calendário: Data final de Produção' }),
  ).toBeEnabled();
  const popup = appPage.locator('.date-popover');
  const motion = await popup.evaluate(async (element) => {
    (element as HTMLElement).showPopover();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return element.getAnimations().map((animation) => animation.effect!.getTiming());
  });
  expect(motion.length).toBeGreaterThan(0);
  for (const timing of motion) {
    expect(timing.iterations).toBe(1);
    expect(Number(timing.duration)).toBeLessThanOrEqual(320);
  }
  await expect
    .poll(() =>
      popup.evaluate(
        (element) =>
          element.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  await popup.evaluate((element) => (element as HTMLElement).hidePopover());
  await expect(popup).toHaveCSS('pointer-events', 'none');
  await popup.evaluate((element) => {
    const popup = element as HTMLElement;
    for (let index = 0; index < 20; index++) {
      popup.showPopover();
      void popup.offsetHeight;
      popup.hidePopover();
    }
  });
  await expect
    .poll(() =>
      popup.evaluate(
        (element) =>
          element.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  await expect(appPage.locator('.date-popover')).toHaveCount(1);
  await expect(popup.getByRole('gridcell')).toHaveCount(0);
  await expect(popup).toHaveCSS('pointer-events', 'none');
});
