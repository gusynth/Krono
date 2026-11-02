export function timezoneLabel(value: string): string {
  if (value === 'America/Sao_Paulo') return 'São Paulo';
  if (value === 'UTC') return 'UTC';
  return value.split('/').slice(-1)[0].replaceAll('_', ' ');
}
