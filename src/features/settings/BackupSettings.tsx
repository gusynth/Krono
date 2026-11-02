import { useEffect, useRef, useState } from 'react';
import { backupReplySchema, type BackupReply } from '../../../shared/contracts/backup';

function focusInPanel(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  const panel = element.closest<HTMLElement>('[popover]');
  if (!panel) return;
  const control = element.getBoundingClientRect(),
    bounds = panel.getBoundingClientRect();
  if (control.top < bounds.top + 20) panel.scrollTop -= bounds.top + 20 - control.top;
  else if (control.bottom > bounds.bottom - 20)
    panel.scrollTop += control.bottom - bounds.bottom + 20;
}

export function BackupSettings() {
  const api = window.krono?.backup;
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<BackupReply | null>(null),
    [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const working = useRef(false),
    confirm = useRef<HTMLInputElement>(null),
    choose = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const inspecting = result?.code === 'inspected';
  useEffect(() => {
    if (inspecting) focusInPanel(confirm.current);
  }, [inspecting]);
  useEffect(() => {
    if (result?.code === 'canceled') focusInPanel(choose.current);
  }, [result]);
  if (!api) return null;
  async function run(work: () => Promise<BackupReply>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(false);
    try {
      const next = backupReplySchema.parse(await work());
      if (alive.current) {
        setResult(next);
        setConfirmed(false);
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const messages: Partial<Record<BackupReply['code'], string>> = {
    saved:
      'Backup salvo e validado. Inclui somente dados confirmados. O arquivo não é criptografado.',
    restored:
      'Dados restaurados. A cópia anterior está na pasta backups do perfil do Krono. Feche e reabra o aplicativo se ele não reiniciar.',
    uncertain:
      'A comunicação foi interrompida durante a restauração. O aplicativo será reiniciado para verificar o estado confirmado. Não repita a operação antes de reabrir.',
    canceled: 'Operação cancelada.',
    busy: 'Encerre a sessão atual antes de restaurar. Uma sessão pausada ou em recuperação também precisa ser encerrada.',
    invalid:
      'Arquivo incompatível, inválido ou confirmação expirada. Nenhum dado foi substituído. Selecione novamente.',
    error:
      'Não foi possível concluir a operação. A restauração não foi confirmada. Feche e reabra o Krono antes de tentar novamente.',
  };
  return (
    <section className="backup-settings" aria-labelledby="backup-title">
      <h3 id="backup-title">Backup e restauração</h3>
      <p>
        Salve seus registros em um arquivo local. Restaurar substitui os dados e preferências do
        Krono; não combina históricos.
      </p>
      <div className="backup-actions">
        <button
          disabled={
            busy || inspecting || result?.code === 'restored' || result?.code === 'uncertain'
          }
          onClick={() => {
            void run(() => api.export());
          }}
        >
          Salvar backup
        </button>
        <button
          ref={choose}
          disabled={
            busy || inspecting || result?.code === 'restored' || result?.code === 'uncertain'
          }
          onClick={() => {
            void run(() => api.inspect());
          }}
        >
          Selecionar backup
        </button>
      </div>
      {inspecting && result.summary && (
        <div className="backup-confirm" role="group" aria-label="Confirmar restauração">
          <p>
            Backup de {new Date(result.summary.createdUtcMs).toLocaleString('pt-BR')}:{' '}
            {result.summary.sessions} {result.summary.sessions === 1 ? 'sessão' : 'sessões'} e{' '}
            {result.summary.habits} {result.summary.habits === 1 ? 'hábito' : 'hábitos'}. Formato{' '}
            {result.summary.format}, versão {result.summary.appVersion}.
          </p>
          <p>
            {result.rescue
              ? 'A base está indisponível. Seus arquivos originais serão preservados na pasta rescue do perfil do Krono. O conteúdo deste backup substituirá a base; arquivos danificados não serão reconstruídos. Após o resgate, o aplicativo reinicia.'
              : 'Uma cópia do estado atual será preservada na pasta backups do perfil do Krono. Encerre qualquer sessão em andamento. Após restaurar, o aplicativo reinicia; nenhuma contagem é retomada automaticamente.'}
          </p>
          <label>
            <input
              ref={confirm}
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              {result.rescue
                ? 'Confirmo substituir a base indisponível por este backup.'
                : 'Confirmo substituir os dados locais por este backup.'}
            </span>
          </label>
          <div className="backup-actions">
            <button
              disabled={busy || !confirmed}
              onClick={() => {
                void run(() =>
                  api.restore({
                    token: result.token!,
                    confirmReplacement: true,
                    ...(result.rescue ? { rescue: true } : {}),
                  }),
                );
              }}
            >
              {result.rescue ? 'Resgatar e reiniciar' : 'Restaurar e reiniciar'}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await api.cancel();
                  return { code: 'canceled', summary: null, token: null };
                });
              }}
            >
              Cancelar restauração
            </button>
          </div>
        </div>
      )}
      {busy && <p role="status">Processando dados locais…</p>}
      {result && messages[result.code] && (
        <p role={['invalid', 'error', 'busy'].includes(result.code) ? 'alert' : 'status'}>
          {result.rescue && result.code === 'restored'
            ? 'Resgate concluído. Os arquivos originais estão na pasta rescue do perfil do Krono. Feche e reabra o aplicativo se ele não reiniciar.'
            : messages[result.code]}
        </p>
      )}
      {error && (
        <p role="alert">
          Falha de comunicação. A restauração não foi confirmada; feche e reabra o aplicativo antes
          de tentar novamente.
        </p>
      )}
    </section>
  );
}
