import type { Frequency } from '../contracts/habits';

/** Aritmética de calendário em UTC ao meio-dia; não mede duração de dias locais. */
export function addDays(date: string, count: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function civilDate(now: number, timezone: string): string {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    if (formatters.size >= 16) formatters.delete(formatters.keys().next().value!);
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nextCivilDay(now: number, timezone: string): number {
  const today = civilDate(now, timezone);
  let low = now + 1,
    high = now + 27 * 3_600_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (civilDate(middle, timezone) === today) low = middle + 1;
    else high = middle;
  }
  return low - now;
}
export function scheduled(date: string, frequency: Frequency): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  switch (frequency.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return day > 0 && day < 6;
    case 'specific':
      return frequency.days.includes(day);
    case 'alternate': {
      // Datas normalizadas no calendário gregoriano, nunca timestamps de meia-noite no fuso.
      const ordinal = (value: string) => {
        const [year, month, day] = value.split('-').map(Number),
          previous = year - 1;
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return (
          previous * 365 +
          Math.floor(previous / 4) -
          Math.floor(previous / 100) +
          Math.floor(previous / 400) +
          [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1] +
          (leap && month > 2 ? 1 : 0) +
          day
        );
      };
      return Math.abs(ordinal(date) - ordinal(frequency.anchor)) % 2 === 0;
    }
  }
}
export interface HabitVersion {
  date: string;
  active: boolean;
  frequency: Frequency;
  targetMinutes: number;
}
export function occurrence(
  date: string,
  today: string,
  versions: HabitVersion[],
  checked: boolean,
  durationMs: number,
  kind: 'action' | 'time',
) {
  const version = versions.findLast((value) => value.date <= date);
  const status =
    date > today
      ? 'future'
      : !version?.active
        ? 'not-applicable'
        : !scheduled(date, version.frequency)
          ? 'rest'
          : (kind === 'action' ? checked : durationMs >= version.targetMinutes * 60_000)
            ? 'completed'
            : date === today
              ? 'pending'
              : 'missed';
  return { date, status, durationMs } as const;
}
export function statistics(days: { status: string }[]) {
  let streak = 0;
  for (const day of [...days].reverse()) {
    if (day.status === 'missed') break;
    if (day.status === 'completed') streak++;
  }
  return {
    streak,
    completed: days.filter((d) => d.status === 'completed').length,
    expected: days.filter((d) => ['completed', 'missed', 'pending'].includes(d.status)).length,
  };
}
