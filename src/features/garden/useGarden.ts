import { useCallback, useEffect, useRef, useState } from 'react';
import { gardenSnapshotSchema, type GardenSnapshot } from '../../../shared/contracts/garden';
import { timerSnapshotSchema } from '../../../shared/contracts/timer';
import { refreshBatch } from '../../design/refreshBatch';

export function useGarden(active: boolean) {
  const api = window.krono?.production;
  const [value, setValue] = useState<GardenSnapshot | null>(null),
    [error, setError] = useState<string | null>(null),
    [working, setWorking] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!active || !api) return;
    const ticket = ++generation.current;
    try {
      const next = gardenSnapshotSchema.parse(await api.garden());
      if (ticket === generation.current) {
        setValue(next);
        setError(null);
      }
    } catch {
      if (ticket === generation.current)
        setError('Não foi possível consultar seu jardim. Seu histórico continua preservado.');
    }
  }, [active, api]);
  useEffect(() => {
    if (!active || !api) return;
    let alive = true,
      lastKey: string | undefined;
    const batch = refreshBatch(() => {
      void refresh();
    });
    const accept = (raw: unknown) => {
      try {
        const s = timerSnapshotSchema.parse(raw);
        if (!alive) return;
        setWorking(s.state === 'running' && (s.phase === 'focus' || s.phase === 'free'));
        const key = `${s.sessionId}:${s.state}`;
        if (key !== lastKey) {
          if (lastKey !== undefined && (s.state === 'awaiting-next' || s.state === 'idle'))
            batch.schedule();
          lastKey = key;
        }
      } catch {
        if (alive) setWorking(false);
      }
    };
    void refresh();
    void window.krono?.timer
      ?.read()
      .then(accept)
      .catch(() => {
        if (alive) setWorking(false);
      });
    const off = window.krono?.timer?.subscribe(accept),
      offProduction = api.subscribe(() => batch.schedule());
    return () => {
      alive = false;
      ++generation.current;
      batch.cancel();
      off?.();
      offProduction();
    };
  }, [active, api, refresh]);
  return { value, error, working, refresh };
}
