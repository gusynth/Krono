import { localDateSchema } from '../contracts/habits';
import { addDays } from './habits';

export const displayDate = (value: string) => value.split('-').reverse().join('/');
export function parseDisplayDate(value: string): string | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
  const date = value.split('/').reverse().join('-');
  return localDateSchema.safeParse(date).success ? date : null;
}
export function shiftMonth(value: string, count: number): string {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  const first = date.toISOString().slice(0, 10);
  if (!localDateSchema.safeParse(first).success) return value;
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  const day = Math.min(Number(value.slice(8)), date.getUTCDate());
  return `${first.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}
export function monthGrid(value: string): (string | null)[] {
  const first = `${value.slice(0, 7)}-01`;
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(first, index - weekday);
    return localDateSchema.safeParse(date).success ? date : null;
  });
}
