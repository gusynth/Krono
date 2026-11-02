import { useEffect, useState } from 'react';
import { goalsSnapshotSchema, type GoalsSnapshot } from '../../../shared/contracts/production';
import { durationLabel } from './format';
export function DailyGoalContext({ active }: { active: boolean }) {
  const [value, setValue] = useState<GoalsSnapshot | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const api = window.krono?.production;
    if (!api || !active) return;
    let alive = true,
      sequence = 0,
      timeout: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const ticket = ++sequence;
      try {
        const next = goalsSnapshotSchema.parse(await api.goals());
        if (alive && ticket === sequence) {
          setValue(next);
          setError(false);
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            void read();
          }, next.refreshAfterMs + 100);
        }
      } catch {
        if (alive && ticket === sequence) setError(true);
      }
    };
    const resume = () => {
      if (!document.hidden) void read();
    };
    void read();
    const off = api.subscribe(() => {
        void read();
      }),
      offTimer = window.krono?.timer?.subscribe((snapshot) => {
        if (['idle', 'awaiting-next'].includes(snapshot.state)) void read();
      });
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      alive = false;
      clearTimeout(timeout);
      off();
      offTimer?.();
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [active]);
  return (
    <strong>
      {error
        ? 'Meta indisponível'
        : value?.daily.definition?.targetMs
          ? `${durationLabel(value.daily.actualMs)} / ${durationLabel(value.daily.definition.targetMs)}`
          : value?.daily.pending?.targetMs
            ? 'Meta agendada'
            : window.krono?.production && !value
              ? 'Carregando…'
              : 'Sem meta'}
    </strong>
  );
}
