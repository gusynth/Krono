import { expect, it, vi } from 'vitest';
import { ShortcutController } from '../../electron/desktop/ShortcutController';
import type { DesktopService } from '../../electron/desktop/DesktopService';
import { defaultPreferences, type PreferenceUpdate } from '../../shared/contracts/desktop';
import { introductionSchema } from '../../shared/contracts/welcome';
function setup(saved = 'off') {
  let prefs = { ...defaultPreferences(), globalShortcut: saved },
    fail = false;
  const occupied = new Set<string>(),
    keys = new Map<string, () => void>(),
    reveal = vi.fn();
  const port = {
    register: vi.fn((key: string, callback: () => void) => {
      if (occupied.has(key)) return false;
      keys.set(key, callback);
      return true;
    }),
    unregister: vi.fn((key: string) => keys.delete(key)),
  };
  const desktop = {
    preferences: () => prefs,
    update: async (input: PreferenceUpdate) => {
      if (!fail) prefs = { ...prefs, ...input.patch, revision: prefs.revision + 1 };
      return { preferences: prefs, error: fail ? 'disk' : null };
    },
  } as unknown as DesktopService;
  return {
    create: () => new ShortcutController(desktop, port, reveal),
    occupied,
    keys,
    port,
    reveal,
    fail: () => {
      fail = true;
    },
    preferences: () => prefs,
  };
}
it('padrão não registra atalho; ativação só revela e libera apenas o próprio registro', async () => {
  const env = setup(),
    controller = env.create();
  expect(env.port.register).not.toHaveBeenCalled();
  expect((await controller.set('Control+Alt+K')).status).toBe('active');
  env.keys.get('Control+Alt+K')!();
  expect(env.reveal).toHaveBeenCalledOnce();
  expect(env.preferences().globalShortcut).toBe('Control+Alt+K');
  controller.dispose();
  expect(env.keys.size).toBe(0);
});
it('conflito preserva atalho e preferência anteriores; desativar libera o registro', async () => {
  const env = setup('Control+Alt+K'),
    controller = env.create();
  env.occupied.add('Control+Shift+K');
  const result = await controller.set('Control+Shift+K');
  expect(result.status).toBe('conflict');
  expect(result.active).toBe('Control+Alt+K');
  expect(env.preferences().globalShortcut).toBe('Control+Alt+K');
  expect(env.keys.has('Control+Alt+K')).toBe(true);
  expect((await controller.set('off')).status).toBe('off');
  expect(env.keys.size).toBe(0);
});
it('falha de persistência desfaz aquisição nova sem perder o atalho antigo', async () => {
  const env = setup('Control+Alt+K'),
    controller = env.create();
  env.fail();
  expect((await controller.set('Control+Shift+K')).status).toBe('error');
  expect([...env.keys.keys()]).toEqual(['Control+Alt+K']);
  controller.dispose();
});
it('startup ocupado é explícito, entradas arbitrárias recusadas, cliques serializados', async () => {
  const env = setup('Control+Alt+K');
  env.occupied.add('Control+Alt+K');
  const controller = env.create();
  expect(controller.read().status).toBe('conflict');
  expect(() => controller.set('Alt+F4')).toThrow();
  await Promise.all([
    controller.set('Control+Shift+K'),
    controller.set('Control+Alt+Space'),
    controller.set('off'),
  ]);
  expect(controller.read().active).toBe('off');
  expect(env.keys.size).toBe(0);
  controller.dispose();
});
it('modelo de apresentação valida etapa e aceita conclusão ou retomada sem campos livres', () => {
  expect(introductionSchema.parse({ version: 1, step: 4, completed: false }).step).toBe(4);
  expect(introductionSchema.safeParse({ version: 1, step: 5, completed: false }).success).toBe(
    false,
  );
  expect(
    introductionSchema.safeParse({ version: 1, step: 0, completed: true, url: 'https://external' })
      .success,
  ).toBe(false);
});
it('falha ao publicar para renderer não desfaz registro e preferência confirmados', async () => {
  const env = setup(),
    controller = env.create();
  controller.subscribe(() => {
    throw new Error('renderer gone');
  });
  expect((await controller.set('Control+Alt+K')).status).toBe('active');
  expect(env.keys.has('Control+Alt+K')).toBe(true);
  expect(env.preferences().globalShortcut).toBe('Control+Alt+K');
  controller.dispose();
});
