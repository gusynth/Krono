import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopSnapshotSchema, type DesktopSnapshot } from '../../../shared/contracts/desktop';
export function useIntroduction() {
  const api = window.krono?.desktop,
    latest = useRef<DesktopSnapshot | null>(null),
    working = useRef(false);
  const [value, setValue] = useState<DesktopSnapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const accept = (input: unknown) => {
      const next = desktopSnapshotSchema.parse(input);
      if (alive && (!latest.current || next.revision >= latest.current.revision)) {
        latest.current = next;
        setValue(next);
      }
    };
    const off = api.subscribe((input) => {
      try {
        accept(input);
      } catch {
        if (alive) setError('Não foi possível consultar a apresentação.');
      }
    });
    void api
      .read()
      .then(accept)
      .catch(() => {
        if (alive) setError('Não foi possível consultar a apresentação.');
      });
    return () => {
      alive = false;
      off();
    };
  }, [api]);
  const save = useCallback(
    async (step: number, completed: boolean, gardenEnabled?: boolean) => {
      if (!api) return true;
      if (!latest.current || working.current) return false;
      working.current = true;
      setBusy(true);
      setError(null);
      try {
        const introduction = { version: 1 as const, step, completed };
        const current = desktopSnapshotSchema.parse(await api.read());
        const next = desktopSnapshotSchema.parse(
          await api.update({
            expectedRevision: current.preferences.revision,
            patch: {
              introduction,
              ...(gardenEnabled === undefined
                ? {}
                : {
                    garden: {
                      version: 1 as const,
                      introductionSeen: current.preferences.garden?.introductionSeen ?? false,
                      enabled: gardenEnabled,
                    },
                  }),
            },
          }),
        );
        if (
          next.error ||
          (gardenEnabled !== undefined && next.preferences.garden?.enabled !== gardenEnabled) ||
          JSON.stringify(next.preferences.introduction) !== JSON.stringify(introduction)
        )
          throw new Error('INTRODUCTION_NOT_SAVED');
        latest.current = next;
        setValue(next);
        return true;
      } catch {
        setError(
          'Não foi possível salvar esta etapa. Tente novamente. Seus dados foram preservados.',
        );
        return false;
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [api],
  );
  return { value, busy, error, save };
}
