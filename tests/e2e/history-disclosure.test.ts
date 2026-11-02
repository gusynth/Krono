import { test, expect } from '../fixtures/app';

test('históricos fechados não montam listas; abrir/fechar por teclado conserva conteúdo e foco', async ({
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Criar hábito' });
  await form.getByLabel('Nome', { exact: true }).fill('Histórico sob demanda');
  await form.getByRole('button', { name: 'Salvar hábito' }).click();
  const habit = appPage.getByRole('article', { name: 'Histórico sob demanda' }),
    summary = habit.locator('summary');
  await expect(habit).toBeVisible();
  await expect(habit.locator('.habit-history')).toHaveCount(0);
  await summary.focus();
  await appPage.keyboard.press('Space');
  await expect(habit.locator('.habit-history li')).toHaveCount(28);
  await expect(summary).toBeFocused();
  await expect(habit.locator('.habit-history')).toContainText('Pendente hoje');
  await appPage.keyboard.press('Space');
  await expect(habit.locator('.habit-history')).toHaveCount(0);
  await expect(summary).toBeFocused();
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Produção', exact: true })
    .click();
  const list = appPage.locator('.production-days .habit-history'),
    days = appPage.getByText('Consultar dias em lista', { exact: true });
  await expect(days).toBeVisible();
  await expect(list).toHaveCount(0);
  await days.focus();
  for (let index = 0; index < 3; index++) {
    await appPage.keyboard.press('Enter');
    await expect(list.locator('li')).toHaveCount(30);
    await expect(days).toBeFocused();
    await appPage.keyboard.press('Enter');
    await expect(list).toHaveCount(0);
  }
});
