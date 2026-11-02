import { test, expect } from '../fixtures/app';

test('Ajustes usa a largura prevista e se adapta à janela', async ({ appPage, electronApp }) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.showInactive(),
  );
  for (const width of [1280, 800]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0]!.setContentSize(value, 800),
      width,
    );
    await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await expect
      .poll(() =>
        appPage
          .locator('.settings-dialog')
          .evaluate((element) =>
            Math.abs(
              element.getBoundingClientRect().width -
                Math.min(840, document.documentElement.clientWidth - 40),
            ),
          ),
      )
      .toBeLessThan(1);
    expect(
      await appPage
        .locator('.settings-dialog')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await appPage.keyboard.press('Escape');
  }
});

for (const scale of [1, 1.25, 1.5, 2])
  test.describe(`Temas em escala emulada ${scale}`, () => {
    test.use({ deviceScale: scale });
    for (const theme of ['Terminal / ASCII', 'Aero', 'Windows 95 escuro'])
      test(`nomes, centro, indicador e formulário em ${theme}`, async ({
        appPage,
        electronApp,
      }) => {
        await electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.showInactive(),
        );
        await appPage.emulateMedia({ reducedMotion: 'reduce' });
        await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
        await appPage.getByRole('button', { name: new RegExp(`^${theme}`) }).click();
        await appPage.keyboard.press('Escape');
        for (const width of [1280, 800]) {
          await electronApp.evaluate(
            ({ BrowserWindow }, value) =>
              BrowserWindow.getAllWindows()[0]!.setContentSize(value, 800),
            width,
          );
          for (const destination of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
            await appPage
              .getByRole('navigation')
              .getByRole('button', { name: destination, exact: true })
              .click();
            await expect(
              appPage.getByRole('heading', { name: destination, exact: true }),
            ).toBeVisible();
            await expect
              .poll(() =>
                appPage.getByRole('navigation').evaluate((nav) => {
                  const rect = nav.getBoundingClientRect(),
                    active = nav.querySelector('[aria-current]')!.getBoundingClientRect(),
                    line = nav.querySelector('.clean-selection')!.getBoundingClientRect();
                  return Math.max(
                    Math.abs(
                      rect.x +
                        rect.width / 2 -
                        (nav.closest('.clean-header')!.getBoundingClientRect().left +
                          nav.closest('.clean-header')!.getBoundingClientRect().width / 2),
                    ),
                    Math.abs(active.left - line.left),
                    Math.abs(active.right - line.right),
                  );
                }),
              )
              .toBeLessThan(1);
            expect(
              await appPage.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
              ),
            ).toBeLessThanOrEqual(1);
          }
        }
        await appPage
          .getByRole('navigation')
          .getByRole('button', { name: 'Hábitos', exact: true })
          .click();
        await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
        const ratios = await appPage
          .locator('.habit-form input:not([type=checkbox]),.habit-form button[type=submit]')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const style = getComputedStyle(element),
                rgb = (color: string) => color.match(/[\d.]+/g)!.map(Number),
                luma = (color: number[]) =>
                  color.slice(0, 3).reduce((sum, c, i) => {
                    c /= 255;
                    return (
                      sum +
                      [0.2126, 0.7152, 0.0722][i]! *
                        (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
                    );
                  }, 0);
              const a = luma(rgb(style.color)),
                b = luma(rgb(style.backgroundColor));
              return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            }),
          );
        for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
        await appPage.getByRole('button', { name: 'Cancelar', exact: true }).click();
      });
  });

