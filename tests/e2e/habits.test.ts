import { choose } from '../fixtures/choice';
import { test, expect } from '../fixtures/app';

test('Hábitos reais: criar por teclado, concluir/desfazer, editar, arquivar e reabrir', async ({
  appPage,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).focus();
  await appPage.keyboard.press('Enter');
  const form = appPage.getByRole('form', { name: 'Criar hábito' });
  await expect(form.getByLabel('Nome', { exact: true })).toBeFocused();
  await form.getByLabel('Nome', { exact: true }).fill('   ');
  await form.getByRole('button', { name: 'Salvar hábito' }).click();
  await expect(appPage.locator('.real-habits').getByRole('alert')).toContainText('Revise o nome');
  await expect(form.getByRole('button', { name: 'Salvar hábito' })).toBeEnabled();
  await form.getByLabel('Nome', { exact: true }).fill('Ler um capítulo');
  await form.getByRole('button', { name: 'Salvar hábito' }).click();
  const habit = appPage.getByRole('article', { name: 'Ler um capítulo' });
  await expect(habit).toContainText('Pendente hoje');
  await habit.getByRole('button', { name: 'Concluir hoje' }).focus();
  await appPage.keyboard.press('Enter');
  await expect(habit.getByRole('button', { name: 'Desfazer conclusão' })).toBeVisible();
  await expect(habit.getByRole('button', { name: 'Desfazer conclusão' })).toBeFocused();
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await expect(habit).toContainText('Sequência: 1');
  await expect(habit).toContainText('1 de 1 concluídas nos últimos 28 dias (100%)');
  await habit.getByRole('button', { name: 'Desfazer conclusão' }).click();
  await expect(habit.getByRole('button', { name: 'Concluir hoje' })).toBeVisible();
  await habit.getByRole('button', { name: 'Editar', exact: true }).click();
  const edit = appPage.getByRole('form', { name: 'Editar hábito' });
  await choose(edit.getByRole('combobox', { name: 'Frequência', exact: true }), 'weekdays');
  await edit.getByRole('button', { name: 'Salvar hábito' }).click();
  await expect(habit).toContainText('agendada para amanhã');
  await habit.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(edit.getByRole('combobox', { name: 'Frequência', exact: true })).toHaveText(
    'Dias úteis',
  );
  await edit.getByRole('button', { name: 'Salvar hábito' }).click();
  expect(
    await appPage.evaluate(
      async () => (await window.krono!.habits!.read()).habits[0].nextFrequency?.kind,
    ),
  ).toBe('weekdays');
  await habit.getByText('Histórico de Ler um capítulo', { exact: true }).click();
  await expect(habit.getByRole('listitem')).toHaveCount(28);
  await appPage.screenshot({ path: 'artifacts/visual/habits-real.png', fullPage: true });
  await habit.getByRole('button', { name: 'Arquivar', exact: true }).click();
  await appPage
    .getByRole('alertdialog', { name: 'Arquivar hábito' })
    .getByRole('button', { name: 'Confirmar' })
    .click();
  await expect(habit).toHaveCount(0);
  await appPage.getByLabel('Mostrar arquivados').check();
  await expect(habit).toContainText('Arquivado');
  await habit.getByRole('button', { name: 'Reativar', exact: true }).click();
  await appPage.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(habit.getByRole('button', { name: 'Concluir hoje' })).toBeVisible();
});

test('formulário e cabeçalho preservam teclado, redução e escalas de conteúdo', async ({
  appPage,
  electronApp,
}) => {
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  const form = appPage.getByRole('form', { name: 'Criar hábito' });
  await form.getByLabel('Nome', { exact: true }).fill('Caminhar');
  await choose(form.getByRole('combobox', { name: 'Frequência', exact: true }), 'specific');
  await expect(form.getByRole('group', { name: 'Dias previstos' })).toBeVisible();
  await choose(form.getByRole('combobox', { name: 'Frequência', exact: true }), 'alternate');
  await expect(form.getByLabel('Data âncora (dia ativo)', { exact: true })).toHaveValue(
    '01/01/2026',
  );
  for (const zoom of [1, 1.25, 1.5, 2]) {
    await electronApp.evaluate(({ BrowserWindow }, factor) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setContentSize(1280, 900);
      window.webContents.setZoomFactor(factor);
    }, zoom);
    await expect
      .poll(() => appPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await expect(appPage.locator('.clean-study')).toHaveAttribute('data-motion', 'reduced');
    await expect(form.getByRole('button', { name: 'Salvar hábito' })).toBeVisible();
    if (zoom === 1)
      await appPage.screenshot({ path: 'artifacts/visual/habits-form.png', fullPage: true });
  }
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(appPage.getByRole('button', { name: 'Novo hábito', exact: true })).toBeFocused();
});

