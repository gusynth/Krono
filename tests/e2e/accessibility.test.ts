import { test, expect } from '../fixtures/app';
import { contrast } from '../fixtures/contrast';

test('árvore acessível: controles nomeados, destinos ocultos ausentes e contador sem anúncios por segundo', async ({
  appPage,
}, testInfo) => {
  const cdp = await appPage.context().newCDPSession(appPage);
  for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
    await appPage.getByRole('navigation').getByRole('button', { name, exact: true }).focus();
    await appPage.keyboard.press('Enter');
    await expect(appPage.getByRole('heading', { name, exact: true })).toBeVisible();
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const controls = nodes.filter(
      (node) =>
        !node.ignored &&
        ['button', 'checkbox', 'combobox', 'slider', 'link'].includes(String(node.role?.value)),
    );
    expect(controls.length).toBeGreaterThan(3);
    expect(controls.filter((node) => !String(node.name?.value ?? '').trim())).toEqual([]);
    expect(
      nodes
        .filter(
          (node) =>
            !node.ignored &&
            node.role?.value === 'heading' &&
            ['Perfil', 'Foco', 'Hábitos', 'Produção'].includes(String(node.name?.value)),
        )
        .map((node) => node.name?.value),
    ).toEqual([name]);
    await testInfo.attach(`acessibilidade-${name}`, {
      body: JSON.stringify(controls),
      contentType: 'application/json',
    });
  }
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await expect(appPage.locator('.clean-digits')).toHaveAttribute('aria-live', 'off');
  await appPage.getByRole('button', { name: 'Ajustes', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  await expect(appPage.getByRole('switch', { name: 'Reduzir animações' })).toBeVisible();
  await appPage.keyboard.press('Escape');
  await expect(appPage.getByRole('button', { name: 'Ajustes', exact: true })).toBeFocused();
});

test('contraste composto e alto contraste preservam seleção, foco, marca e controles', async ({
  appPage,
}, testInfo) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
  await expect(appPage.locator('.clean-page:not([hidden])')).toHaveCSS('opacity', '1');
  const values = await contrast(appPage, [
    '.clean-nav .nav-content > span:last-child',
    '.clean-header-actions > span',
    '.time-label',
    '.time-state',
    '.clean-digits',
    '.clean-digits > span',
    '.clean-primary > span',
    '.clean-footer',
  ]);
  expect(values.length).toBeGreaterThan(7);
  for (const value of values)
    expect(value.ratio, JSON.stringify(value)).toBeGreaterThanOrEqual(4.5);
  await testInfo.attach('contraste-fundo-composto', {
    body: JSON.stringify(values),
    contentType: 'application/json',
  });
  for (const colorScheme of ['light', 'dark'] as const) {
    await appPage.emulateMedia({ forcedColors: 'active', colorScheme });
    const nav = appPage.getByRole('navigation');
    await nav.getByRole('button', { name: 'Produção', exact: true }).focus();
    await appPage.keyboard.press('Enter');
    await expect(nav.getByRole('button', { name: 'Produção', exact: true })).toBeFocused();
    const state = await appPage.evaluate(() => {
      const line = getComputedStyle(document.querySelector('.clean-selection')!),
        brand = getComputedStyle(document.querySelector('.clean-brand')!),
        focused = getComputedStyle(document.activeElement!);
      return {
        lineBackground: line.backgroundColor,
        lineHeight: line.height,
        brandBackground: brand.backgroundColor,
        focusStyle: focused.outlineStyle,
        focusWidth: focused.outlineWidth,
      };
    });
    expect(state.brandBackground).toBe('rgb(12, 12, 14)');
    expect(state.focusStyle).not.toBe('none');
    expect(parseFloat(state.focusWidth)).toBeGreaterThanOrEqual(2);
    expect(parseFloat(state.lineHeight)).toBeGreaterThanOrEqual(44);
    await expect(
      appPage.getByRole('link', { name: 'Krono, Perfil' }).locator('img:visible'),
    ).toBeVisible();
    await appPage.locator('.clean-header').screenshot({
      path: `artifacts/visual/high-contrast-${colorScheme}.png`,
      animations: 'disabled',
    });
  }
});
