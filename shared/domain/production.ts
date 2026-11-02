import { addDays } from './habits';

export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function dateRange(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDays(end, index - days + 1));
}
export function comparisonWindow(start: string, days: number, end: string, today: string) {
  const closedDays = end === today ? days - 1 : days;
  return {
    days: closedDays,
    currentEnd: addDays(start, closedDays - 1),
    previousStart: addDays(start, -closedDays),
    previousEnd: addDays(start, -1),
  };
}
export function changePercent(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) * 100) / previous : null;
}
export function goalProgress(actualMs: number, targetMs: number | null) {
  const percent = targetMs && targetMs > 0 ? (actualMs * 100) / targetMs : null;
  return { percent, ringPercent: percent === null ? 0 : Math.min(100, percent) };
}
export function goalEffectiveDate(
  today: string,
  cadence: 'daily' | 'weekly',
  applyCurrent: boolean,
): string {
  return applyCurrent
    ? today
    : cadence === 'daily'
      ? addDays(today, 1)
      : addDays(weekStart(today), 7);
}