test('texto sobre os pixels reais do fundo mantém contraste nos três temas', async ({
  appPage,
}, testInfo) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  const results: { theme: string; selector: string; ratio: number }[] = [];
  const selectors = [
    '.clean-nav .nav-content > span:last-child',
    '.time-label',
    '.time-state',
    '.clean-digits',
    '.clean-digits > span',
    '.clean-primary > span',
    '.mini-launch',
  ];
  for (const theme of ['Terminal / ASCII', 'Aero', 'Windows 95 escuro']) {
    await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await appPage.getByRole('button', { name: new RegExp(`^${theme}`) }).click();
    await appPage.keyboard.press('Escape');
    const data = await appPage.evaluate((list) => {
      const data = list.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter((element) => element.checkVisibility())
          .map((element) => {
            const color = getComputedStyle(element)
                .color.match(/[\d.]+/g)!
                .map(Number),
              box = element.getBoundingClientRect();
            return {
              selector,
              color,
              box: { x: box.x, y: box.y, width: box.width, height: box.height },
            };
          }),
      );
      document.querySelectorAll<HTMLElement>(list.join(',')).forEach((element) => {
        element.dataset.contrastStyle = element.getAttribute('style') ?? '';
        element.style.setProperty('color', 'transparent', 'important');
      });
      return data;
    }, selectors);
    const buffer = await appPage.screenshot({ scale: 'css', animations: 'disabled' });
    const ratios = await appPage.evaluate(
      async ({ data, url }) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const luma = (color: number[]) =>
          color.slice(0, 3).reduce((sum, c, i) => {
            c /= 255;
            return (
              sum +
              [0.2126, 0.7152, 0.0722][i]! *
                (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
            );
          }, 0);
        return data.map(({ selector, color, box }) => {
          const values = [];
          for (const x of [0.2, 0.5, 0.8])
            for (const y of [0.2, 0.5, 0.8]) {
              const pixel = Array.from(
                context.getImageData(
                  Math.max(0, Math.min(canvas.width - 1, Math.round(box.x + box.width * x))),
                  Math.max(0, Math.min(canvas.height - 1, Math.round(box.y + box.height * y))),
                  1,
                  1,
                ).data,
              );
              const foreground = luma(color),
                background = luma(pixel);
              values.push(
                (Math.max(foreground, background) + 0.05) /
                  (Math.min(foreground, background) + 0.05),
              );
            }
          return { selector, ratio: Math.min(...values) };
        });
      },
      { data, url: `data:image/png;base64,${buffer.toString('base64')}` },
    );
    await appPage.evaluate(() =>
      document.querySelectorAll<HTMLElement>('[data-contrast-style]').forEach((element) => {
        const style = element.dataset.contrastStyle!;
        if (style) element.setAttribute('style', style);
        else element.removeAttribute('style');
        delete element.dataset.contrastStyle;
      }),
    );
    for (const value of ratios) {
      results.push({ theme, ...value });
      expect(value.ratio, JSON.stringify({ theme, ...value })).toBeGreaterThanOrEqual(4.5);
    }
  }
  await testInfo.attach('contraste-pixels-temas', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
});

test('ASCII anima somente a ativação, termina em dois segundos e cancela sem replay', async ({
  appPage,
  electronApp,
}) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.showInactive(),
  );
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await appPage.getByRole('button', { name: /^Terminal \/ ASCII/ }).click();
  await appPage.keyboard.press('Escape');
  const nav = appPage.getByRole('navigation');
  await nav.getByRole('button', { name: 'Hábitos', exact: true }).click();
  await expect
    .poll(() =>
      appPage.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.id === 'ascii-activation' && animation.playState === 'running',
            ).length,
      ),
    )
    .toBe(1);
  expect(
    await nav
      .getByRole('button', { name: 'Hábitos', exact: true })
      .locator('.ascii-object')
      .evaluate((element) => element.getAnimations()[0]!.effect!.getTiming().duration),
  ).toBe(2000);
  await expect
    .poll(
      () =>
        appPage.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.id === 'ascii-activation' && animation.playState === 'running',
              ).length,
        ),
      { timeout: 3000 },
    )
    .toBe(0);
  await nav.getByRole('button', { name: 'Produção', exact: true }).click();
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      appPage.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.id === 'ascii-activation' && animation.playState === 'running',
            ).length,
      ),
    )
    .toBe(0);
  await appPage.emulateMedia({ reducedMotion: 'no-preference' });
  expect(
    await appPage.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (animation) => animation.id === 'ascii-activation' && animation.playState === 'running',
          ).length,
    ),
  ).toBe(0);
});
