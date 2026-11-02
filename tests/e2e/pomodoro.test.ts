import { test, expect } from '../fixtures/app';
import { choose } from '../fixtures/choice';

test.beforeEach(async ({ appPage, electronApp }) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].showInactive(),
  );
  await appPage.evaluate(() => document.fonts.ready);
  // Geometria estática: entrada de página é coberta pelos testes de motion.
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
});

test('estado e ciclo equilibram o progresso; marcadores acompanham configuração sem overflow', async ({
  appPage,
  electronApp,
}) => {
  for (const width of [700, 1280]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 900),
      width,
    );
    for (const zoom of [1, 1.25, 1.5, 2]) {
      await electronApp.evaluate(
        ({ BrowserWindow }, factor) =>
          BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor),
        zoom,
      );
      await appPage.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const spacing = await appPage.evaluate(() => {
        const state = document.querySelector('.time-state')!.getBoundingClientRect();
        const bar = document.querySelector('.clean-progress')!.getBoundingClientRect();
        const cycle = document.querySelector('.clean-cycle')!.getBoundingClientRect();
        const label = document.querySelector('.cycle-label')!;
        // Medir a baseline efetiva do layout; métricas de fonte arredondadas
        // pelo canvas podem divergir meio pixel ao mudar o zoom.
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        label.prepend(probe);
        const baseline = probe.getBoundingClientRect().bottom;
        probe.remove();
        const markers = Array.from(document.querySelectorAll('.cycle-steps i')).map((element) =>
          element.getBoundingClientRect(),
        );
        // A referência vigente é a base das letras, após rejeição visual
        // da centralização e das duas compensações anteriores.
        return {
          above: bar.top - state.bottom,
          below: cycle.top - bar.bottom,
          baselineError: Math.max(...markers.map((marker) => Math.abs(marker.bottom - baseline))),
          widths: markers.map((marker) => marker.width),
        };
      });
      expect(Math.abs(spacing.above - spacing.below)).toBeLessThan(1);
      expect(spacing.above).toBeGreaterThanOrEqual(12);
      expect(spacing.above).toBeLessThanOrEqual(20);
      expect(spacing.baselineError).toBeLessThan(0.4);
      expect(new Set(spacing.widths).size).toBe(1);
    }
  }
  const actualWidth = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(700, 900);
    window.webContents.setZoomFactor(2);
    return window.getContentSize()[0] / 2;
  });
  await expect.poll(() => appPage.evaluate(() => innerWidth)).toBe(actualWidth);
  await appPage.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  for (const length of [1, 4, 12]) {
    await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
    const form = appPage.getByRole('form', { name: 'Configurar Pomodoro' });
    const panel = await appPage
      .getByRole('region', { name: 'Configuração do preset', exact: true })
      .boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(actualWidth);
    await form
      .getByRole('spinbutton', { name: 'Focos antes da pausa longa', exact: true })
      .fill(String(length));
    const save = form.getByRole('button', { name: 'Salvar configuração' });
    if (length === 4) {
      await save.focus();
      await appPage.keyboard.press('Enter');
    } else await save.click();
    await expect(appPage.locator('.cycle-label')).toHaveText(`Foco 1 de ${length}`);
    await expect(appPage.locator('.cycle-steps i')).toHaveCount(length);
    await expect(appPage.locator('.cycle-steps i[data-active=true]')).toHaveCount(1);
    expect(await appPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await expect(appPage.locator('.cycle-label')).toHaveText('Foco 1 de 12');
  await appPage.emulateMedia({ forcedColors: 'active' });
  const colors = await appPage.locator('.cycle-steps i[data-active=true]').evaluate((element) => ({
    color: getComputedStyle(element).backgroundColor,
    outline: getComputedStyle(element).outlineStyle,
  }));
  expect(colors.outline).toBe('solid');
  expect(colors.color).not.toBe('rgba(0, 0, 0, 0)');
});

test('contexto próximo da ação sem saltar ao iniciar, pausar e retomar', async ({
  appPage,
  electronApp,
}) => {
  for (const width of [700, 1280]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 900),
      width,
    );
    for (const zoom of [1, 2]) {
      await electronApp.evaluate(
        ({ BrowserWindow }, factor) =>
          BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor),
        zoom,
      );
      await appPage.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const geometry = await appPage.evaluate(() => {
        const action = document.querySelector('.clean-primary')!.getBoundingClientRect();
        const context = document
          .querySelector('.focus-details .clean-context')!
          .getBoundingClientRect();
        return { gap: context.top - action.bottom, top: context.top };
      });
      expect(geometry.gap).toBeGreaterThanOrEqual(44);
      expect(geometry.gap).toBeLessThanOrEqual(60);
    }
  }
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
  );
  await expect.poll(() => appPage.evaluate(() => innerWidth)).toBe(1280);
  await appPage.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const context = appPage.locator('.focus-details .clean-context');
  const initialTop = (await context.boundingBox())!.y;
  await appPage.screenshot({ path: 'artifacts/spacing/focus-idle.png' });
  for (const action of ['Iniciar foco', 'Pausar', 'Retomar']) {
    await appPage.getByRole('button', { name: action, exact: true }).click();
    await expect(
      appPage.getByRole('button', {
        name: action === 'Pausar' ? 'Retomar' : 'Pausar',
        exact: true,
      }),
    ).toBeVisible();
    expect(Math.abs((await context.boundingBox())!.y - initialTop)).toBeLessThan(1);
    await expect(
      appPage.getByRole('button', { name: 'Encerrar sessão', exact: true }),
    ).toBeVisible();
  }
  await appPage.screenshot({ path: 'artifacts/spacing/focus-running.png' });
});

