import { test, expect } from '../fixtures/app';
const nav = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

test('primeira abertura em Perfil, doze avatares, cancelar, salvar e reabrir sem perder identidade', async ({
  electronApp,
}) => {
  const page = await electronApp.firstWindow();
  await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Avatar / })).toHaveCount(12);
  const sizes = await page.locator('.avatar-options img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
    return images.map((image) => ({
      loaded:
        (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 256,
      radius: getComputedStyle(image).borderRadius,
    }));
  });
  expect(sizes.every((size) => size.loaded && size.radius === '50%')).toBe(true);
  await page.getByRole('textbox', { name: 'Como você quer ser chamado?' }).fill('Rascunho');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Como você quer ser chamado?' })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Como você quer ser chamado?' }).fill('Gustavo');
  await page.getByRole('button', { name: 'Avatar Brasa', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gustavo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar perfil', exact: true });
  await dialog.getByRole('textbox').fill('Não salvar');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar perfil', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Gustavo', exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => (await window.krono!.desktop!.read()).preferences.profile),
  ).toEqual({ name: 'Gustavo', avatar: 'brasa', onboarded: true });
  await page.getByRole('button', { name: 'Abrir temporizador' }).click();
  expect(await page.evaluate(async () => (await window.krono!.timer!.read()).state)).toBe('idle');
  await expect(page.getByRole('heading', { name: 'Foco', exact: true })).toBeVisible();
});

test('resumo do Perfil concilia crédito, hábitos e meta; falha não vira zero', async ({
  electronApp,
  appPage,
}) => {
  await nav(appPage, 'Perfil').click();
  await appPage.getByRole('button', { name: 'Agora não' }).click();
  await appPage.evaluate(async () => {
    const habits = window.krono!.habits!,
      snapshot = await habits.read(),
      id = crypto.randomUUID();
    await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      action: 'create',
      habitId: id,
      input: { name: 'Caminhar', kind: 'action', targetMinutes: 25, frequency: { kind: 'daily' } },
    });
    const updated = await habits.read();
    await habits.command({
      commandId: crypto.randomUUID(),
      expectedRevision: updated.revision,
      action: 'check',
      habitId: id,
      expectedDate: updated.today,
    });
    const production = window.krono!.production!,
      goals = await production.goals();
    await production.command({
      commandId: crypto.randomUUID(),
      expectedRevision: goals.revision,
      expectedDate: goals.today,
      habitId: null,
      cadence: 'daily',
      targetMinutes: 1,
      applyCurrent: true,
    });
  });
  await electronApp.evaluate(async () => {
    await (
      globalThis as unknown as { seedProductionSessions: (count: number) => Promise<void> }
    ).seedProductionSessions(3);
  });
  await nav(appPage, 'Foco').click();
  await nav(appPage, 'Perfil').click();
  await expect(appPage.locator('.daily-review-metrics dd')).toHaveText([
    '3 s',
    '3',
    '1 de 1',
    '5%',
  ]);
  await expect(appPage.locator('.profile-overview')).toHaveCount(0);
  await expect(appPage.locator('.profile-week')).toContainText('3 s de foco concluído');
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { stopStorage: () => Promise<number> }).stopStorage();
  });
  await nav(appPage, 'Foco').click();
  await nav(appPage, 'Perfil').click();
  await expect(appPage.locator('.daily-review-content [role=alert]').first()).toContainText(
    'Não foi possível consultar',
  );
  await expect(appPage.locator('.profile-week [role=alert]')).toContainText(
    'Não foi possível consultar',
  );
});

test('contraste do texto cobre fundo editorial e materiais opcionais; alto contraste remove ambiente', async ({
  appPage,
}) => {
  const contrasts = await appPage.evaluate(() => {
    const root = getComputedStyle(document.querySelector('.clean-study')!),
      bg = document.querySelector('.ambient-background');
    const stops = [
      ...(bg ? getComputedStyle(bg).backgroundImage : '').matchAll(/rgba?\(([^)]+)\)/g),
    ]
      .map((match) => match[1].split(',').map(Number))
      .filter((parts) => parts.length >= 3);
    if (bg && stops.filter((stop) => (stop[3] ?? 1) > 0).length !== 2)
      throw new Error('Gradientes não reconhecidos pelo teste de contraste');
    let background = root.backgroundColor
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    for (const stop of stops.reverse()) {
      const alpha = stop[3] ?? 1;
      background = background.map((v, i) => v * (1 - alpha) + stop[i] * alpha);
    }
    const luminance = (color: number[]) =>
      color.reduce((sum, c, i) => {
        c /= 255;
        return (
          sum +
          [0.2126, 0.7152, 0.0722][i] * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        );
      }, 0);
    return ['--clean-text', '--clean-secondary', '--clean-meta'].map((token) => {
      const hex = root.getPropertyValue(token).trim().slice(1),
        color = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return { token, ratio: (luminance(color) + 0.05) / (luminance(background) + 0.05) };
    });
  });
  for (const contrast of contrasts)
    expect(contrast.ratio, contrast.token).toBeGreaterThanOrEqual(4.5);
  await appPage.emulateMedia({ forcedColors: 'active' });
  await expect(appPage.locator('.ambient-background')).toBeHidden();
});

