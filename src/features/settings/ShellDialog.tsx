import { useEffect, useRef, useState } from 'react';
import {
  shellDialogSchema,
  type ShellDialogRequest,
  type ShellChoice,
} from '../../../shared/contracts/shell-dialog';
import { AppDialog } from '../../design/AppDialog';

export function ShellDialog() {
  const api = window.krono?.shellDialog;
  const [request, setRequest] = useState<ShellDialogRequest | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const returnFocus = useRef(true);
  useEffect(() => {
    if (!api) return;
    let alive = true,
      received = false;
    const accept = (value: unknown) => {
      const parsed = shellDialogSchema.nullable().safeParse(value);
      if (alive && parsed.success) {
        if (parsed.data) returnFocus.current = true;
        setRequest(parsed.data);
        setBusy(false);
        setError(false);
      }
    };
    const off = api.subscribe((value) => {
      received = true;
      accept(value);
    });
    void api
      .read()
      .then((value) => {
        if (!received) accept(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, [api]);
  async function respond(choice: ShellChoice) {
    if (!api || !request || busy) return;
    returnFocus.current = choice === 'cancel';
    setBusy(true);
    try {
      if (await api.respond({ id: request.id, choice })) setRequest(null);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!request) return null;
  return (
    <AppDialog
      key={request.id}
      restoreFocus={returnFocus}
      title={request.kind === 'hide' ? 'Manter o Krono na bandeja?' : 'Sair do Krono?'}
      onCancel={() => {
        void respond('cancel');
      }}
    >
      <p>
        {request.kind === 'hide'
          ? 'A janela será escondida. Use o ícone K na bandeja para voltar ao aplicativo ou sair.'
          : 'Há uma sessão ativa ou aguardando recuperação. O temporizador não funciona com o aplicativo encerrado.'}
      </p>
      {request.storageError ? (
        <p role="alert">
          Há uma falha ao salvar. Somente o último registro confirmado poderá ser recuperado.
        </p>
      ) : (
        request.running && request.kind === 'hide' && <p>O temporizador continuará em andamento.</p>
      )}
      {error && <p role="alert">Não foi possível confirmar a ação. Tente novamente.</p>}
      <div className="dialog-actions">
        <button
          autoFocus
          disabled={busy}
          onClick={() => {
            void respond('cancel');
          }}
        >
          Cancelar
        </button>
        {request.kind === 'quit' && (
          <button
            disabled={busy}
            onClick={() => {
              void respond('quit');
            }}
          >
            Pausar e sair
          </button>
        )}
        {request.canHide && (
          <button
            data-primary="true"
            disabled={busy}
            onClick={() => {
              void respond('hide');
            }}
          >
            {request.kind === 'hide' ? 'Manter na bandeja' : 'Continuar na bandeja'}
          </button>
        )}
      </div>
    </AppDialog>
  );
}
