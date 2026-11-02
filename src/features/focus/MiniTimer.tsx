import { FinishEstimate } from './FinishEstimate';
import { useContentMotion } from '../../design/useContentMotion';
import { FocusCycleActions } from './FocusCycleActions';
import { AppDialog } from '../../design/AppDialog';
import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, Pin, Play, Pause, Link2 } from 'lucide-react';
import { miniStateSchema, type MiniAction } from '../../../shared/contracts/mini';
import { useFocusTimer } from './useFocusTimer';
import { WindowTitlebar } from '../../design/WindowTitlebar';
import symbol from '../../../assets/desktop/brand/cronus-256.png';

export function useMiniMode() {
  const [value, setValue] = useState({ active: false, pinned: false, comfortable: false }),
    [error, setError] = useState<string | null>(null);
  const api = window.krono?.mini;
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const accept = (input: unknown) => {
      if (alive) setValue({ comfortable: false, ...miniStateSchema.parse(input) });
    };
    const off = api.subscribe((input) => {
      try {
        accept(input);
      } catch {
        setError('Resposta inválida da janela.');
      }
    });
    void api
      .command('read')
      .then(accept)
      .catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, [api]);
  async function command(action: MiniAction) {
    if (!api) return;
    try {
      setValue({ comfortable: false, ...miniStateSchema.parse(await api.command(action)) });
      setError(null);
    } catch {
      setError('Não foi possível alterar o modo da janela.');
    }
  }
  return { ...value, error, available: !!api, command };
}
export function MiniTimer({
  active,
  pinned,
  comfortable,
  habitNames,
  command,
  reducedMotion = false,
}: {
  reducedMotion?: boolean;
  active: boolean;
  pinned: boolean;
  comfortable?: boolean;
  habitNames?: Record<string, string>;
  command: (action: MiniAction) => Promise<void>;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const timer = useFocusTimer(active),
    state = timer.value.state;
  const total = timer.value.durationMs || 1_500_000;
  const currentMs = timer.remaining ?? timer.elapsed;
  const seconds = Math.ceil(currentMs / 1000);
  const progress =
    timer.remaining === null
      ? 0
      : Math.min(100, Math.max(0, ((total - timer.remaining) / total) * 100));
  const isBreak = timer.value.phase.includes('break');
  const phaseLabel =
    timer.value.phase === 'long-break' ? 'Pausa longa' : isBreak ? 'Pausa curta' : 'Foco';
  const label =
    state === 'running'
      ? 'Pausar'
      : state === 'paused'
        ? 'Retomar'
        : state === 'recovering'
          ? 'Recuperar sessão'
          : state === 'storage-error'
            ? 'Tentar salvar novamente'
            : state === 'awaiting-next'
              ? `Iniciar ${timer.value.nextPhase === 'focus' ? 'foco' : timer.value.nextPhase === 'long-break' ? 'pausa longa' : 'pausa curta'}`
              : `Iniciar ${phaseLabel.toLocaleLowerCase('pt-BR')}`;
  const reduce = reducedMotion || !active;
  const phaseMotion = useContentMotion<HTMLSpanElement>(phaseLabel, reduce);
  const digitsMotion = useContentMotion<HTMLElement>(
    `${phaseLabel}:${state === 'awaiting-next' ? 'completed' : 'active'}`,
    reduce,
  );
  const status =
    state === 'running'
      ? 'Em andamento'
      : state === 'paused'
        ? 'Pausado'
        : state === 'awaiting-next'
          ? 'Etapa concluída'
          : state === 'recovering'
            ? 'Recuperação pendente'
            : state === 'storage-error'
              ? 'Verifique o armazenamento'
              : timer.value.focusCompleted
                ? 'Foco concluído'
                : 'Pronto para iniciar';
  const statusMotion = useContentMotion(status, reduce);
  const habit = timer.value.habitId ? habitNames?.[timer.value.habitId] : undefined;
  const actionMotion = useContentMotion<HTMLButtonElement>(label, reduce);
  return (
    <section
      className="mini-timer"
      aria-label="Mini temporizador"
      data-phase={isBreak ? 'rest' : 'focus'}
      data-state={state}
      data-comfortable={!!comfortable}
    >
      <WindowTitlebar compact />
      <header className="mini-toolbar">
        <div className="mini-brand">
          <img src={symbol} width="18" height="18" alt="" />
          <span>Krono</span>
        </div>
        <button
          className="mini-size"
          onClick={() => {
            void command('size');
          }}
          aria-label={comfortable ? 'Diminuir mini timer' : 'Ampliar mini timer'}
        >
          {comfortable ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </header>
      <div className="mini-card">
        <div className="mini-context">
          <span ref={phaseMotion} className="mini-badge" data-phase={isBreak ? 'rest' : 'focus'}>
            {phaseLabel}
          </span>
          <span className="mini-habit" title={habit ?? 'Sessão sem hábito vinculado'}>
            <Link2 size={12} aria-hidden="true" />
            <span>{habit ?? 'Sem vínculo'}</span>
          </span>
        </div>
        <span ref={statusMotion} className="mini-status" role="status">
          {status}
        </span>
        <strong ref={digitsMotion} className="mini-digits" aria-live="off">
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:
          {String(seconds % 60).padStart(2, '0')}
        </strong>
        {comfortable && (
          <FinishEstimate now={timer.civilNow} state={state} remaining={timer.remaining} />
        )}
        <div className="mini-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="mini-actions">
          <button
            className="mini-control"
            aria-label="Manter mini timer no topo"
            aria-pressed={pinned}
            title={pinned ? 'Desafixar do topo' : 'Fixar no topo'}
            onClick={() => {
              void command('pin');
            }}
          >
            <Pin size={14} aria-hidden="true" />
            <span>{pinned ? 'Fixado' : 'Fixar'}</span>
          </button>
          <button
            ref={actionMotion}
            data-timer-primary
            className="mini-primary"
            data-state={state}
            disabled={!timer.ready}
            aria-disabled={timer.busy}
            onClick={() => {
              void timer.send(
                state === 'running'
                  ? 'pause'
                  : state === 'paused'
                    ? 'resume'
                    : state === 'recovering'
                      ? 'recover'
                      : state === 'storage-error'
                        ? 'retry'
                        : 'start',
              );
            }}
          >
            {state === 'running' ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
            {label}
          </button>
          <button
            className="mini-control mini-leave"
            aria-label="Voltar à janela completa"
            title="Fechar mini timer e voltar ao aplicativo"
            onClick={() => {
              void command('leave');
            }}
          >
            <Maximize2 size={14} aria-hidden="true" />
            <span>Voltar</span>
          </button>
        </div>
      </div>
      <div className="mini-cycle-actions">
        {['running', 'paused', 'recovering'].includes(state) && (
          <button
            className="mini-end"
            disabled={!timer.ready || timer.busy}
            onClick={() => setConfirmEnd(true)}
          >
            Encerrar sessão
          </button>
        )}
        <FocusCycleActions timer={timer} />
      </div>
      {confirmEnd && (
        <AppDialog title="Encerrar sessão" alert onCancel={() => setConfirmEnd(false)}>
          <p>O tempo parcial será preservado, sem contar como foco concluído.</p>
          <div className="dialog-actions">
            <button data-dialog-cancel onClick={() => setConfirmEnd(false)}>
              Continuar sessão
            </button>
            <button
              data-primary
              disabled={timer.busy}
              onClick={() => {
                void timer.send('cancel').then((ok) => {
                  if (ok) setConfirmEnd(false);
                });
              }}
            >
              Encerrar
            </button>
          </div>
        </AppDialog>
      )}
      {(timer.error || timer.value.message) && (
        <p role="alert">{timer.error ?? timer.value.message}</p>
      )}
    </section>
  );
}