test('Pomodoro proporcional salva, reabre e mostra pausas exatas antes de confirmar', async ({
  appPage,
  electronApp,
}) => {
  const trigger = appPage.getByRole('button', { name: 'Configuração do preset', exact: true });
  await trigger.focus();
  await appPage.keyboard.press('Enter');
  const form = appPage.getByRole('form', { name: 'Configurar Pomodoro' });
  await form
    .getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true })
    .fill('30');
  await expect(form.locator('.pause-preview')).toHaveText('Pausa curta6 minPausa longa18 min');
  await form.getByRole('button', { name: 'Salvar configuração' }).click();
  await expect(trigger).toBeFocused();
  await expect(appPage.locator('.clean-digits')).toHaveText('30:00');
  const reopened = await electronApp.evaluate(async () =>
    (
      globalThis as unknown as {
        restartTimer: () => Promise<{ configuration: { focusMinutes: number } }>;
      }
    ).restartTimer(),
  );
  expect(reopened.configuration.focusMinutes).toBe(30);
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.locator('.clean-digits')).toHaveText('30:00');
  await trigger.click();
  await form
    .getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true })
    .fill('31');
  await expect(form.locator('.pause-preview')).toHaveText(
    'Pausa curta6 min 12 sPausa longa18 min 36 s',
  );
  await appPage.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(
    await appPage.evaluate(
      async () => (await window.krono!.timer!.read()).configuration?.focusMinutes,
    ),
  ).toBe(30);
  await trigger.click();
  await form.getByRole('switch', { name: /Pausas proporcionais/ }).uncheck();
  await form.getByLabel('Pausa curta (min)', { exact: true }).fill('');
  await expect(form.getByRole('button', { name: 'Salvar configuração' })).toBeDisabled();
  await form.getByRole('switch', { name: /Pausas proporcionais/ }).check();
  await expect(form.getByRole('button', { name: 'Salvar configuração' })).toBeEnabled();
  await appPage.keyboard.press('Escape');
});

