import { useEffect, useRef, useState } from 'react';
import {
  acceptsTimerSnapshot,
  timerReplySchema,
  timerSnapshotSchema,
  type TimerCommand,
  type TimerSnapshot,
  type TimerConfiguration,
} from '../../../shared/contracts/timer';
import { initialTimer, snapshot } from '../../../shared/domain/timer';

export function useFocusTimer(active: boolean) {
  const api = window.krono?.timer;
  const [value, setValue] = useState<TimerSnapshot>(() => snapshot(initialTimer()));
  const current = useRef(value);
  const anchor = useRef(performance.now());
  const [civilNow, setCivilNow] = useState(Date.now);
  const [now, setNow] = useState(() => performance.now());
  const [busy, setBusy] = useState(Boolean(api));
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(!api);
  useEffect(() => {
    if (!api) return;
    let mounted = true;
    const accept = (input: unknown) => {
      if (!mounted) return;
      const next = timerSnapshotSchema.parse(input);
      if (!acceptsTimerSnapshot(current.current, next)) return;
      current.current = next;
      anchor.current = performance.now();
      setValue(next);
      setNow(performance.now());
      setCivilNow(Date.now());
    };
    const unsubscribe = api.subscribe((input) => {
      try {
        accept(input);
      } catch {
        if (mounted) {
          setUnavailable(true);
          setError('Resposta inválida do temporizador. Feche e reabra o aplicativo.');
        }
      }
    });
    void api
      .read()
      .then(accept)
      .catch(() => {
        if (mounted) {
          setUnavailable(true);
          setError('Temporizador indisponível. Feche e reabra o aplicativo.');
        }
      })
      .finally(() => {
        if (mounted) {
          setReady(true);
          setBusy(false);
        }
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [api]);
  useEffect(() => {
    if (!api || !active || unavailable || value.state !== 'running') return;
    const frame = requestAnimationFrame(() => {
      setNow(performance.now());
      setCivilNow(Date.now());
    });
    const interval = setInterval(() => {
      setNow(performance.now());
      setCivilNow(Date.now());
    }, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [api, active, unavailable, value.state]);
  const extra =
    api && !unavailable && value.state === 'running' ? Math.max(0, now - anchor.current) : 0;
  const remaining = value.remainingMs === null ? null : Math.max(0, value.remainingMs - extra);
  async function send(
    action: TimerCommand['action'],
    phase?: TimerCommand['phase'],
    configuration?: TimerConfiguration,
    singleFocus?: boolean,
  ) {
    if (busy || !api) return false;
    setBusy(true);
    setError(null);
    const latest = current.current;
    try {
      const reply = timerReplySchema.parse(
        await api.command({
          commandId: crypto.randomUUID(),
          expectedRevision: latest.revision,
          sessionId: latest.sessionId,
          action,
          ...(phase ? { phase } : {}),
          ...(configuration ? { configuration } : {}),
          ...(singleFocus !== undefined ? { singleFocus } : {}),
        }),
      );
      if (acceptsTimerSnapshot(current.current, reply.snapshot, action === 'retry')) {
        current.current = reply.snapshot;
        anchor.current = performance.now();
        setValue(reply.snapshot);
        setNow(performance.now());
        setCivilNow(Date.now());
      }
      if (reply.code === 'conflict')
        setError('O estado da sessão mudou. Confira e tente novamente.');
      if (reply.code === 'invalid') setError('Ação indisponível para o estado atual da sessão.');
      return reply.code === 'ok';
    } catch {
      setUnavailable(true);
      setError(
        'Não foi possível confirmar a ação. Recarregue para consultar o estado salvo antes de tentar novamente.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    civilNow,
    live: Boolean(api),
    value,
    remaining,
    elapsed: value.elapsedMs + extra,
    busy,
    error,
    ready: ready && !unavailable,
    unavailable,
    send,
  };
}