test('Perfil pode ser ignorado e backup validado preserva nome e avatar', async ({
  appPage,
  electronApp,
}) => {
  await nav(appPage, 'Perfil').click();
  await appPage.getByRole('button', { name: 'Agora não' }).click();
  await expect(appPage.getByRole('button', { name: 'Editar perfil', exact: true })).toBeVisible();
  const result = await appPage.evaluate(async () => {
    const desktop = window.krono!.desktop!,
      backup = window.krono!.backup!;
    let state = await desktop.read();
    await desktop.update({
      expectedRevision: state.preferences.revision,
      patch: { profile: { name: 'Ana', avatar: 'mare', onboarded: true } },
    });
    const exported = await backup.export();
    state = await desktop.read();
    await desktop.update({
      expectedRevision: state.preferences.revision,
      patch: { profile: { name: 'Bia', avatar: 'lumi', onboarded: true } },
    });
    const inspected = await backup.inspect();
    return { exported, inspected };
  });
  expect(result.exported.code).toBe('saved');
  expect(result.inspected.code).toBe('inspected');
  const stored = await electronApp.evaluate(() =>
    (globalThis as unknown as { backupProfile: () => unknown }).backupProfile(),
  );
  expect(stored).toEqual({ name: 'Ana', avatar: 'mare', onboarded: true });
});

test('fechamento próprio: Escape, duplicação, bandeja, sair e respostas inválidas', async ({
  electronApp,
  appPage,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await electronApp.evaluate(() => {
    const g = globalThis as unknown as {
      desktopCalls: { customDialogs: boolean };
      desktopClose: () => Promise<void>;
    };
    g.desktopCalls.customDialogs = true;
    void g.desktopClose();
    void g.desktopClose();
  });
  const dialog = appPage.getByRole('dialog', { name: 'Manter o Krono na bandeja?', exact: true });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).not.toContainText('continuará em andamento');
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await appPage.keyboard.press('Shift+Tab');
  await appPage.keyboard.press('Shift+Tab');
  expect(await appPage.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  const request = await appPage.evaluate(() => window.krono!.shellDialog!.read());
  expect(
    await appPage.evaluate(async () =>
      window.krono!.shellDialog!.respond({ id: crypto.randomUUID(), choice: 'hide' }),
    ),
  ).toBe(false);
  expect(
    await appPage.evaluate(
      async (req) => window.krono!.shellDialog!.respond({ id: req!.id, choice: 'quit' }),
      request,
    ),
  ).toBe(false);
  await appPage.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await appPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await electronApp.evaluate(() => {
    void (globalThis as unknown as { desktopClose: () => Promise<void> }).desktopClose();
  });
  await expect(dialog).toContainText('continuará em andamento');
  await dialog.getByRole('button', { name: 'Manter na bandeja', exact: true }).click();
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    )
    .toBe(false);
  expect(
    await appPage.evaluate(
      async () => (await window.krono!.desktop!.read()).preferences.firstHideSeen,
    ),
  ).toBe(true);
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await electronApp.evaluate(() => {
    const g = globalThis as unknown as {
      desktopQuit: () => Promise<void>;
      desktopCalls: { healthy: boolean };
    };
    g.desktopCalls.healthy = false;
    void g.desktopQuit();
  });
  const quit = appPage.getByRole('dialog', { name: 'Sair do Krono?', exact: true });
  await expect(quit).toBeVisible();
  await expect(quit.getByRole('button', { name: 'Continuar na bandeja' })).toHaveCount(0);
  await quit.getByRole('button', { name: 'Pausar e sair' }).click();
  await expect
    .poll(async () => appPage.evaluate(async () => (await window.krono!.timer!.read()).state))
    .toBe('paused');
});

