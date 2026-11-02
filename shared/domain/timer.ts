import {
  defaultPreset,
  type Preset,
  type TimerPhase,
  type TimerRecord,
  type TimerSession,
  type TimerSnapshot,
} from '../contracts/timer';
import { configuredPreset } from './pomodoro';

export interface Clock {
  monotonic: () => number;
  civil: () => number;
}
export const initialTimer = (): TimerRecord => ({
  version: 1,
  revision: 0,
  state: 'idle',
  phase: 'focus',
  nextPhase: 'focus',
  cycle: 0,
  session: null,
});
export const activeMs = (session: TimerSession | null) =>
  session?.segments.reduce((sum, segment) => sum + segment.durationMs, 0) ?? 0;
export const canEndCycle = (record: TimerRecord) =>
  record.state !== 'idle' || record.cycle > (record.cycleBase ?? 0);
/** Resets the group without changing historical completion counts or results. */
export function closeCycle(record: TimerRecord, date: string, focusCompleted = false): TimerRecord {
  return {
    ...record,
    state: 'idle',
    phase: 'focus',
    nextPhase: 'focus',
    session: null,
    cycleBase: record.cycle,
    cycleDate: date,
    singleFocus: false,
    focusCompleted,
  };
}
export function duration(phase: TimerPhase, preset: Preset = defaultPreset): number | null {
  return phase === 'free'
    ? null
    : phase === 'focus'
      ? preset.focusMs
      : phase === 'short-break'
        ? preset.shortBreakMs
        : preset.longBreakMs;
}
export function snapshot(
  record: TimerRecord,
  extraMs = 0,
  error: string | null = null,
): TimerSnapshot {
  const limit = duration(
    record.phase,
    record.session?.preset ?? configuredPreset(record.configuration),
  );
  const elapsed = Math.min(activeMs(record.session) + extraMs, limit ?? Number.MAX_SAFE_INTEGER);
  const longEvery =
    record.session?.preset.longEvery ?? configuredPreset(record.configuration).longEvery;
  const startsNewGroup =
    record.state === 'idle' &&
    record.configuration &&
    record.configuration.longEvery !== (record.cycleEvery ?? defaultPreset.longEvery);
  const completed = startsNewGroup ? 0 : record.cycle - (record.cycleBase ?? 0);
  const focusNumber =
    record.state === 'awaiting-next' || record.phase !== 'focus'
      ? (Math.max(0, completed - 1) % longEvery) + 1
      : (completed % longEvery) + 1;
  return {
    version: 1,
    focusNumber,
    longEvery,
    singleFocus: record.session?.singleFocus ?? record.singleFocus ?? false,
    canEndCycle: canEndCycle(record),
    focusCompleted: record.focusCompleted ?? false,
    revision: record.revision,
    state: error ? 'storage-error' : record.state,
    phase: record.phase,
    nextPhase: record.nextPhase,
    cycle: record.cycle,
    sessionId: record.session?.id ?? null,
    durationMs: limit,
    elapsedMs: elapsed,
    remainingMs: limit === null ? null : Math.max(0, limit - elapsed),
    message:
      error ??
      (record.state === 'recovering'
        ? 'Sessão interrompida. Recupere o tempo confirmado ou descarte. O intervalo offline não foi contado.'
        : null),
    ...(record.configuration ? { configuration: record.configuration } : {}),
    ...(record.session
      ? { activePreset: record.session.preset, habitId: record.session.habitId ?? null }
      : {}),
  };
}
export function complete(record: TimerRecord): TimerRecord {
  const cycle = record.cycle + (record.phase === 'focus' ? 1 : 0);
  const nextPhase =
    record.phase === 'focus'
      ? (cycle - (record.cycleBase ?? 0)) % (record.session?.preset.longEvery ?? 4) === 0
        ? 'long-break'
        : 'short-break'
      : 'focus';
  return { ...record, state: 'awaiting-next', nextPhase, cycle };
}

// Divide por calendário civil. Busca o limite da data no fuso, inclusive dias de 23/25 h.
export function allocateDays(session: TimerSession): { date: string; durationMs: number }[] {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: session.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const date = (utc: number) => {
    const parts = formatter.formatToParts(utc);
    return ['year', 'month', 'day']
      .map((key) => parts.find((part) => part.type === key)!.value)
      .join('-');
  };
  const totals = new Map<string, number>();
  for (const segment of session.segments) {
    let cursor = segment.startUtcMs;
    const end = cursor + segment.durationMs;
    while (cursor < end) {
      const day = date(cursor);
      let boundary = end;
      if (date(end - 1) !== day) {
        let low = cursor + 1,
          high = Math.min(end, cursor + 27 * 3_600_000);
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (date(middle) === day) low = middle + 1;
          else high = middle;
        }
        boundary = low;
      }
      totals.set(day, (totals.get(day) ?? 0) + boundary - cursor);
      cursor = boundary;
    }
  }
  return [...totals].map(([date, durationMs]) => ({ date, durationMs }));
}
