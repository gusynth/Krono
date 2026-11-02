import type { DesktopPreferences } from '../../shared/contracts/desktop';
/** Um despertar diário; sem polling, sem serviço instalado, sem recuperar avisos atrasados. */
export class RoutineScheduler {
  private wake: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private generation = 0;
  constructor(
    private backup: () => Promise<void>,
    private remind: () => Promise<void>,
    private now = () => new Date(),
  ) {}
  update(preferences: DesktopPreferences) {
    clearTimeout(this.wake);
    const generation = ++this.generation;
    if (this.stopped || (!preferences.autoBackup && !preferences.habitReminder)) return;
    if (preferences.autoBackup) void this.backup();
    const current = this.now(),
      next = new Date(current);
    next.setHours(24, 0, 0, 0);
    const reminder = preferences.habitReminder;
    if (reminder) {
      const [h, m] = reminder.split(':').map(Number);
      const candidate = new Date(current);
      candidate.setHours(h!, m!, 0, 0);
      if (candidate > current && candidate < next) next.setTime(candidate.getTime());
    }
    this.wake = setTimeout(
      () => {
        if (this.stopped || generation !== this.generation) return;
        const delay = this.now().getTime() - next.getTime();
        if (
          delay >= 0 &&
          delay < 60_000 &&
          reminder &&
          `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}` ===
            reminder
        )
          void this.remind();
        this.update(preferences);
      },
      Math.max(1000, next.getTime() - current.getTime() + 50),
    );
  }
  dispose() {
    this.stopped = true;
    ++this.generation;
    clearTimeout(this.wake);
  }
}
