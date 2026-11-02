import { it, expect } from 'vitest';
import { timeLabel } from '../../src/features/production/format';
it('formatação de horário conserva fuso e virada civil com cache limitado', () => {
  const instant = Date.UTC(2026, 0, 1, 1, 30);
  expect(timeLabel(instant, 'UTC')).toBe('01:30');
  expect(timeLabel(instant, 'America/Sao_Paulo')).toBe('22:30');
  for (let index = 0; index < 20; index++)
    timeLabel(instant, `Etc/GMT${index % 2 ? '+' : '-'}${index % 12}`);
  expect(timeLabel(instant, 'America/Sao_Paulo')).toBe('22:30');
});