test('seletor desliza, redireciona, teclado funciona e redução cancela movimento', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'full');
  const modes = appPage.getByLabel('Fase', { exact: true });
  const rest = modes.getByRole('button', { name: 'Pausa curta', exact: true }),
    focus = modes.getByRole('button', { name: 'Foco', exact: true });
  const running = await modes.evaluate(async (element) => {
    (element.querySelectorAll('button')[1] as HTMLButtonElement).click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const a = element.querySelector('.phase-selection')!.getAnimations()[0];
    a?.pause();
    if (a) a.currentTime = 80;
    return a?.effect?.getTiming().duration;
  });
  expect(running).toBe(220);
  await focus.click();
  await rest.click();
  await focus.focus();
  await appPage.keyboard.press('Enter');
  await expect(focus).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      modes
        .locator('.phase-selection')
        .evaluate(
          (element) => element.getAnimations().filter((a) => a.playState === 'running').length,
        ),
    )
    .toBe(0);
  const bounds = await modes.evaluate((element) => {
    const button = element.querySelector('[aria-pressed=true]')!.getBoundingClientRect(),
      line = element.querySelector('.phase-selection')!.getBoundingClientRect();
    return { x: Math.abs(button.x - line.x), w: Math.abs(button.width - line.width) };
  });
  expect(bounds.x).toBeLessThan(1);
  expect(bounds.w).toBeLessThan(1);
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await rest.click();
  expect(
    await modes.locator('.phase-selection').evaluate((element) => element.getAnimations().length),
  ).toBe(0);
});

test('fundo ambiente é único, opcional e cancela na redução e invisibilidade', async ({
  electronApp,
  appPage,
}) => {
  // O tema editorial é estático; o ambiente continua disponível nos temas opcionais.
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('button', { name: /^Aero / }).click();
  await appPage.keyboard.press('Escape');
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await expect
    .poll(() =>
      appPage.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.id === 'ambient-drift' && a.playState === 'running').length,
      ),
    )
    .toBe(1);
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      appPage.evaluate(
        () => document.getAnimations().filter((a) => a.id === 'ambient-drift').length,
      ),
    )
    .toBe(0);
  await appPage.emulateMedia({ reducedMotion: 'no-preference' });
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await expect
    .poll(() =>
      appPage.evaluate(
        () => document.getAnimations().filter((a) => a.id === 'ambient-drift').length,
      ),
    )
    .toBe(0);
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('switch', { name: 'Fundo ambiente', exact: true }).uncheck();
  await expect(appPage.locator('.ambient-background')).toHaveCount(0);
  await appPage.reload();
  await expect(appPage.locator('.ambient-background')).toHaveCount(0);
});

for (const scale of [1, 1.25, 1.5, 2]) {
  test.describe(`Perfil em escala emulada ${scale}`, () => {
    test.use({ deviceScale: scale });
    test('cabeçalho centralizado, resumo legível e editor cabe após resize', async ({
      electronApp,
      appPage,
    }) => {
      await nav(appPage, 'Perfil').click();
      await appPage.getByRole('button', { name: 'Agora não' }).click();
      for (const width of [1280, 800]) {
        await electronApp.evaluate(
          ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setContentSize(w, 800),
          width,
        );
        // Conversão DIP/pixel da janela nativa pode arredondar alguns pixels na escala emulada.
        await expect
          .poll(() => appPage.evaluate((target) => Math.abs(innerWidth - target), width))
          .toBeLessThanOrEqual(3);
        const actualWidth = await appPage.evaluate(() => innerWidth);
        // O resize nativo pode atualizar innerWidth antes do frame/ResizeObserver do indicador.
        // Verifica o estado final sem relaxar o limite de um pixel.
        await expect
          .poll(() =>
            appPage.getByRole('navigation').evaluate((element) => {
              const line = element.querySelector('.clean-selection')!.getBoundingClientRect(),
                button = element.querySelector('[aria-current]')!.getBoundingClientRect();
              return Math.max(
                Math.abs(line.left - button.left),
                Math.abs(line.right - button.right),
              );
            }),
          )
          .toBeLessThan(1);
        const geometry = await appPage.getByRole('navigation').evaluate((element) => {
          const rect = element.getBoundingClientRect(),
            line = element.querySelector('.clean-selection')!.getBoundingClientRect(),
            button = element.querySelector('[aria-current]')!.getBoundingClientRect();
          return {
            center: Math.abs(
              rect.x +
                rect.width / 2 -
                (element.closest('.clean-header')!.getBoundingClientRect().left +
                  element.closest('.clean-header')!.getBoundingClientRect().width / 2),
            ),
            edges: Math.max(Math.abs(line.x - button.x), Math.abs(line.right - button.right)),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(geometry.center).toBeLessThan(1);
        expect(geometry.edges).toBeLessThan(1);
        expect(geometry.overflow).toBe(false);
        await appPage.getByRole('button', { name: 'Editar perfil', exact: true }).click();
        const dialog = appPage.getByRole('dialog', { name: 'Editar perfil', exact: true });
        await expect(dialog).toBeVisible();
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(actualWidth);
        await appPage.keyboard.press('Escape');
      }
    });
  });
}
