import { test, expect, visibility, iconAnimationCount } from '../fixtures/clean';

// Alternativa superior preservada; a composição lateral tem matriz própria.
test.use({ navigation: 'top' });

test('cabeçalho em tamanho real, centralização e três larguras', async ({
  studyApp,
  studyPage,
}) => {
  for (const [width, height] of [
    [980, 700],
    [1280, 900],
    [1920, 1080],
  ]) {
    await studyApp.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]),
      [width, height],
    );
    await expect.poll(() => studyPage.evaluate(() => innerWidth)).toBe(width);
    const available = await studyPage.evaluate(() => document.documentElement.clientWidth);
    const nav = await studyPage.getByRole('navigation').boundingBox();
    const brand = await studyPage.locator('.clean-brand').boundingBox();
    const actions = await studyPage.locator('.clean-header-actions > span').boundingBox();
    const time = await studyPage.locator('.clean-digits').boundingBox();
    const stage = await studyPage.locator('.focus-stage').boundingBox();
    const context = await studyPage.locator('.focus-details').boundingBox();
    expect(Math.abs(nav!.x + nav!.width / 2 - available / 2)).toBeLessThan(1);
    // Nova composição central: contador, painel e navegação na área útil da janela.
    expect(Math.abs(time!.x + time!.width / 2 - (stage!.x + stage!.width / 2))).toBeLessThan(1);
    expect(Math.abs(time!.x + time!.width / 2 - available / 2)).toBeLessThan(1);
    expect(stage!.y + stage!.height).toBeLessThan(context!.y);
    expect(brand!.x + brand!.width).toBeLessThan(nav!.x);
    expect(nav!.x + nav!.width).toBeLessThan(actions!.x);
    expect(await studyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await studyPage.locator('.clean-notice').count()).toBe(1);
    await studyPage.screenshot({
      path: `artifacts/visual/clean-focus-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    if (width === 1280)
      await studyPage
        .getByRole('navigation')
        .screenshot({ path: 'artifacts/visual/clean-navigation-real.png', animations: 'disabled' });
  }
});

test('gestos internos específicos, finitos e sem replay por atualização da UI', async ({
  studyPage,
  studyApp,
}) => {
  await studyApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await visibility(studyPage, 'visible');
  const nav = studyPage.getByRole('navigation');
  for (const [name, parts] of [
    ['Perfil', ['profile-head', 'profile-shoulders', 'profile-reflection']],
    ['Foco', ['hand', 'reflection']],
    ['Hábitos', ['page', 'check']],
    ['Produção', ['bar-0', 'bar-1', 'bar-2']],
  ] as const) {
    await nav.getByRole('button', { name, exact: true }).click();
    const gestures = await studyPage.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.id.startsWith('krono-'))
        .map((animation) => {
          const effect = animation.effect as KeyframeEffect;
          const timing = effect.getTiming();
          const target = effect.target as Element;
          return {
            part: target.getAttribute('data-part'),
            tag: target.tagName.toLowerCase(),
            frames: effect.getKeyframes(),
            duration: timing.duration,
            delay: timing.delay,
            iterations: timing.iterations,
          };
        }),
    );
    expect(gestures.map((gesture) => gesture.part).sort()).toEqual([...parts].sort());
    for (const gesture of gestures) {
      expect(gesture.tag).not.toBe('svg');
      expect(gesture.iterations).toBe(1);
      expect(Number(gesture.duration) + (gesture.delay ?? 0)).toBeLessThanOrEqual(2200);
      expect(Number(gesture.duration)).toBeGreaterThanOrEqual(350);
      expect(gesture.frames.length).toBeGreaterThanOrEqual(3);
    }
    expect(
      Math.max(...gestures.map((gesture) => Number(gesture.duration) + Number(gesture.delay))),
    ).toBeGreaterThanOrEqual(1800);
    await expect.poll(() => iconAnimationCount(studyPage)).toBe(0);
  }
  await nav.getByRole('button', { name: 'Foco', exact: true }).click();
  await expect.poll(() => iconAnimationCount(studyPage)).toBe(0);
  await studyPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  expect(await iconAnimationCount(studyPage)).toBe(0);
});

test('estado preservado; clique e teclado equivalentes; calendário não conclui hábito', async ({
  studyPage,
}) => {
  await visibility(studyPage, 'visible');
  await studyPage.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  const nav = studyPage.getByRole('navigation');
  const habits = nav.getByRole('button', { name: 'Hábitos', exact: true });
  await habits.focus();
  await studyPage.keyboard.press('Enter');
  await expect(habits).toBeFocused();
  await expect(
    studyPage.getByRole('button', { name: 'Concluir hábito de exemplo' }),
  ).toHaveAttribute('aria-pressed', 'false');
  await studyPage.getByRole('button', { name: 'Concluir hábito de exemplo' }).click();
  await nav.getByRole('button', { name: 'Produção', exact: true }).click();
  await nav.getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(studyPage.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await expect(
    studyPage.getByRole('button', { name: 'Desfazer conclusão do exemplo' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('interrupção, fundo e 40 navegações não acumulam animações ou nós', async ({
  studyPage,
}, testInfo) => {
  test.setTimeout(90000);
  await visibility(studyPage, 'visible');
  const nav = studyPage.getByRole('navigation');
  for (const [name, fraction] of [
    ['Perfil', 0.3],
    ['Perfil', 0.7],
    ['Produção', 0.3],
    ['Produção', 0.7],
  ] as const) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect.poll(() => iconAnimationCount(studyPage)).toBe(3);
    await studyPage.evaluate(
      (value) =>
        document
          .getAnimations()
          .filter((animation) => animation.id.startsWith('krono-'))
          .forEach((animation) => {
            animation.pause();
            animation.currentTime = Number(animation.effect?.getTiming().duration) * value;
          }),
      fraction,
    );
    await visibility(studyPage, 'hidden');

    await expect.poll(() => iconAnimationCount(studyPage)).toBe(0);
    await visibility(studyPage, 'visible');
    expect(await iconAnimationCount(studyPage)).toBe(0);
  }
  await nav.getByRole('button', { name: 'Foco', exact: true }).click();
  await expect.poll(() => iconAnimationCount(studyPage)).toBe(0);
  const before = await studyPage.locator('.clean-study *').count();
  for (let index = 0; index < 40; index++) {
    await nav
      .getByRole('button', {
        name: ['Perfil', 'Hábitos', 'Produção', 'Foco'][index % 4],
        exact: true,
      })
      .evaluate((element) => (element as HTMLButtonElement).click());
    expect(await iconAnimationCount(studyPage)).toBeLessThanOrEqual(3);
  }
  await nav.getByRole('button', { name: 'Foco', exact: true }).click();
  await expect.poll(() => iconAnimationCount(studyPage)).toBe(0);
  const after = await studyPage.locator('.clean-study *').count();
  expect(after).toBe(before);
  await testInfo.attach('recursos', {
    body: JSON.stringify({
      beforeNodes: before,
      afterNodes: after,
      activeObjectAnimations: await iconAnimationCount(studyPage),
      cycles: 40,
      visibility: 'evento web simulado; sem minimizar janela pessoal',
    }),
    contentType: 'application/json',
  });
});

test('reduções, popover e escalas de conteúdo 100/125/150/200%', async ({
  studyApp,
  studyPage,
}) => {
  await visibility(studyPage, 'visible');
  for (const [movement, effects] of [
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ]) {
    await studyPage.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await studyPage.getByRole('switch', { name: 'Reduzir animações' }).setChecked(movement);
    await studyPage
      .getByRole('switch', { name: 'Reduzir transparência/efeitos' })
      .setChecked(effects);
    await expect(studyPage.locator('.clean-study')).toHaveAttribute(
      'data-motion',
      movement ? 'reduced' : 'full',
    );
    await expect(studyPage.locator('.clean-study')).toHaveAttribute(
      'data-effects',
      effects ? 'reduced' : 'full',
    );
    await studyPage.keyboard.press('Escape');
    await expect(studyPage.getByRole('region', { name: 'Ajustes', exact: true })).toBeHidden();
    await expect(studyPage.getByRole('button', { name: 'Ajustes', exact: true })).toBeFocused();
    if (movement) {
      await studyPage
        .getByRole('navigation')
        .getByRole('button', { name: 'Hábitos', exact: true })
        .click();
      expect(await iconAnimationCount(studyPage)).toBe(0);
      await studyPage
        .getByRole('navigation')
        .getByRole('button', { name: 'Foco', exact: true })
        .click();
    }
  }
  await studyPage.getByRole('button', { name: 'Configuração do preset' }).click();
  await expect(studyPage.getByRole('region', { name: 'Configuração do preset' })).toBeVisible();
  await studyPage.keyboard.press('Escape');
  await expect(studyPage.getByRole('button', { name: 'Configuração do preset' })).toBeFocused();
  for (const scale of [1, 1.25, 1.5, 2]) {
    await studyApp.evaluate(
      ({ BrowserWindow }, value) =>
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(value),
      scale,
    );
    expect(await studyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const name of ['Foco', 'Hábitos', 'Produção'])
      await expect(
        studyPage.getByRole('navigation').getByRole('button', { name, exact: true }),
      ).toBeVisible();
  }
});
