import {
  defaultPreferences,
  preferenceUpdateSchema,
  type DesktopPreferences,
  type DesktopSnapshot,
  type PreferenceUpdate,
  type Delivery,
} from '../../shared/contracts/desktop';
import type { DesktopRepository } from '../storage/desktop-repository';
export interface AlertPorts {
  notify: (phase: string) => Promise<Delivery>;
  play: (volume: number) => Promise<'finished' | 'failed'>;
  startup?: (enabled: boolean) => void;
}
export class DesktopService {
  private revision = 0;
  private settings = defaultPreferences();
  private unread = 0;
  private alerts: DesktopSnapshot['alerts'] = [];
  private error: string | null = null;
  private trayAvailable = false;
  private listeners = new Set<(value: DesktopSnapshot) => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private stopped = false;
  constructor(
    private repository: DesktopRepository,
    private ports: AlertPorts,
  ) {}
  preferences(): DesktopPreferences {
    return { ...this.settings };
  }
  read(): DesktopSnapshot {
    return {
      revision: this.revision,
      preferences: this.preferences(),
      alerts: [...this.alerts],
      unread: this.unread,
      trayAvailable: this.trayAvailable,
      error: this.error,
    };
  }
  subscribe(listener: (value: DesktopSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    ++this.revision;
    for (const listener of this.listeners) listener(this.read());
  }
  private queue(work: () => Promise<void>): Promise<void> {
    const next = this.tail.then(work).catch(() => {
      this.error =
        'Não foi possível confirmar preferências ou avisos. Nenhum alarme será repetido automaticamente. Feche e reabra se o erro persistir.';
      this.publish();
    });
    this.tail = next;
    return next;
  }
  private async refresh() {
    this.settings = await this.repository.preferences();
    const events = await this.repository.alerts();
    this.alerts = events.alerts;
    this.unread = events.unread;
    this.publish();
  }
  initialize() {
    return this.queue(async () => {
      await this.repository.recoverAlerts();
      await this.refresh();
    });
  }
  setTrayAvailable(value: boolean) {
    this.trayAvailable = value;
    this.publish();
  }
  async update(value: PreferenceUpdate): Promise<DesktopSnapshot> {
    await this.queue(async () => {
      value = preferenceUpdateSchema.parse(value);
      if (value.expectedRevision !== this.settings.revision) throw new Error('PREFERENCE_CONFLICT');
      const before = this.settings.startWithWindows ?? false,
        startup = value.patch.startWithWindows;
      const changed = startup !== undefined && startup !== before;
      if (changed && !this.ports.startup) throw new Error('STARTUP_UNAVAILABLE');
      try {
        if (changed) this.ports.startup!(startup);
        this.settings = await this.repository.update(value);
      } catch (error) {
        if (changed) this.ports.startup!(before);
        throw error;
      }
      this.error = null;
      this.publish();
    });
    return this.read();
  }
  async acknowledgeHide(): Promise<boolean> {
    let saved = false;
    await this.queue(async () => {
      await this.repository.acknowledgeHide();
      await this.refresh();
      saved = true;
    });
    return saved;
  }
  async dismiss(id: string): Promise<DesktopSnapshot> {
    await this.queue(async () => {
      await this.repository.dismiss(id);
      await this.refresh();
    });
    return this.read();
  }
  async preview(): Promise<'finished' | 'failed' | 'disabled'> {
    if (!this.settings.soundEnabled || this.settings.volume === 0) return 'disabled';
    try {
      return await this.ports.play(this.settings.volume);
    } catch {
      return 'failed';
    }
  }
  flush() {
    return this.queue(async () => {
      if (this.stopped) return;
      for (const event of await this.repository.pending()) {
        if (this.stopped) break;
        if (!(await this.repository.claim(event.sessionId))) continue;
        await this.refresh();
        const settings = this.preferences();
        const [notification, sound] = await Promise.allSettled([
          settings.notificationsEnabled
            ? this.ports.notify(event.phase)
            : Promise.resolve<Delivery>('disabled'),
          settings.soundEnabled && settings.volume > 0
            ? this.ports.play(settings.volume)
            : Promise.resolve<Delivery>('disabled'),
        ]);
        await this.repository.outcome({
          sessionId: event.sessionId,
          notification: notification.status === 'fulfilled' ? notification.value : 'failed',
          sound: sound.status === 'fulfilled' ? sound.value : 'failed',
        });
        await this.refresh();
      }
    });
  }
  dispose() {
    this.stopped = true;
    this.listeners.clear();
  }
}
