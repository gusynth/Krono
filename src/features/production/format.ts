export const dateLabel = (date: string) => date.split('-').reverse().join('/');
const timeFormats = new Map<string, Intl.DateTimeFormat>();
export function timeLabel(utcMs: number, timezone: string) {
  let format = timeFormats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    });
    if (timeFormats.size >= 16) timeFormats.delete(timeFormats.keys().next().value!);
    timeFormats.set(timezone, format);
  }
  return format.format(utcMs);
}
export function durationLabel(ms: number): string {
  const seconds = Math.round(ms / 1000),
    hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    rest = seconds % 60;
  return [
    hours ? `${hours} h` : '',
    minutes ? `${minutes} min` : '',
    rest || !seconds ? `${rest} s` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
