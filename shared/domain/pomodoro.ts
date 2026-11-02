import {
  defaultTimerConfiguration,
  timerConfigurationSchema,
  type TimerConfiguration,
  type Preset,
} from '../contracts/timer';

/** Proporção de produto 25:5:15; não representa um intervalo científico universal. */
export function configuredPreset(input: TimerConfiguration = defaultTimerConfiguration): Preset {
  const config = timerConfigurationSchema.parse(input);
  return {
    focusMs: config.focusMinutes * 60_000,
    shortBreakMs: config.proportional
      ? config.focusMinutes * 12_000
      : config.shortBreakMinutes * 60_000,
    longBreakMs: config.proportional
      ? config.focusMinutes * 36_000
      : config.longBreakMinutes * 60_000,
    longEvery: config.longEvery,
  };
}

export function timerDurationLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} s` : ''}`;
}
