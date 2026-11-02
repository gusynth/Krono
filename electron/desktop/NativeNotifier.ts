import { Notification } from 'electron';
import type { Delivery } from '../../shared/contracts/desktop';
export class NativeNotifier {
  private active = new Set<Notification>();
  private cleanup = new Map<Notification, () => void>();
  constructor(
    private reveal: () => void,
    private iconPath?: string,
  ) {}
  notify(phase: string, reminder = false): Promise<Delivery> {
    if (!Notification.isSupported()) return Promise.resolve('unsupported');
    return new Promise((resolve) => {
      let settled = false;
      let notification: Notification;
      try {
        notification = new Notification({
          title: reminder
            ? 'Hábitos previstos para hoje'
            : phase === 'focus' || phase === 'free'
              ? 'Foco concluído'
              : 'Pausa concluída',
          body: reminder
            ? 'Há hábitos pendentes para hoje. Abra o Krono para consultar.'
            : 'A sessão foi salva. Abra o Krono para iniciar a próxima etapa.',
          icon: this.iconPath,
          silent: true,
          timeoutType: 'default',
        });
      } catch {
        resolve('failed');
        return;
      }
      const finish = (status: Delivery) => {
        if (!settled) {
          settled = true;
          clearTimeout(requestTimeout);
          resolve(status);
        }
      };
      const requestTimeout = setTimeout(() => finish('requested'), 1500);
      const release = () => {
        clearTimeout(lifetime);
        clearTimeout(requestTimeout);
        this.active.delete(notification);
        this.cleanup.delete(notification);
        notification.removeAllListeners();
        notification.close();
        finish('requested');
      };
      const lifetime = setTimeout(release, 30_000);
      this.active.add(notification);
      this.cleanup.set(notification, release);
      notification.once('show', () => finish('shown'));
      notification.once('failed', () => finish('failed'));
      notification.once('click', () => {
        this.reveal();
        release();
      });
      notification.once('close', release);
      if (this.active.size > 8) this.cleanup.get(this.active.values().next().value!)?.();
      try {
        notification.show();
      } catch {
        finish('failed');
        release();
      }
    });
  }
  dispose() {
    for (const release of [...this.cleanup.values()]) release();
  }
}
