import { expect, it } from 'vitest';
import { goalCommandSchema, productionQuerySchema } from '../../shared/contracts/production';
import {
  changePercent,
  comparisonWindow,
  dateRange,
  goalEffectiveDate,
  goalProgress,
  weekStart,
} from '../../shared/domain/production';

it('períodos civis atravessam bissexto, ano e semanas começam na segunda', () => {
  expect(dateRange('2024-03-01', 3)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  expect(dateRange('2026-01-01', 2)).toEqual(['2025-12-31', '2026-01-01']);
  expect(weekStart('2026-01-04')).toBe('2025-12-29');
  expect(weekStart('2026-01-05')).toBe('2026-01-05');
});
it('compara somente o mesmo número de datas encerradas, sem diluir hoje aberto', () => {
  expect(comparisonWindow('2026-01-01', 3, '2026-01-03', '2026-01-03')).toEqual({
    days: 2,
    currentEnd: '2026-01-02',
    previousStart: '2025-12-30',
    previousEnd: '2025-12-31',
  });
  expect(comparisonWindow('2026-01-01', 3, '2026-01-03', '2026-01-04').days).toBe(3);
  expect(comparisonWindow('2026-01-03', 1, '2026-01-03', '2026-01-03').days).toBe(0);
});
it('sem base/meta não gera NaN, infinidade ou porcentagem inventada; excedente não estoura anel', () => {
  expect(changePercent(1000, 0)).toBeNull();
  expect(changePercent(0, 1000)).toBe(-100);
  expect(goalProgress(0, null)).toEqual({ percent: null, ringPercent: 0 });
  expect(goalProgress(1000, 0).percent).toBeNull();
  expect(goalProgress(1500, 1000)).toEqual({ percent: 150, ringPercent: 100 });
  expect(goalProgress(1_530_000, 1_200_000).percent).toBe(127.5);
});
it('metas têm vigência amanhã/próxima segunda, ou hoje mediante intenção explícita', () => {
  expect(goalEffectiveDate('2026-01-02', 'daily', false)).toBe('2026-01-03');
  expect(goalEffectiveDate('2026-01-02', 'weekly', false)).toBe('2026-01-05');
  expect(goalEffectiveDate('2026-01-05', 'weekly', false)).toBe('2026-01-12');
  expect(goalEffectiveDate('2026-01-02', 'weekly', true)).toBe('2026-01-02');
});
it('limita consultas, valida escopos e exige alvo positivo ou ausência explícita de meta', () => {
  expect(productionQuerySchema.safeParse({ days: 367 }).success).toBe(false);
  expect(productionQuerySchema.safeParse({ days: 30, habitId: 'fake' }).success).toBe(false);
  const base = {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    expectedDate: '2026-01-02',
    habitId: null,
    cadence: 'daily',
    applyCurrent: false,
  };
  for (const targetMinutes of [0, -1, NaN, Infinity, 1441])
    expect(goalCommandSchema.safeParse({ ...base, targetMinutes }).success).toBe(false);
  expect(goalCommandSchema.safeParse({ ...base, targetMinutes: null }).success).toBe(true);
});
