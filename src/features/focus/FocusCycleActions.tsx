import { useState } from 'react';
import { AppDialog } from '../../design/AppDialog';
import type { useFocusTimer } from './useFocusTimer';

export function FocusCycleActions({ timer }: { timer: ReturnType<typeof useFocusTimer> }) {
  const [confirm, setConfirm] = useState(false);
  if (!timer.live) return null;
  const { state, phase, canEndCycle, singleFocus } = timer.value;
  const interrupted = ['running', 'paused', 'recovering'].includes(state);
  return (
    <>
      {state === 'idle' && phase === 'focus' && (
        <button
          type="button"
          role="switch"
          aria-checked={singleFocus ?? false}
          className="single-focus-option"
          disabled={!timer.ready || timer.busy}
          onClick={() => {
            void timer.send('set-single-focus', undefined, undefined, !singleFocus);
          }}
        >
          <i aria-hidden="true" />
          <span>Somente este foco</span>
        </button>
      )}
      {canEndCycle && state !== 'storage-error' && (
        <button
          type="button"
          className="focus-cycle-end"
          disabled={!timer.ready || timer.busy}
          onClick={() => {
            if (interrupted) setConfirm(true);
            else void timer.send('end-cycle');
          }}
        >
          Encerrar ciclo
        </button>
      )}
      {confirm && (
        <AppDialog alert title="Encerrar ciclo" onCancel={() => setConfirm(false)}>
          <p>
            Encerrar a sessão e este ciclo? O tempo desta sessão será preservado como parcial, sem
            contar como foco concluído. Os focos já concluídos permanecem registrados. O próximo
            começa em 1 de {timer.value.longEvery}.
          </p>
          <div className="dialog-actions">
            <button autoFocus onClick={() => setConfirm(false)}>
              Continuar sessão
            </button>
            <button
              data-primary
              disabled={timer.busy}
              onClick={() => {
                void timer.send('end-cycle').then((ok) => {
                  if (ok) setConfirm(false);
                });
              }}
            >
              Encerrar ciclo
            </button>
          </div>
        </AppDialog>
      )}
    </>
  );
}
