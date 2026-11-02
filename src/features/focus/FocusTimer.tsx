import { FinishEstimate } from './FinishEstimate';
import { useEffect, useRef, useState } from 'react';
import { useContentMotion } from '../../design/useContentMotion';
import { Play, Pause, RotateCcw, Minimize2 } from 'lucide-react';
import { FocusCycleActions } from './FocusCycleActions';
import { PomodoroSettings } from './PomodoroSettings';
import {
  defaultTimerConfiguration,
  type TimerConfiguration,
} from '../../../shared/contracts/timer';
import { configuredPreset } from '../../../shared/domain/pomodoro';
import { useFocusTimer } from './useFocusTimer';
import { PhaseSelect } from './PhaseSelect';
import { AppDialog } from '../../design/AppDialog';

const names = {
  focus: 'Foco',
  'short-break': 'Pausa curta',
  'long-break': 'Pausa longa',
  free: 'Livre',
};
export function FocusTimer({
  active,
  reduce = false,
  onRest,
  onAvailabilityError,
  onMini,
}: {
  active: boolean;
  reduce?: boolean;
  onMini?: () => void;
  onRest: (rest: boolean) => void;
  onAvailabilityError: (error: boolean) => void;
}) {
  const timer = useFocusTimer(active);
  const [demoConfiguration, setDemoConfiguration] = useState<TimerConfiguration>({
    ...defaultTimerConfiguration,
  });
  const configuration = timer.live
    ? (timer.value.configuration ?? defaultTimerConfiguration)
    : demoConfiguration;
  const preview = configuredPreset(configuration);
  const [demoRest, setDemoRest] = useState(false);
  const [demoState, setDemoState] = useState<'idle' | 'running' | 'paused'>('idle');
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);
  const state = timer.live ? timer.value.state : demoState;
  const phase = timer.live ? timer.value.phase : demoRest ? 'short-break' : 'focus';
  const rest = phase === 'short-break' || phase === 'long-break';
  useEffect(() => onRest(rest), [onRest, rest]);
  const seconds = Math.ceil(
    (timer.live
      ? (timer.remaining ?? timer.elapsed)
      : demoRest
        ? preview.shortBreakMs
        : preview.focusMs) / 1000,
  );
  const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secondsText = String(seconds % 60).padStart(2, '0');
  const awaiting = state === 'awaiting-next';
  const recovering = state === 'recovering';
  const blocked = state === 'storage-error';
  useEffect(
    () => onAvailabilityError(blocked || timer.unavailable),
    [onAvailabilityError, blocked, timer.unavailable],
  );
  const action = blocked
    ? 'Tentar salvar novamente'
    : recovering
      ? 'Recuperar sessão'
      : state === 'running'
        ? 'Pausar'
        : state === 'paused'
          ? 'Retomar'
          : `Iniciar ${(awaiting ? names[timer.value.nextPhase] : names[phase]).toLowerCase()}`;
  const label =
    state === 'running'
      ? rest
        ? 'Em pausa'
        : 'Em foco'
      : state === 'paused'
        ? 'Pausado'
        : awaiting
          ? `${names[phase]} ${rest ? 'concluída' : 'concluído'} · próxima etapa manual`
          : recovering
            ? 'Aguardando recuperação'
            : blocked
              ? 'Contagem suspensa · falha ao salvar'
              : timer.value.focusCompleted
                ? 'Foco concluído · ciclo encerrado'
                : 'Pronto para iniciar';
  const phaseMotion = useContentMotion<HTMLDivElement>(`${phase}:${awaiting}`, reduce);
  const actionMotion = useContentMotion(action, reduce);
  const cycle = timer.live ? timer.value.focusNumber : 1;
  const cycleLength = timer.live ? timer.value.longEvery : configuration.longEvery;
  async function primary() {
    if (!timer.live) {
      setDemoState(state === 'running' ? 'paused' : 'running');
      return;
    }
    await timer.send(
      blocked
        ? 'retry'
        : recovering
          ? 'recover'
          : state === 'running'
            ? 'pause'
            : state === 'paused'
              ? 'resume'
              : 'start',
    );
  }
  function select(rest: boolean) {
    if (timer.live)
      void timer.send(
        'select-phase',
        rest ? (phase === 'long-break' ? 'long-break' : 'short-break') : 'focus',
      );
    else {
      setDemoRest(rest);
      setDemoState('idle');
    }
  }
  return (
    <>
      <div className="clean-mode-row">
        <PhaseSelect
          rest={rest}
          long={phase === 'long-break'}
          reduce={reduce}
          disabled={timer.live && !['idle', 'awaiting-next'].includes(state)}
          busy={timer.live && timer.busy}
          select={select}
        />
        <PomodoroSettings
          configuration={configuration}
          busy={timer.live && (timer.busy || !timer.ready || blocked)}
          active={timer.live && state !== 'idle'}
          save={async (value) => {
            if (timer.live) return timer.send('configure', undefined, value);
            setDemoConfiguration(value);
            return true;
          }}
        />
        {onMini && (
          <button className="mini-launch" onClick={onMini}>
            <Minimize2 size={15} aria-hidden="true" />
            <span>Mini timer</span>
          </button>
        )}
      </div>
      <div
        ref={phaseMotion}
        className="clean-time"
        data-state={state}
        aria-label={timer.live ? names[phase] : `${names[phase]}, demonstração`}
      >
        <span className="time-label">{rest ? names[phase] : 'Tempo de foco'}</span>
        <span className="clean-digits" aria-live="off">
          {minutesText}
          <span>:</span>
          {secondsText}
        </span>
        {timer.live && (
          <FinishEstimate now={timer.civilNow} state={state} remaining={timer.remaining} />
        )}
        <span className="time-state" role={timer.live ? 'status' : undefined}>
          <i />
          {label}
        </span>
      </div>
      <div className="clean-progress" aria-hidden="true">
        <i
          style={
            timer.live
              ? {
                  width: `${Math.min(100, timer.value.durationMs ? ((timer.value.durationMs - (timer.remaining ?? 0)) / timer.value.durationMs) * 100 : 0)}%`,
                }
              : undefined
          }
        />
      </div>
      <div className="clean-cycle" data-single={timer.live && timer.value.singleFocus}>
        <span className="cycle-steps" aria-hidden="true">
          {Array.from({ length: cycleLength }, (_, index) => index + 1).map((index) => (
            <i key={index} data-active={index === cycle} />
          ))}
        </span>
        <span className="cycle-label">
          {timer.live && timer.value.singleFocus ? (
            'Foco único'
          ) : (
            <>
              Foco <strong>{cycle}</strong> <span>de {cycleLength}</span>
            </>
          )}
        </span>
      </div>
      <div className="clean-controls">
        <button
          ref={primaryRef}
          className="clean-primary"
          disabled={timer.live && !timer.ready}
          aria-disabled={timer.live && timer.busy}
          onClick={() => {
            void primary();
          }}
        >
          <span ref={actionMotion}>
            {state === 'running' ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
            {timer.live && !timer.ready
              ? timer.unavailable
                ? 'Temporizador indisponível'
                : 'Carregando sessão…'
              : action}
          </span>
        </button>
        <div className="focus-secondary-actions">
          <button
            className="clean-reset"
            data-available={
              timer.live
                ? !['idle', 'awaiting-next', 'storage-error'].includes(state)
                : state !== 'idle'
            }
            disabled={
              timer.live &&
              (timer.busy || ['idle', 'awaiting-next', 'storage-error'].includes(state))
            }
            aria-label={
              timer.live
                ? recovering
                  ? 'Descartar sessão'
                  : 'Encerrar sessão'
                : 'Reiniciar prévia'
            }
            onClick={() => {
              if (timer.live) setConfirm(true);
              else setDemoState('idle');
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {timer.live
              ? recovering
                ? 'Descartar sessão'
                : 'Encerrar sessão'
              : 'Reiniciar prévia'}
          </button>
          <FocusCycleActions timer={timer} />
        </div>
      </div>
      {confirm && (
        <AppDialog alert title="Encerrar sessão" onCancel={() => setConfirm(false)}>
          <p>Encerrar esta sessão? O tempo parcial não será contado como foco concluído.</p>
          <div className="dialog-actions">
            <button autoFocus onClick={() => setConfirm(false)}>
              Continuar sessão
            </button>
            <button
              data-primary="true"
              onClick={() => {
                setConfirm(false);
                void timer.send(recovering ? 'discard' : 'cancel');
              }}
            >
              Encerrar
            </button>
          </div>
        </AppDialog>
      )}
      {timer.live && (timer.value.message || timer.error) && (
        <div className="focus-message" role="alert">
          {timer.error ?? timer.value.message}
        </div>
      )}
    </>
  );
}
