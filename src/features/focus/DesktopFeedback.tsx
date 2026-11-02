import { useDesktop } from '../settings/useDesktop';
import { AlertCircle, Bell, ChevronDown } from 'lucide-react';
import type { Delivery } from '../../../shared/contracts/desktop';
const labels: Record<Delivery, string> = {
  claimed: 'entrega não confirmada',
  requested: 'solicitada ao Windows',
  shown: 'exibição informada pelo Windows',
  failed: 'falhou',
  unsupported: 'indisponível',
  disabled: 'desativado',
  ambiguous: 'entrega incerta; sem repetição automática',
  finished: 'reprodução concluída no aplicativo',
};
export function DesktopFeedback() {
  const desktop = useDesktop();
  if (!desktop.api || !desktop.value)
    return desktop.error ? (
      <div className="focus-message" role="alert">
        {desktop.error}
      </div>
    ) : null;
  const value = desktop.value;
  const attention = value.alerts.some((alert) =>
    [alert.notification, alert.sound].some((status) =>
      ['failed', 'unsupported', 'ambiguous'].includes(status),
    ),
  );
  if (!value.alerts.length && value.trayAvailable && !value.error && !desktop.error) return null;
  return (
    <div className="desktop-feedback" role="status">
      {!value.trayAvailable && <p>Bandeja indisponível. A janela não será escondida ao fechar.</p>}
      {(desktop.error || value.error) && <p>{desktop.error ?? value.error}</p>}
      {!!value.alerts.length && (
        <details className="session-notices" data-attention={attention}>
          <summary>
            {attention ? (
              <AlertCircle size={17} aria-hidden="true" />
            ) : (
              <Bell size={17} aria-hidden="true" />
            )}
            <span>
              <strong>
                {value.unread} {value.unread === 1 ? 'aviso de sessão' : 'avisos de sessão'}
              </strong>
              <small>
                {attention
                  ? 'Verificar entrega de som ou notificação'
                  : 'Sessão salva · Consultar entrega de som e notificação'}
              </small>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="history-content">
            {value.alerts.map((alert) => (
              <div className="session-notice" key={alert.sessionId}>
                <p>
                  <strong>
                    {alert.phase === 'focus' || alert.phase === 'free'
                      ? 'Foco concluído'
                      : 'Pausa concluída'}
                  </strong>{' '}
                  · Sessão salva.
                  <br />
                  Notificação: {labels[alert.notification]}. Som: {labels[alert.sound]}.
                </p>
                <button
                  onClick={() => {
                    void desktop.dismiss(alert.sessionId);
                  }}
                >
                  Dispensar aviso
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {value.unread > value.alerts.length && (
        <p>{value.unread} avisos pendentes. Dispense os visíveis para consultar os anteriores.</p>
      )}
    </div>
  );
}
