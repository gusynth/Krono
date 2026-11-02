import { it, expect } from 'vitest';
import { defaultPreferences } from '../../shared/contracts/desktop';
import { needsGardenInvitation } from '../../shared/domain/garden-invitation';
it('convida somente perfis estabelecidos sem uma escolha para o jardim', () => {
  const p = defaultPreferences();
  expect(needsGardenInvitation(p)).toBe(false);
  expect(
    needsGardenInvitation({ ...p, profile: { name: 'Ana', avatar: null, onboarded: true } }),
  ).toBe(true);
  expect(needsGardenInvitation({ ...p, firstHideSeen: true })).toBe(true);
  expect(
    needsGardenInvitation({ ...p, introduction: { version: 1, step: 4, completed: true } }),
  ).toBe(true);
  expect(
    needsGardenInvitation({
      ...p,
      profile: { name: 'Ana', avatar: null, onboarded: true },
      introduction: { version: 1, step: 4, completed: false },
    }),
  ).toBe(false);
});
it('escolhas anteriores e uso legado impedem repetição em atualização ou reinstalação', () => {
  const p = {
    ...defaultPreferences(),
    introduction: { version: 1 as const, step: 4, completed: true },
  };
  for (const enabled of [true, false])
    expect(
      needsGardenInvitation({ ...p, garden: { version: 1, introductionSeen: false, enabled } }),
    ).toBe(false);
  expect(needsGardenInvitation({ ...p, garden: { version: 1, introductionSeen: true } })).toBe(
    false,
  );
  expect(needsGardenInvitation({ ...p, garden: { version: 1, introductionSeen: false } })).toBe(
    true,
  );
});
