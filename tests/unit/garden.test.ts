import { expect, it } from 'vitest';
import { gardenPeriod, gardenProgress } from '../../shared/domain/garden';
import { gardenSnapshotSchema } from '../../shared/contracts/garden';
import {
  defaultPreferences,
  preferencesSchema,
  preferencePatchSchema,
} from '../../shared/contracts/desktop';
it('capítulos abrem pelo tempo confirmado, incluindo segundos sem arredondar cada sessão', () => {
  expect(gardenProgress(59_999).minutes).toBe(0);
  expect(gardenProgress(60_000).minutes).toBe(1);
  for (const [minutes, id, count] of [
    [0, 'garden', 1],
    [299, 'garden', 1],
    [300, 'courtyard', 2],
    [900, 'library', 3],
    [1800, 'observatory', 4],
  ] as const) {
    const p = gardenProgress(minutes * 60_000);
    expect(p.chapter.id).toBe(id);
    expect(p.unlocked).toHaveLength(count);
  }
  expect(gardenProgress(3000 * 60_000).complete).toBe(true);
  expect(gardenProgress(12000 * 60_000).level).toBe(201);
  expect(gardenProgress(12000 * 60_000).fraction).toBe(1);
});
it('visita e repetição não concedem XP; entradas inválidas falham', () => {
  expect(gardenProgress(125 * 60_000)).toEqual(gardenProgress(125 * 60_000));
  for (const n of [-1, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1])
    expect(() => gardenProgress(n)).toThrow();
  expect(gardenSnapshotSchema.safeParse({ version: 1, eligibleMs: -1, sessions: 0 }).success).toBe(
    false,
  );
});
it('introdução da beta é opcional, validada e não quebra preferências legadas', () => {
  expect(preferencesSchema.parse(defaultPreferences()).garden).toBeUndefined();
  expect(
    preferencePatchSchema.parse({ garden: { version: 1, introductionSeen: true } }).garden
      ?.introductionSeen,
  ).toBe(true);
  for (const garden of [
    { version: 2, introductionSeen: true },
    { version: 1, introductionSeen: 'sim' },
    { version: 1, introductionSeen: true, xp: 100 },
  ])
    expect(preferencePatchSchema.safeParse({ garden }).success).toBe(false);
});
it('iluminação segue as quatro faixas locais sem afetar crédito', () => {
  expect([0, 5.99, 6, 11.99, 12, 17.99, 18, 23.99].map(gardenPeriod)).toEqual([
    'late',
    'late',
    'morning',
    'morning',
    'afternoon',
    'afternoon',
    'night',
    'night',
  ]);
});

it('escolha do jardim aceita sim/não, conserva preferências antigas e rejeita valores ambíguos', () => {
  for (const enabled of [true, false])
    expect(
      preferencePatchSchema.parse({ garden: { version: 1, introductionSeen: false, enabled } })
        .garden?.enabled,
    ).toBe(enabled);
  expect(
    preferencePatchSchema.parse({ garden: { version: 1, introductionSeen: true } }).garden?.enabled,
  ).toBeUndefined();
  expect(
    preferencePatchSchema.safeParse({
      garden: { version: 1, introductionSeen: false, enabled: 'não' },
    }).success,
  ).toBe(false);
});
