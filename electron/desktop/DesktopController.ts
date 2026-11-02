import { randomUUID } from 'node:crypto';
import type { TimerService } from '../services/TimerService';
import type { DesktopService } from './DesktopService';
export interface MenuEntry {
  label: string;
  enabled?: boolean;
  click?: () => void;
  type?: 'separator';
}
export interface DesktopPorts {
  trayHealthy: () => boolean;
  hide: () => void;
  show: (focus: boolean) => void;
  informHide: () => Promise<boolean>;
  confirmQuit: (canHide: boolean) => Promise<'hide' | 'quit' | 'cancel'>;
  exit: () => void;
  menuChanged: (menu: MenuEntry[]) => void;
}
const names = {
  focus: 'Foco',
  'short-break': 'Pausa curta',
  'long-break': 'Pausa longa',
  free: 'Livre',
};
export class DesktopController {
  private busy = false;
  private exiting = false;
  private unsubscribe: () => void;
  private unsubscribeSettings: () => void;
  constructor(
    private timer: TimerService,
    private desktop: DesktopService,
    private ports: DesktopPorts,
  ) {
    this.unsubscribe = timer.subscribe(() => {
      this.refresh();
      void desktop.flush();
    });
    this.unsubscribeSettings = desktop.subscribe(() => this.refresh());
    this.refresh();
  }
  refresh() {
    this.ports.menuChanged(this.menu());
  }
  show(focus = false) {
    this.ports.show(focus);
  }
  menu(): MenuEntry[] {
    const value = this.timer.read();
    const seconds = Math.ceil((value.remainingMs ?? value.elapsedMs) / 1000);
    const label =
      value.state === 'running'
        ? 'Pausar'
        : value.state === 'paused'
          ? 'Retomar'
          : value.state === 'recovering'
            ? 'Recuperar sessão'
            : value.state === 'storage-error'
              ? 'Tentar salvar novamente'
              : `Iniciar ${names[value.state === 'awaiting-next' ? value.nextPhase : value.phase].toLowerCase()}`;
    const action =
      value.state === 'running'
        ? 'pause'
        : value.state === 'paused'
          ? 'resume'
          : value.state === 'recovering'
            ? 'recover'
            : value.state === 'storage-error'
              ? 'retry'
              : 'start';
    return [
      { label: 'Mostrar Krono', click: () => this.show() },
      {
        label: `${names[value.phase]} · ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} · ${value.state === 'running' ? 'em andamento' : value.state === 'awaiting-next' ? 'concluído' : value.state === 'paused' ? 'pausado' : value.state === 'recovering' ? 'recuperação' : value.state === 'storage-error' ? 'erro ao salvar' : 'pronto'}`,
        enabled: false,
      },
      {
        label,
        click: () => {
          void this.timer
            .command({
              commandId: randomUUID(),
              expectedRevision: value.revision,
              sessionId: value.sessionId,
              action,
            })
            .then((reply) => {
              if (reply.code !== 'ok') this.show(true);
            });
        },
      },
      { label: '', type: 'separator' },
      {
        label: this.desktop.read().unread
          ? `Avisos pendentes (${this.desktop.read().unread})`
          : 'Sem avisos pendentes',
        enabled: this.desktop.read().unread > 0,
        click: () => this.show(true),
      },
      {
        label: 'Sair',
        click: () => {
          void this.quit().catch(() => this.show());
        },
      },
    ];
  }
  async close(): Promise<void> {
    if (this.busy || this.exiting) return;
    this.busy = true;
    try {
      if (this.desktop.preferences().closeToTray && this.ports.trayHealthy()) await this.hide();
      else await this.chooseExit();
    } finally {
      this.busy = false;
    }
  }
  private async hide() {
    if (!this.ports.trayHealthy()) {
      this.show();
      return;
    }
    if (!this.desktop.preferences().firstHideSeen) {
      if (!(await this.ports.informHide())) return;
      if (!(await this.desktop.acknowledgeHide())) {
        this.show();
        return;
      }
    }
    if (this.ports.trayHealthy()) this.ports.hide();
    else this.show();
  }
  private async chooseExit() {
    const active =
      this.timer.read().sessionId !== null &&
      ['running', 'paused', 'recovering', 'storage-error'].includes(this.timer.read().state);
    if (active) {
      this.show();
      const choice = await this.ports.confirmQuit(this.ports.trayHealthy());
      if (choice === 'cancel') return;
      if (choice === 'hide') {
        await this.hide();
        return;
      }
    }
    await this.exitBounded();
  }
  async quit(force = false) {
    if (this.exiting) return;
    if (force) {
      await this.exitBounded();
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      if (force) await this.exitBounded();
      else await this.chooseExit();
    } finally {
      this.busy = false;
    }
  }
  private async exitBounded() {
    this.exiting = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.timer.pauseForExit().catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 2000);
      }),
    ]);
    clearTimeout(timeout);
    this.ports.exit();
  }
  suspend() {
    return this.timer.suspend();
  }
  lock() {
    return this.desktop.preferences().pauseOnLock ? this.timer.pauseForExit() : Promise.resolve();
  }
  resume() {
    this.refresh();
  }
  dispose() {
    this.unsubscribe();
    this.unsubscribeSettings();
  }
}
