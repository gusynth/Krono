import { globalShortcutSchema, type ShortcutSnapshot } from '../../shared/contracts/welcome';
import type { DesktopService } from './DesktopService';
export interface ShortcutPort {
  register: (key: string, callback: () => void) => boolean;
  unregister: (key: string) => void;
}
/** Somente o atalho que este controlador adquiriu pode ser liberado. */
export class ShortcutController {
  private value: ShortcutSnapshot;
  private listeners = new Set<(value: ShortcutSnapshot) => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private stopped = false;
  constructor(
    private desktop: DesktopService,
    private port: ShortcutPort,
    private reveal: () => void,
  ) {
    const configured = desktop.preferences().globalShortcut ?? 'off';
    this.value = { configured, active: 'off', status: 'off', message: null };
    if (configured !== 'off') {
      try {
        if (this.acquire(configured))
          this.value = { configured, active: configured, status: 'active', message: null };
        else
          this.value = {
            ...this.value,
            status: 'conflict',
            message: 'O atalho salvo está ocupado. Escolha outra combinação.',
          };
      } catch {
        this.value = {
          ...this.value,
          status: 'error',
          message: 'Não foi possível ativar o atalho salvo.',
        };
      }
    }
  }
  private acquire(key: string) {
    return this.port.register(key, () => {
      if (!this.stopped) this.reveal();
    });
  }
  read() {
    return { ...this.value };
  }
  subscribe(listener: (value: ShortcutSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(value: ShortcutSnapshot) {
    this.value = value;
    for (const listener of this.listeners) {
      try {
        listener(this.read());
      } catch {
        /* Renderer indisponível não desfaz preferência ou registro já confirmados. */
      }
    }
  }
  set(input: unknown): Promise<ShortcutSnapshot> {
    const key = globalShortcutSchema.parse(input);
    const next = this.tail.then(async () => {
      if (this.stopped) return this.read();
      const previous = this.value.active;
      let acquired = false;
      try {
        if (key !== 'off' && key !== previous) {
          acquired = this.acquire(key);
          if (!acquired) {
            this.publish({
              ...this.value,
              status: 'conflict',
              message: 'Essa combinação está ocupada. O atalho anterior foi mantido.',
            });
            return this.read();
          }
        }
        const saved = await this.desktop.update({
          expectedRevision: this.desktop.preferences().revision,
          patch: { globalShortcut: key },
        });
        if (this.stopped || saved.error || saved.preferences.globalShortcut !== key)
          throw new Error('SHORTCUT_NOT_SAVED');
        if (previous !== 'off' && previous !== key) this.port.unregister(previous);
        this.publish({
          configured: key,
          active: key,
          status: key === 'off' ? 'off' : 'active',
          message: null,
        });
      } catch {
        if (acquired) this.port.unregister(key);
        if (!this.stopped)
          this.publish({
            ...this.value,
            status: 'error',
            message: 'Não foi possível confirmar o atalho. Tente novamente.',
          });
      }
      return this.read();
    });
    this.tail = next.catch(() => {});
    return next;
  }
  dispose() {
    this.stopped = true;
    if (this.value.active !== 'off') this.port.unregister(this.value.active);
    this.listeners.clear();
  }
}
