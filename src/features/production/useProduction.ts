import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshBatch } from '../../design/refreshBatch';
import {
  goalCommandSchema,
  goalReplySchema,
  productionSnapshotSchema,
  type GoalCommand,
  type ProductionQuery,
  type ProductionSnapshot,
} from '../../../shared/contracts/production';
type Cursor = NonNullable<ProductionQuery['cursor']>;

export function useProduction(active: boolean, initialDays = 30, initialEndDate?: string) {
  const api = window.krono?.production;
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [query, setQuery] = useState<ProductionQuery>({
    days: initialDays,
    habitId: null,
    endDate: initialEndDate,
  });
  const [value, setValue] = useState<ProductionSnapshot | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const [trail, setTrail] = useState<(Cursor | null)[]>([]),
    cursor = useRef<Cursor | null>(null);
  const [options, setOptions] = useState<ProductionSnapshot['habits']>([]);
  const [today, setToday] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const alive = useRef(false),
    sequence = useRef(0),
    working = useRef(false),
    pending = useRef<GoalCommand | null>(null);
  const refresh = useCallback(async () => {
    if (!api || !active) return;
    const ticket = ++sequence.current;
    setLoading(true);
    if (query.habitId && window.krono?.habits) {
      try {
        const habits = await window.krono.habits.read();
        if (
          alive.current &&
          ticket === sequence.current &&
          !habits.habits.some((habit) => habit.id === query.habitId)
        ) {
          setQuery((current) => ({ days: current.days, endDate: current.endDate, habitId: null }));
          setValue(null);
          setTrail([]);
          cursor.current = null;
          setLoading(false);
          return;
        }
      } catch {
        /* Erro de leitura não deve apagar filtros; a consulta abaixo informa falhas. */
      }
    }
    try {
      const next = productionSnapshotSchema.parse(await api.read(query));
      if (alive.current && ticket === sequence.current) {
        setValue(next);
        setRefreshSequence((n) => n + 1);
        setToday(next.today);
        setOptions(next.habits);
        setTrail([]);
        cursor.current = null;
        setUpdateAvailable(false);
        setError(null);
      }
    } catch {
      if (alive.current && ticket === sequence.current)
        setError(
          'Não foi possível consultar a Produção. Os dados foram preservados; valores anteriores podem estar desatualizados.',
        );
    } finally {
      if (alive.current && ticket === sequence.current) setLoading(false);
    }
  }, [api, active, query]);
  useEffect(() => {
    alive.current = true;
    if (!active || !api)
      return () => {
        alive.current = false;
        ++sequence.current;
      };
    if (cursor.current) setUpdateAvailable(true);
    else void refresh();
    // O salvamento já aguarda uma leitura confirmada; seu próprio evento não a repete.
    const batch = refreshBatch(() => {
      if (working.current) return;
      if (cursor.current) setUpdateAvailable(true);
      else void refresh();
    });
    const invalidate = () => {
      if (!working.current) batch.schedule();
    };
    const resume = () => {
      if (!document.hidden) invalidate();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    const off = api.subscribe(invalidate);
    const offTimer = window.krono?.timer?.subscribe((snapshot) => {
      if (['idle', 'awaiting-next'].includes(snapshot.state)) invalidate();
    });
    return () => {
      alive.current = false;
      ++sequence.current;
      batch.cancel();
      off();
      offTimer?.();
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [active, api, refresh]);
  useEffect(() => {
    if (!active || !value) return;
    const timeout = setTimeout(() => {
      if (cursor.current) setUpdateAvailable(true);
      else void refresh();
    }, value.refreshAfterMs + 100);
    return () => clearTimeout(timeout);
  }, [active, value, refresh]);
  function filter(next: ProductionQuery) {
    if (working.current || pending.current) return;
    ++sequence.current;
    setValue(null);
    setError(null);
    setTrail([]);
    cursor.current = null;
    setQuery(next);
  }
  async function page(back: boolean) {
    if (!api || !value || loading || (back && !trail.length) || (!back && !value.nextCursor))
      return;
    const nextCursor = back ? trail.at(-1)! : value.nextCursor!,
      ticket = ++sequence.current;
    setLoading(true);
    try {
      const next = productionSnapshotSchema.parse(
        await api.read({
          days: value.days,
          endDate: value.endDate,
          habitId: value.habitId,
          ceiling: value.ceiling,
          ...(nextCursor ? { cursor: nextCursor } : {}),
        }),
      );
      if (alive.current && ticket === sequence.current) {
        setTrail(back ? trail.slice(0, -1) : [...trail, cursor.current]);
        cursor.current = nextCursor;
        setValue(next);
        setError(null);
      }
    } catch {
      if (alive.current && ticket === sequence.current)
        setError('Não foi possível carregar esta página. Tente novamente.');
    } finally {
      if (alive.current && ticket === sequence.current) setLoading(false);
    }
  }
  async function save(
    cadence: GoalCommand['cadence'],
    targetMinutes: number | null,
    applyCurrent: boolean,
    retry = false,
  ): Promise<boolean> {
    if (!api || !value || working.current || (pending.current && !retry)) return false;
    const input = retry
      ? pending.current
      : {
          commandId: crypto.randomUUID(),
          expectedRevision: value.goals.revision,
          expectedDate: value.today,
          habitId: value.habitId,
          cadence,
          targetMinutes,
          applyCurrent,
        };
    const parsed = goalCommandSchema.safeParse(input);
    if (!parsed.success) {
      setGoalError('Informe uma meta positiva dentro do limite, ou escolha Sem meta.');
      return false;
    }
    working.current = true;
    pending.current = parsed.data;
    setSaving(true);
    try {
      const reply = goalReplySchema.parse(await api.command(parsed.data));
      if (reply.code === 'storage-error') {
        setGoalError('Não foi possível confirmar a meta. Tente novamente com o mesmo comando.');
        return false;
      }
      pending.current = null;
      setGoalError(
        reply.code === 'ok'
          ? null
          : reply.code === 'conflict'
            ? 'A data ou as metas mudaram. Confira os dados atualizados e repita a ação.'
            : 'Não é possível alterar esta meta neste momento.',
      );
      await refresh();
      return reply.code === 'ok';
    } catch {
      setGoalError('Falha de comunicação. Repita o mesmo comando para evitar duplicação.');
      return false;
    } finally {
      working.current = false;
      setSaving(false);
    }
  }
  return {
    refreshSequence,
    live: !!api,
    value,
    today,
    query,
    options,
    error,
    goalError,
    loading,
    saving,
    updateAvailable,
    blocked: !!pending.current,
    pageNumber: trail.length + 1,
    filter,
    refresh,
    page,
    save,
    retry: () => save('daily', null, false, true),
  };
}
export type ProductionModel = ReturnType<typeof useProduction>;
