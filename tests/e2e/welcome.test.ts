import { test, expect } from '../fixtures/app';
test.describe('Apresentação de primeiro acesso', () => {
  test.use({ welcome: true });
  test('cinco etapas, perfil reutilizado, conclusão persistente e reabertura por Ajustes', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow();
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.showInactive(),
    );
    const dialog = page.getByRole('dialog', { name: 'Conheça o Krono', exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Bem-vindo ao Krono', exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
    await expect(dialog.getByRole('img', { name: /Tela de Foco/ })).toBeVisible();
    await expect(dialog.locator('.introduction-screen')).toHaveCount(2);
    expect(
      await dialog
        .locator('.introduction-screen img')
        .evaluateAll((images) =>
          images.every((image) => getComputedStyle(image).objectFit === 'contain'),
        ),
    ).toBe(true);
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(dialog.getByRole('img', { name: /Tela de Hábitos/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(
      dialog.getByRole('combobox', { name: 'Atalho global', exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Como você quer ser chamado?' }).fill('Alex');
    await dialog.getByRole('button', { name: 'Avatar Brasa', exact: true }).click();
    await dialog.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await dialog.getByRole('radio', { name: /Quero experimentar/ }).check();
    await dialog.getByRole('button', { name: 'Começar a usar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Sobre', exact: true }).click();
    await page.getByRole('button', { name: 'Rever apresentação', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(
        async () => (await window.krono!.desktop!.read()).preferences.introduction?.completed,
      ),
    ).toBe(true);
  });
  test('primeiro acesso exige conclusão e escolha explícita, sem fechar ou pular', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow(),
      dialog = page.getByRole('dialog', { name: 'Conheça o Krono', exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /Fechar apresentação|Pular apresentação/ }),
    ).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.reload();
    await expect(
      dialog.getByRole('heading', { name: 'Um tempo para cada etapa', exact: true }),
    ).toBeVisible();
    for (let i = 0; i < 3; i++)
      await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    await dialog.getByRole('button', { name: 'Agora não', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Começar a usar', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('radio', { name: /Prefiro sem jardim/ }).check();
    await dialog.getByRole('button', { name: 'Começar a usar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(
        async () => (await window.krono!.desktop!.read()).preferences.garden?.enabled,
      ),
    ).toBe(false);
    expect(
      await page.evaluate(async () => (await window.krono!.timer!.read()).sessionId),
    ).toBeNull();
    await page.reload();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir jardim', exact: true })).toHaveCount(0);
  });
  test('perfil legado sem campo da apresentação não recebe novo primeiro acesso', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole('dialog', { name: 'Conheça o Krono', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const api = window.krono!.desktop!,
        value = await api.read();
      await api.update({
        expectedRevision: value.preferences.revision,
        patch: {
          profile: { name: 'Perfil existente', avatar: null, onboarded: true },
          introduction: undefined,
        },
      });
    });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Perfil existente', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Conheça o Krono', exact: true })).toHaveCount(0);
  });
  test('sessão existente e sinal de contexto têm prioridade sobre o tutorial', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow();
    const dialog = page.getByRole('dialog', { name: 'Conheça o Krono', exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const api = window.krono!.timer!,
        current = await api.read();
      await api.command({
        commandId: crypto.randomUUID(),
        expectedRevision: current.revision,
        sessionId: current.sessionId,
        action: 'start',
      });
    });
    const id = await page.evaluate(async () => (await window.krono!.timer!.read()).sessionId);
    await page.reload();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Sobre', exact: true }).click();
    await page.getByRole('button', { name: 'Rever apresentação', exact: true }).click();
    await expect(dialog).toBeVisible();
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.send('desktop:focus'),
    );
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(async () => (await window.krono!.timer!.read()).sessionId)).toBe(id);
  });
  test('movimento é finito, cancela na redução, teclado contido e escala pequena sem overflow', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow();
    await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.setContentSize(800, 640);
      w.showInactive();
    });
    const dialog = page.getByRole('dialog', { name: 'Conheça o Krono', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.id === 'introduction-step' && a.playState === 'running').length,
        ),
      )
      .toBe(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.id === 'introduction-step' && a.playState === 'running').length,
        ),
      )
      .toBe(0);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
  });
});