test('edição manual durante foco não reatribui tempo e vale para o próximo foco', async ({
  appPage,
  electronApp,
}) => {
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await electronApp.evaluate(async () =>
    (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(1000),
  );
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Configurar Pomodoro' });
  await form
    .getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true })
    .fill('30');
  await form.getByRole('switch', { name: /Pausas proporcionais/ }).uncheck();
  await form.getByLabel('Pausa curta (min)', { exact: true }).fill('9');
  await form.getByLabel('Pausa longa (min)', { exact: true }).fill('22');
  await form.getByRole('spinbutton', { name: 'Focos antes da pausa longa', exact: true }).fill('3');
  await form.getByRole('button', { name: 'Salvar configuração' }).click();
  expect(await appPage.evaluate(async () => (await window.krono!.timer!.read()).remainingMs)).toBe(
    1_499_000,
  );
  await expect(appPage.getByRole('button', { name: 'Encerrar sessão', exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await appPage.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await expect(appPage.locator('.clean-digits')).toHaveText('30:00');
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  expect(
    await appPage.evaluate(async () => (await window.krono!.timer!.read()).activePreset),
  ).toEqual({ focusMs: 1_800_000, shortBreakMs: 540_000, longBreakMs: 1_320_000, longEvery: 3 });
  expect(
    await appPage.evaluate(
      async () =>
        (await window.krono!.production!.read({ days: 1, habitId: null })).metrics.eligibleMs,
    ),
  ).toBe(0);
});

test('menu compacto tem teclado, busca e seleção persistente; não deixa menu aberto ao trocar tela', async ({
  appPage,
}) => {
  await appPage.evaluate(async () => {
    const api = window.krono!.habits!;
    for (let index = 0; index < 10; index++) {
      const state = await api.read();
      await api.command({
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        action: 'create',
        habitId: crypto.randomUUID(),
        input: {
          name: `Estudo ${index}`,
          kind: 'time',
          frequency: { kind: 'daily' },
          targetMinutes: 25,
        },
      });
    }
  });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  const combo = appPage.getByRole('combobox', { name: 'Hábito para o próximo Foco' });
  expect((await combo.boundingBox())!.width).toBeLessThanOrEqual(220);
  await combo.focus();
  await appPage.keyboard.press('ArrowDown');
  const search = appPage.getByRole('textbox', { name: 'Buscar: Hábito para o próximo Foco' });
  await expect(search).toBeFocused();
  await search.fill('Estudo 7');
  await expect(appPage.getByRole('option')).toHaveCount(1);
  await appPage.keyboard.press('ArrowDown');
  await expect(appPage.getByRole('option', { name: 'Estudo 7' })).toBeFocused();
  await appPage.keyboard.press('Enter');
  await expect(combo).toBeFocused();
  await expect(combo).toHaveText('Estudo 7');
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(combo).toHaveText('Estudo 7');
  await combo.click();
  await appPage.keyboard.press('Escape');
  await expect(combo).toBeFocused();
  await expect(combo.locator('..').locator('.choice-popover')).toHaveCSS('pointer-events', 'none');
  await combo.click();
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Produção', exact: true })
    .click();
  await expect(appPage.locator('.choice-popover:popover-open')).toHaveCount(0);
  await choose(appPage.getByRole('combobox', { name: 'Período de Produção' }), '7');
  await expect(appPage.locator('.production-heatmap button')).toHaveCount(7);
});

test('contador e ação principal compartilham centro real em resize, zoom e redução; fonte é local', async ({
  appPage,
  electronApp,
}) => {
  expect(
    await appPage.evaluate(() =>
      Array.from(document.fonts).some(
        (font) => font.family === 'Inter' && font.status === 'loaded',
      ),
    ),
  ).toBe(true);
  for (const width of [700, 980, 1280, 1920]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 900),
      width,
    );
    for (const zoom of [1, 1.25, 1.5, 2]) {
      await electronApp.evaluate(
        ({ BrowserWindow }, factor) =>
          BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor),
        zoom,
      );
      await appPage.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await expect
        .poll(() => appPage.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        .toBe(false);
      const measured = await appPage.evaluate(() => {
        const content = document.querySelector('.shell-content')!.getBoundingClientRect();
        const center = content.x + content.width / 2;
        const digits = document.querySelector('.clean-digits')!.getBoundingClientRect(),
          action = document.querySelector('.clean-primary')!.getBoundingClientRect();
        return {
          timer: digits.x + digits.width / 2 - center,
          action: action.x + action.width / 2 - center,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(Math.abs(measured.timer)).toBeLessThan(1);
      expect(Math.abs(measured.action)).toBeLessThan(1);
      expect(measured.overflow).toBe(false);
    }
  }
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
  );
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  const panel = appPage.getByRole('region', { name: 'Configuração do preset', exact: true });
  expect(
    await panel.evaluate(
      (element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0);
  await appPage.keyboard.press('Escape');
});

test('duração máxima e nome longo preservam limite compacto, centro e legibilidade a 200%', async ({
  appPage,
  electronApp,
}) => {
  await appPage.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Configurar Pomodoro' });
  await form
    .getByRole('spinbutton', { name: 'Duração do foco em minutos', exact: true })
    .fill('240');
  await expect(form.locator('.pause-preview')).toHaveText('Pausa curta48 minPausa longa144 min');
  await form.getByRole('button', { name: 'Salvar configuração' }).click();
  await expect(appPage.locator('.clean-digits')).toHaveText('240:00');
  const id = await appPage.evaluate(async () => {
    const api = window.krono!.habits!,
      state = await api.read(),
      id = crypto.randomUUID();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      action: 'create',
      habitId: id,
      input: {
        name: 'Leitura técnica '.repeat(5).trim(),
        kind: 'time',
        frequency: { kind: 'daily' },
        targetMinutes: 25,
      },
    });
    return id;
  });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await choose(appPage.getByRole('combobox', { name: 'Hábito para o próximo Foco' }), id);
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(800, 900);
    window.webContents.setZoomFactor(2);
  });
  const geometry = await appPage.evaluate(() => {
    const timer = document.querySelector('.clean-digits')!.getBoundingClientRect(),
      habit = document.querySelector('.habit-context')!.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      center:
        timer.x +
        timer.width / 2 -
        (document.querySelector('.shell-content')!.getBoundingClientRect().x +
          document.querySelector('.shell-content')!.getBoundingClientRect().width / 2),
      right: timer.right,
      available: document.documentElement.clientWidth,
      habitWidth: habit.width,
    };
  });
  expect(geometry.overflow).toBe(false);
  expect(Math.abs(geometry.center)).toBeLessThan(1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.available);
  expect(geometry.habitWidth).toBeLessThanOrEqual(220);
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  const combo = appPage.getByRole('combobox', { name: 'Hábito para o próximo Foco' });
  await combo.focus();
  await appPage.keyboard.press('ArrowDown');
  await expect(appPage.getByRole('option', { selected: true })).toBeFocused();
  await appPage.keyboard.press('Escape');
  await expect(combo).toBeFocused();
});