test('hábito de tempo recebe Foco concluído uma vez, sem conclusão manual', async ({
  appPage,
  electronApp,
}) => {
  const id = await appPage.evaluate(async () => {
    const api = window.krono!.habits!;
    const state = await api.read();
    const id = crypto.randomUUID();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      action: 'create',
      habitId: id,
      input: {
        name: 'Leitura focada',
        kind: 'time',
        frequency: { kind: 'daily' },
        targetMinutes: 1,
      },
    });
    return id;
  });
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await choose(appPage.getByRole('combobox', { name: 'Hábito para o próximo Foco' }), id);
  await expect
    .poll(() => appPage.evaluate(async () => (await window.krono!.habits!.read()).selectedId))
    .toBe(id);
  await appPage.evaluate(async () => {
    const api = window.krono!.timer!,
      state = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      sessionId: state.sessionId,
      action: 'start',
      preset: { focusMs: 60_000, shortBreakMs: 1000, longBreakMs: 1000, longEvery: 4 },
    });
  });
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { advanceTimer: (ms: number) => Promise<void> }).advanceTimer(
      60_000,
    );
  });
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  const habit = appPage.getByRole('article', { name: 'Leitura focada' });
  await expect(habit).toContainText('1 / 1 min');
  await expect(habit).toContainText('Concluído');
  await expect(habit.getByRole('button', { name: 'Concluir hoje' })).toHaveCount(0);
  await appPage.reload();
  await appPage.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await expect(habit).toContainText('1 / 1 min');
});

test('falha de armazenamento mantém erro e rejeita comando manual com data histórica', async ({
  appPage,
  electronApp,
}) => {
  const invalid = await appPage.evaluate(async () => {
    try {
      await window.krono!.habits!.command({
        commandId: crypto.randomUUID(),
        expectedRevision: 0,
        action: 'check',
        habitId: crypto.randomUUID(),
        date: '2020-01-01',
      } as never);
      return false;
    } catch {
      return true;
    }
  });
  expect(invalid).toBe(true);
  await electronApp.evaluate(async () => {
    await (globalThis as unknown as { stopStorage: () => Promise<number> }).stopStorage();
  });
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  await appPage.getByRole('form').getByLabel('Nome', { exact: true }).fill('Não confirmado');
  await appPage.getByRole('button', { name: 'Salvar hábito' }).click();
  await expect(appPage.locator('.real-habits').getByRole('alert')).toContainText(
    'Não foi possível salvar',
  );
  await expect(appPage.getByRole('article', { name: 'Não confirmado' })).toHaveCount(0);
  await expect(appPage.getByRole('button', { name: 'Salvar hábito' })).toBeDisabled();
});

test('retry após confirmação perdida mantém um cadastro e fecha o formulário com foco restaurado', async ({
  appPage,
  electronApp,
}) => {
  await appPage
    .getByRole('navigation')
    .getByRole('button', { name: 'Hábitos', exact: true })
    .click();
  await appPage.getByRole('button', { name: 'Novo hábito', exact: true }).click();
  await appPage
    .getByRole('form')
    .getByLabel('Nome', { exact: true })
    .fill('Cadastro confirmado no banco');
  await electronApp.evaluate(() => {
    (globalThis as unknown as { loseHabitAckOnce: () => void }).loseHabitAckOnce();
  });
  await appPage.getByRole('button', { name: 'Salvar hábito' }).click();
  await expect(appPage.locator('.real-habits').getByRole('alert')).toContainText(
    'Não foi possível salvar',
  );
  await appPage.locator('.real-habits').getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(appPage.getByRole('article', { name: 'Cadastro confirmado no banco' })).toHaveCount(
    1,
  );
  await expect(appPage.getByRole('form')).toHaveCount(0);
  await expect(appPage.getByRole('button', { name: 'Novo hábito', exact: true })).toBeFocused();
  expect(await appPage.evaluate(async () => (await window.krono!.habits!.read()).revision)).toBe(1);
});
