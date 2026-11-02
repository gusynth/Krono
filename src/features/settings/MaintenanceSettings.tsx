import { useEffect, useState } from 'react';
import { maintenanceStatusSchema } from '../../../shared/contracts/maintenance';
import { useDesktop } from './useDesktop';
export function MaintenanceSettings() {
  const desktop = useDesktop(),
    api = window.krono?.maintenance;
  const [last, setLast] = useState<number | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (api)
      void api
        .status()
        .then((input) => {
          const value = maintenanceStatusSchema.parse(input);
          if (alive) {
            setLast(value.lastBackupUtcMs);
            if (value.error) setMessage(value.error);
          }
        })
        .catch(() => {
          if (alive) setMessage('Não foi possível consultar os backups.');
        });
    return () => {
      alive = false;
    };
  }, [api, desktop.value?.preferences.autoBackup]);
  if (!api || !desktop.value) return null;
  return (
    <section className="maintenance-settings">
      <h3>Proteção e exportação</h3>
      <label className="preference-row">
        <span>Backup automático local</span>
        <input
          type="checkbox"
          role="switch"
          checked={desktop.value.preferences.autoBackup ?? false}
          disabled={desktop.busy}
          onChange={(e) => {
            void desktop.update({ autoBackup: e.target.checked });
          }}
        />
      </label>
      <p>
        Opcional. Uma cópia validada a cada 24 horas, enquanto o Krono estiver aberto e sem foco em
        andamento. Mantém até sete cópias, com limite total de 256 MB (128 MB por cópia), em uma
        pasta própria; não apaga backups manuais ou anteriores a restaurações.
      </p>
      <p>Último backup automático: {last ? new Date(last).toLocaleString('pt-BR') : 'Nenhum'}</p>
      <div className="backup-actions">
        <button
          onClick={() => {
            void api.openBackups().catch(() => setMessage('Não foi possível abrir a pasta.'));
          }}
        >
          Abrir pasta de backups
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api
              .exportCSV()
              .then((result) =>
                setMessage(
                  result === 'saved'
                    ? 'Histórico exportado.'
                    : result === 'canceled'
                      ? 'Exportação cancelada.'
                      : 'Outra exportação está em andamento.',
                ),
              )
              .catch(() => setMessage('Não foi possível exportar o histórico.'))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Exportando…' : 'Exportar últimos 365 dias (CSV)'}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {desktop.error && <p role="alert">{desktop.error}</p>}
    </section>
  );
}