for (const scale of [1, 1.25, 1.5, 2])
  test.describe(`Cards da apresentação em escala emulada ${scale}`, () => {
    test.use({ welcome: true, deviceScale: scale });
    test('imagens completas lado a lado; cores forçadas e fundo editorial estático', async ({
      electronApp,
    }) => {
      const page = await electronApp.firstWindow();
      await electronApp.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0]!;
        w.setContentSize(800, 640);
        w.showInactive();
      });
      const dialog = page.getByRole('dialog', { name: 'Conheça o Krono', exact: true });
      await expect(dialog).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter((a) => a.id === 'ambient-drift' && a.playState === 'running').length,
          ),
        )
        .toBe(0);
      await dialog.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
      await expect
        .poll(() =>
          dialog
            .locator('.introduction-screen img')
            .evaluateAll(
              (images) =>
                images.length === 2 &&
                images.every(
                  (el) =>
                    (el as HTMLImageElement).complete &&
                    (el as HTMLImageElement).naturalWidth > 0 &&
                    getComputedStyle(el).objectFit === 'contain',
                ),
            ),
        )
        .toBe(true);
      const boxes = await dialog.locator('.introduction-screen').evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right };
        }),
      );
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
      expect(boxes[0]!.right).toBeLessThan(boxes[1]!.x);
      expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
      await expect
        .poll(() =>
          page.evaluate(
            () => document.getAnimations().filter((a) => a.playState === 'running').length,
          ),
        )
        .toBe(0);
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.showInactive(),
      );
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter((a) => a.id === 'introduction-step' && a.playState === 'running').length,
          ),
        )
        .toBe(0);
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await expect(dialog.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.getAnimations().filter((a) => a.playState === 'running').length,
          ),
        )
        .toBe(0);
      await page.keyboard.press('Escape');
    });
  });
test('atalho global simulado: conflito mantém o anterior, estado persiste e apenas revela a janela', async ({
  appPage,
  electronApp,
}) => {
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('button', { name: 'Atalhos', exact: true }).click();
  const choose = async (value: string) => {
    await appPage.getByRole('combobox', { name: 'Atalho global', exact: true }).click();
    await appPage.getByRole('option', { name: value, exact: true }).click();
    await appPage.getByRole('button', { name: 'Aplicar atalho', exact: true }).click();
  };
  await choose('Ctrl + Alt + K');
  await expect(
    appPage.getByRole('status').filter({ hasText: 'Ativo: Ctrl + Alt + K' }),
  ).toBeVisible();
  await electronApp.evaluate(() => {
    const test = (globalThis as unknown as { shortcutTest: { occupied: string[] } }).shortcutTest;
    test.occupied.push('Control+Shift+K');
  });
  await choose('Ctrl + Shift + K');
  await expect(
    appPage.getByRole('alert').filter({ hasText: 'Essa combinação está ocupada' }),
  ).toBeVisible();
  expect(await appPage.evaluate(async () => (await window.krono!.shortcut!.read()).active)).toBe(
    'Control+Alt+K',
  );
  await electronApp.evaluate(() => {
    (
      globalThis as unknown as { shortcutTest: { registered: Map<string, () => void> } }
    ).shortcutTest.registered.get('Control+Alt+K')!();
  });
  expect(
    await appPage.evaluate(async () => (await window.krono!.timer!.read()).sessionId),
  ).toBeNull();
  await choose('Desativado');
  expect(
    await appPage.evaluate(
      async () => (await window.krono!.desktop!.read()).preferences.globalShortcut,
    ),
  ).toBe('off');
  expect(
    await appPage.evaluate(async () => {
      const api = window.krono!.desktop!,
        state = await api.read();
      try {
        await api.update({
          expectedRevision: state.preferences.revision,
          patch: { globalShortcut: 'Control+Alt+K' },
        });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});

test.describe('Contraste da apresentação', () => {
  test.use({ welcome: true });
  test('legendas dos cards mantêm 4,5:1 sobre os pixels do fundo editorial', async ({
    electronApp,
  }, testInfo) => {
    const page = await electronApp.firstWindow();
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.showInactive(),
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const dialog = page.getByRole('dialog', { name: 'Conheça o Krono', exact: true });
    await dialog.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
    const values = await page
      .locator('.introduction-screen figcaption :is(strong,span)')
      .evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect(),
            color = getComputedStyle(el)
              .color.match(/[\d.]+/g)!
              .map(Number);
          (el as HTMLElement).style.color = 'transparent';
          return { color, x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }),
      );
    const buffer = await page.screenshot({ scale: 'css', animations: 'disabled' });
    const ratios = await page.evaluate(
      async ({ values, url }) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const luma = (c: number[]) =>
          c.slice(0, 3).reduce((sum, v, i) => {
            v /= 255;
            return (
              sum +
              [0.2126, 0.7152, 0.0722][i]! *
                (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
            );
          }, 0);
        return values.map((v) => {
          const background = luma(
              Array.from(ctx.getImageData(Math.round(v.x), Math.round(v.y), 1, 1).data),
            ),
            foreground = luma(v.color);
          return (
            (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
          );
        });
      },
      { values, url: `data:image/png;base64,${buffer.toString('base64')}` },
    );
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await testInfo.attach('contraste-cards', {
      body: JSON.stringify(ratios),
      contentType: 'application/json',
    });
  });
});
