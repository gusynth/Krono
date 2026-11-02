import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshBatch } from '../../design/refreshBatch';
import {
  habitCommandSchema,
  habitReplySchema,
  habitsSnapshotSchema,
  type HabitCommand,
  type HabitsSnapshot,
} from '../../../shared/contracts/habits';

export function useHabits() {
  const api = window.krono?.habits;
  const [value, setValue] = useState<HabitsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const pending = useRef<HabitCommand | null>(null),
    working = useRef(false),
    mounted = useRef(false);
  const accept = useCallback(
    (next: HabitsSnapshot) =>
      setValue((previous) => (!previous || next.revision >= previous.revision ? next : previous)),
    [],
  );
  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const next = habitsSnapshotSchema.parse(await api.read());
      if (mounted.current) {
        accept(next);
        if (!pending.current) setError(null);
      }
    } catch {
      if (mounted.current)
        setError('Não foi possível ler os hábitos. Os registros foram preservados.');
    }
  }, [api, accept]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const batch = refreshBatch(() => {
      void refresh();
    });
    const resume = () => {
      if (!document.hidden) batch.schedule();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    const off = window.krono?.timer?.subscribe((snapshot) => {
      if (snapshot.state === 'awaiting-next') batch.schedule();
    });
    return () => {
      mounted.current = false;
      batch.cancel();
      off?.();
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);
  // Um único despertar na próxima virada civil; sem loop de consulta por segundo.
  useEffect(() => {
    if (!value) return;
    const timeout = setTimeout(() => {
      void refresh();
    }, value.refreshAfterMs + 100);
    return () => clearTimeout(timeout);
  }, [value, refresh]);
  async function send(
    action: HabitCommand['action'],
    habitId: string | null,
    extra: Pick<HabitCommand, 'input' | 'applyToday' | 'confirmPermanent'> = {},
    retry = false,
  ): Promise<boolean> {
    if (!api || working.current || !value || (pending.current && !retry)) return false;
    const expectedDate = value.habits.find((habit) => habit.id === habitId)?.today.date;
    const command = retry
      ? pending.current!
      : {
          commandId: crypto.randomUUID(),
          expectedRevision: value.revision,
          action,
          habitId,
          ...(['check', 'undo'].includes(action) ? { expectedDate } : {}),
          ...extra,
        };
    const parsed = habitCommandSchema.safeParse(command);
    if (!parsed.success) {
      setError('Revise o nome, a frequência e a meta do hábito.');
      return false;
    }
    working.current = true;
    setBusy(true);
    pending.current = parsed.data;
    try {
      const reply = habitReplySchema.parse(await api.command(parsed.data));
      if (!mounted.current) return false;
      if (reply.snapshot) accept(reply.snapshot);
      if (reply.code === 'storage-error') {
        setError('Não foi possível salvar. Tente novamente com o mesmo comando.');
        return false;
      }
      pending.current = null;
      setError(
        reply.code === 'ok'
          ? null
          : reply.code === 'conflict'
            ? 'Os dados mudaram. Confira o estado atualizado e repita a ação.'
            : 'Esta ação não é permitida para o hábito neste momento.',
      );
      return reply.code === 'ok';
    } catch {
      if (mounted.current)
        setError('Falha de comunicação. Tente novamente; o comando não será duplicado.');
      return false;
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    live: !!api,
    value,
    error,
    busy,
    blocked: !!pending.current,
    refresh,
    send,
    retry: () => send('select', null, {}, true),
  };
}
export type HabitsModel = ReturnType<typeof useHabits>;
