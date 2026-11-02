export interface Clock {
  monotonic(): number;
  civil(): number;
}
export type ProbeState = 'idle' | 'running' | 'paused' | 'awaiting-next';

/** Prova temporal da fase 0. Não é a máquina transacional de sessões do produto. */
export class ActiveTime {
  private state: ProbeState = 'idle';
  private elapsed = 0;
  private started = 0;
  private civilStarted = 0;
  private generation = 0;
  constructor(
    private readonly clock: Clock,
    readonly targetMs: number,
  ) {
    if (!Number.isSafeInteger(targetMs) || targetMs <= 0) throw new Error('Duração inválida');
  }
  start() {
    if (this.state !== 'idle') throw new Error('A prova já foi iniciada');
    this.state = 'running';
    this.anchor();
    return ++this.generation;
  }
  private anchor() {
    this.started = this.clock.monotonic();
    this.civilStarted = this.clock.civil();
  }
  private active() {
    return Math.max(0, this.clock.monotonic() - this.started);
  }
  snapshot() {
    const elapsedMs = Math.min(
      this.targetMs,
      this.elapsed + (this.state === 'running' ? this.active() : 0),
    );
    return {
      state: this.state,
      elapsedMs,
      remainingMs: this.targetMs - elapsedMs,
      generation: this.generation,
    };
  }
  pause() {
    if (this.state !== 'running') return;
    this.elapsed = this.snapshot().elapsedMs;
    this.state = 'paused';
  }
  resume() {
    if (this.state !== 'paused') throw new Error('A prova não está pausada');
    this.anchor();
    this.state = 'running';
  }
  wake(generation: number) {
    if (generation !== this.generation || this.state !== 'running') return false;
    const discrepancy = Math.abs(this.clock.civil() - this.civilStarted - this.active());
    if (discrepancy > 2000) {
      this.pause();
      return false;
    }
    if (this.snapshot().remainingMs > 0) return false;
    this.elapsed = this.targetMs;
    this.state = 'awaiting-next';
    return true;
  }
}
