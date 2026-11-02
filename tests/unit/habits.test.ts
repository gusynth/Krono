import { describe, expect, it } from 'vitest';
import {
  habitCommandSchema,
  frequencySchema,
  localDateSchema,
} from '../../shared/contracts/habits';
import {
  addDays,
  civilDate,
  nextCivilDay,
  occurrence,
  scheduled,
  statistics,
  type HabitVersion,
} from '../../shared/domain/habits';

describe('calendário civil de hábitos', () => {
  it('valida datas, anos bissextos e dias específicos sem duplicatas', () => {
    expect(localDateSchema.safeParse('2024-02-29').success).toBe(true);
    for (const date of ['2026-02-29', '2026-04-31', '2026-13-01'])
      expect(localDateSchema.safeParse(date).success).toBe(false);
    expect(frequencySchema.safeParse({ kind: 'specific', days: [] }).success).toBe(false);
    expect(frequencySchema.safeParse({ kind: 'specific', days: [1, 1] }).success).toBe(false);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('resolve todas as frequências sem deslocar a âncora alternada', () => {
    expect(scheduled('2026-01-04', { kind: 'daily' })).toBe(true);
    expect(scheduled('2026-01-04', { kind: 'weekdays' })).toBe(false);
    expect(scheduled('2026-01-05', { kind: 'weekdays' })).toBe(true);
    expect(scheduled('2026-01-04', { kind: 'specific', days: [0, 3] })).toBe(true);
    expect(scheduled('2026-01-05', { kind: 'specific', days: [0, 3] })).toBe(false);
    const frequency = { kind: 'alternate', anchor: '2026-01-01' } as const;
    for (const day of ['2026-01-01', '2026-01-03', '2026-01-05'])
      expect(scheduled(day, frequency)).toBe(true);
    expect(scheduled('2026-01-04', frequency)).toBe(false);
    expect(scheduled('2024-03-01', { kind: 'alternate', anchor: '2024-02-28' })).toBe(true);
    expect(scheduled('2100-03-01', { kind: 'alternate', anchor: '2100-02-28' })).toBe(false);
  });
  it('mapeia meia-noite e agenda virada em dias de 23 e 25 horas', () => {
    expect(civilDate(Date.parse('2026-01-02T01:00:00Z'), 'America/Sao_Paulo')).toBe('2026-01-01');
    expect(nextCivilDay(Date.parse('2026-03-08T05:00:00Z'), 'America/New_York')).toBe(
      23 * 3_600_000,
    );
    expect(nextCivilDay(Date.parse('2026-11-01T04:00:00Z'), 'America/New_York')).toBe(
      25 * 3_600_000,
    );
  });
  it('preserva vigências e descanso/arquivamento, incluindo antes do início e futuro', () => {
    const versions: HabitVersion[] = [
      { date: '2026-01-01', active: true, frequency: { kind: 'daily' }, targetMinutes: 25 },
      { date: '2026-01-03', active: false, frequency: { kind: 'daily' }, targetMinutes: 25 },
      { date: '2026-01-05', active: true, frequency: { kind: 'weekdays' }, targetMinutes: 30 },
    ];
    const day = (date: string, ms = 0) =>
      occurrence(date, '2026-01-05', versions, false, ms, 'time').status;
    expect(day('2025-12-31')).toBe('not-applicable');
    expect(day('2026-01-01', 25 * 60_000)).toBe('completed');
    expect(day('2026-01-02')).toBe('missed');
    expect(day('2026-01-03')).toBe('not-applicable');
    expect(day('2026-01-05', 25 * 60_000)).toBe('pending');
    expect(day('2026-01-05', 30 * 60_000)).toBe('completed');
    expect(day('2026-01-06')).toBe('future');
  });
  it('conta ocorrências, mantém sequência com hoje aberto e distingue ausência de base', () => {
    const stats = (...states: string[]) => statistics(states.map((status) => ({ status })));
    expect(stats('missed', 'completed', 'rest', 'completed', 'pending')).toEqual({
      streak: 2,
      completed: 2,
      expected: 4,
    });
    expect(stats('completed', 'missed', 'pending').streak).toBe(0);
    expect(stats('rest', 'future')).toEqual({ streak: 0, completed: 0, expected: 0 });
  });
  it('recusa datas e campos extras em comando manual', () => {
    expect(
      habitCommandSchema.safeParse({
        commandId: crypto.randomUUID(),
        expectedRevision: 0,
        action: 'check',
        habitId: crypto.randomUUID(),
        date: '2020-01-01',
      }).success,
    ).toBe(false);
  });
});
