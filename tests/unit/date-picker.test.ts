import { expect, it } from 'vitest';
import {
  displayDate,
  monthGrid,
  parseDisplayDate,
  shiftMonth,
} from '../../shared/domain/date-picker';
import { habitInputSchema } from '../../shared/contracts/habits';

it('datas digitadas são civis e recusam formatos incompletos ou dias inexistentes', () => {
  expect(parseDisplayDate('29/02/2028')).toBe('2028-02-29');
  for (const invalid of [
    '29/02/2026',
    '31/04/2026',
    '1/1/2026',
    '19/10/',
    '2026-10-19',
    '00/12/2026',
  ])
    expect(parseDisplayDate(invalid)).toBeNull();
  expect(displayDate('2026-10-19')).toBe('19/10/2026');
});
it('navegação de mês conserva o dia quando possível e limita no fim do mês', () => {
  expect(shiftMonth('2028-01-31', 1)).toBe('2028-02-29');
  expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28');
  expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
  expect(shiftMonth('2028-02-29', 12)).toBe('2029-02-28');
  expect(shiftMonth('9999-12-31', 1)).toBe('9999-12-31');
});
it('grade inicia segunda e conserva os 42 dias em viradas de mês/ano e DST', () => {
  const january = monthGrid('2026-01-01');
  expect(january).toHaveLength(42);
  expect(january[0]).toBe('2025-12-29');
  expect(january[41]).toBe('2026-02-08');
  expect(monthGrid('2028-02-01')).toContain('2028-02-29');
  for (const month of ['2026-03-01', '2026-11-01']) {
    const grid = monthGrid(month);
    expect(new Set(grid).size).toBe(42);
    expect(grid.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day!))).toBe(true);
  }
});
it('ícone é opcional em cadastro legado; catálogo recusa valores arbitrários', () => {
  const input = { name: 'Treino', kind: 'action', frequency: { kind: 'daily' }, targetMinutes: 25 };
  expect(habitInputSchema.safeParse(input).success).toBe(true);
  expect(habitInputSchema.parse({ ...input, icon: 'dumbbell' }).icon).toBe('dumbbell');
  for (const icon of ['https://external', '<svg>', 'unknown'])
    expect(habitInputSchema.safeParse({ ...input, icon }).success).toBe(false);
});
