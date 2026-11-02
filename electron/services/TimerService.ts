import { randomUUID } from 'node:crypto';
import {
  defaultPreset,
  timerCommandSchema,
  type TimerCommand,
  type TimerRecord,
  type TimerReply,
  type TimerSnapshot,
} from '../../shared/contracts/timer';
import {
  activeMs,
  canEndCycle,
  closeCycle,
  complete,
  duration,
  initialTimer,
  snapshot,
  type Clock,
} from '../../shared/domain/timer';
import { civilDate, nextCivilDay } from '../../shared/domain/habits';
import type { TimerCommit, TimerRepository } from '../storage/timer-repository';
import { configuredPreset } from '../../shared/domain/pomodoro';

const storageMessage =
  'Não foi possível salvar a sessão. A contagem foi suspensa. Tente novamente; nenhum resultado foi confirmado na interface. Se o erro persistir, feche e reabra o aplicativo.';
interface Anchor {
  monotonic: number;
  civil: number;
}
export class TimerService {
  private record = initialTimer();
  private anchor: Anchor | null = null;
  private failure = false;
  private pending: { commit: TimerCommit; anchor: Anchor | null } | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(snapshot: TimerSnapshot) => void>();
  private disposed = false;
  constructor(
    private repository: TimerRepository,
    private clock: Clock,
    private timezone: string,
    private automatic = true,
    private makeId: () => string = randomUUID,
    private selectedHabit: () => Promise<string | null> = async () => null,
  ) {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0);
  }
  private now(): Anchor {
    return { monotonic: Math.floor(this.clock.monotonic()), civil: Math.floor(this.clock.civil()) };
  }
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.catch(() => undefined);
    return next;
  }
  private extra(now = this.now()): number {
    return this.record.state === 'running' && this.anchor && !this.failure
      ? Math.max(0, now.monotonic - this.anchor.monotonic)
      : 0;
  }
  read(): TimerSnapshot {
    return snapshot(this.record, this.extra(), this.failure ? storageMessage : null);
  }
  subscribe(listener: (value: TimerSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    const value = this.read();
    for (const listener of this.listeners) listener(value);
  }
  async initialize(): Promise<void> {
    try {
      this.record = await this.repository.load();
      if (this.record.state === 'running') {
        const recovered = { ...this.record, state: 'recovering' as const };
        await this.save(recovered, { id: this.makeId(), fingerprint: 'startup-recovery' }, null);
      }
      if (!this.failure) await this.rollDay(this.now());
    } catch {
      this.failure = true;
    }
    this.publish();
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timeout);
    ++this.generation;
    if (!this.automatic || this.disposed || this.failure) return;
    const running = this.record.state === 'running';
    if (!running && (!['idle', 'awaiting-next'].includes(this.record.state) || !this.cycleDay()))
      return;
    const generation = this.generation;
    const now = this.now();
    const delay = running
      ? Math.min(15_000, this.read().remainingMs ?? 15_000)
      : this.cycleDay() !== civilDate(now.civil, this.timezone)
        ? 1
        : nextCivilDay(now.civil, this.timezone);
    this.timeout = setTimeout(
      () => {
        void this.wake(generation);
      },
      Math.max(1, delay),
    );
  }
  private cycleDay(record = this.record): string | undefined {
    return (
      record.cycleDate ??
      (record.session ? civilDate(record.session.startedUtcMs, this.timezone) : undefined)
    );
  }
  private async rollDay(now: Anchor): Promise<boolean> {
    if (!['idle', 'awaiting-next'].includes(this.record.state)) return false;
    const today = civilDate(now.civil, this.timezone),
      day = this.cycleDay();
    // A fresh empty record remains revision zero; legacy progress without a date is retired once.
    if (day === today || (!day && !canEndCycle(this.record))) return false;
    await this.save(
      closeCycle(this.record, today),
      { id: this.makeId(), fingerprint: 'daily-cycle-reset' },
      null,
    );
    return true;
  }
  private completed(record: TimerRecord, now: Anchor): TimerRecord {
    const today = civilDate(now.civil, this.timezone),
      next = { ...complete(record), cycleDate: this.cycleDay(record) ?? today };
    return record.session?.singleFocus || this.cycleDay(record) !== today
      ? closeCycle(next, today, record.phase === 'focus')
      : next;
  }
  private async save(
    next: TimerRecord,
    command: TimerCommit['command'],
    anchor: Anchor | null,
    result?: TimerCommit['result'],
  ): Promise<boolean> {
    const commit: TimerCommit = {
      expectedRevision: this.record.revision,
      record: { ...next, revision: this.record.revision + 1 },
      command,
      ...(result ? { result } : {}),
    };
    this.pending = { commit, anchor };
    return this.flush(false);
  }
  private async flush(retry: boolean): Promise<boolean> {
    const pending = this.pending;
    if (!pending) return false;
    try {
      const existing = await this.repository.lookup(pending.commit.command.id);
      if (existing !== null) {
        if (existing !== pending.commit.command.fingerprint) throw new Error('ID_CONFLICT');
        this.record = await this.repository.load();
      } else {
        await this.repository.commit(pending.commit);
        this.record = pending.commit.record;
      }
      this.anchor = this.record.state === 'running' ? (retry ? this.now() : pending.anchor) : null;
      this.pending = null;
      this.failure = false;
      return true;
    } catch {
      this.failure = true;
      this.anchor = null;
      return false;
    }
  }
  private accrue(now: Anchor): TimerRecord {
    if (!this.anchor || !this.record.session) return this.record;
    const available = duration(this.record.phase, this.record.session.preset);
    const elapsed = Math.min(
      this.extra(now),
      available === null
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, available - activeMs(this.record.session)),
    );
    const session = { ...this.record.session, segments: [...this.record.session.segments] };
    if (elapsed > 0) session.segments.push({ startUtcMs: this.anchor.civil, durationMs: elapsed });
    return { ...this.record, session };
  }
  private ambiguous(now: Anchor) {
    return (
      this.anchor &&
      (now.monotonic < this.anchor.monotonic ||
        now.monotonic - this.anchor.monotonic > 60_000 ||
        Math.abs(now.civil - this.anchor.civil - (now.monotonic - this.anchor.monotonic)) > 2000)
    );
  }
  private async settle(now: Anchor): Promise<boolean> {
    if (this.record.state !== 'running' || this.failure) return false;
    if (this.ambiguous(now)) {
      await this.save(
        { ...this.record, state: 'recovering' },
        { id: this.makeId(), fingerprint: 'clock-ambiguity' },
        null,
      );
      return true;
    }
    const accrued = this.accrue(now);
    const limit = duration(accrued.phase, accrued.session?.preset);
    if (limit !== null && activeMs(accrued.session) >= limit) {
      const last = accrued.session!.segments.at(-1);
      await this.save(
        this.completed(accrued, now),
        { id: `complete:${accrued.session!.id}`, fingerprint: 'deadline' },
        null,
        {
          session: accrued.session!,
          outcome: 'completed',
          completedUtcMs: last ? last.startUtcMs + last.durationMs : now.civil,
        },
      );
      return true;
    }
    return false;
  }
  wake(generation = this.generation): Promise<void> {
    return this.queue(async () => {
      if (this.disposed || generation !== this.generation || this.failure) return;
      const now = this.now();
      if ((await this.rollDay(now)) || this.record.state !== 'running') {
        this.publish();
        this.schedule();
        return;
      }
      if (!(await this.settle(now)))
        await this.save(this.accrue(now), { id: this.makeId(), fingerprint: 'checkpoint' }, now);
      this.publish();
      this.schedule();
    });
  }
  command(input: unknown): Promise<TimerReply> {
    return this.queue(async () => {
      const parsed = timerCommandSchema.safeParse(input);
      if (!parsed.success || this.disposed) return { code: 'invalid', snapshot: this.read() };
      const command = parsed.data;
      let code: TimerReply['code'];
      try {
        code = await this.execute(command);
      } catch {
        this.failure = true;
        this.anchor = null;
        code = 'storage-error';
      }
      this.publish();
      this.schedule();
      return { code, snapshot: this.read() };
    });
  }
  private async execute(command: TimerCommand): Promise<TimerReply['code']> {
    if (command.action === 'retry') {
      if (!this.failure) return 'invalid';
      if (this.pending) return (await this.flush(true)) ? 'ok' : 'storage-error';
      await this.initialize();
      return this.failure ? 'storage-error' : 'ok';
    }
    if (this.failure) return 'storage-error';
    const fingerprint = JSON.stringify(command);
    const prior = await this.repository.lookup(command.commandId);
    if (prior !== null) return prior === fingerprint ? 'ok' : 'conflict';
    const now = this.now();
    if (await this.rollDay(now)) return this.failure ? 'storage-error' : 'conflict';
    // No prazo, a conclusão vence pausa/cancelamento, independentemente da ordem da fila.
    if (await this.settle(now)) return this.failure ? 'storage-error' : 'conflict';
    if (
      command.expectedRevision !== this.record.revision ||
      command.sessionId !== (this.record.session?.id ?? null)
    )
      return 'conflict';
    let next = this.accrue(now);
    // Keep the legacy session's date before cancel/discard removes its snapshot.
    if (!next.cycleDate && next.session) next = { ...next, cycleDate: this.cycleDay(next) };
    let anchor: Anchor | null = null;
    let result: TimerCommit['result'];
    const idle = next.state === 'idle' || next.state === 'awaiting-next';
    if (command.action !== 'configure' && command.configuration) return 'invalid';
    if (command.action !== 'set-single-focus' && command.singleFocus !== undefined)
      return 'invalid';
    if (
      command.action !== 'start' &&
      (command.preset || (command.phase && command.action !== 'select-phase'))
    )
      return 'invalid';
    switch (command.action) {
      case 'set-single-focus':
        if (next.state !== 'idle' || next.phase !== 'focus' || command.singleFocus === undefined)
          return 'invalid';
        next = {
          ...next,
          singleFocus: command.singleFocus,
          cycleDate: civilDate(now.civil, this.timezone),
        };
        break;
      case 'end-cycle':
        if (!canEndCycle(next)) return 'invalid';
        if (next.session && next.state !== 'awaiting-next')
          result = { session: next.session, outcome: 'interrupted', completedUtcMs: now.civil };
        next = closeCycle(next, civilDate(now.civil, this.timezone));
        break;
      case 'configure': {
        if (!command.configuration) return 'invalid';
        next = { ...next, configuration: command.configuration };
        anchor = next.state === 'running' ? now : null;
        break;
      }
      case 'start': {
        if (!idle) return 'invalid';
        const phase =
          command.phase ?? (next.state === 'awaiting-next' ? next.nextPhase : next.phase);
        const habitId = phase === 'focus' || phase === 'free' ? await this.selectedHabit() : null;
        const preset =
          command.preset ??
          ((phase === 'focus' || phase === 'free') && next.configuration
            ? configuredPreset(next.configuration)
            : (next.session?.preset ?? configuredPreset(next.configuration)));
        const previousEvery =
          next.cycleEvery ?? next.session?.preset.longEvery ?? defaultPreset.longEvery;
        next = {
          ...next,
          cycleDate: next.cycleDate ?? civilDate(now.civil, this.timezone),
          focusCompleted: false,
          singleFocus: false,
          ...(phase === 'focus'
            ? {
                cycleEvery: preset.longEvery,
                ...(preset.longEvery !== previousEvery ? { cycleBase: next.cycle } : {}),
              }
            : {}),
          state: 'running',
          phase,
          session: {
            id: this.makeId(),
            phase,
            preset,
            timezone: this.timezone,
            startedUtcMs: now.civil,
            segments: [],
            habitId,
            singleFocus: phase === 'focus' && (next.singleFocus ?? false),
          },
        };
        anchor = now;
        break;
      }
      case 'pause':
        if (next.state !== 'running') return 'invalid';
        next = { ...next, state: 'paused' };
        break;
      case 'resume':
        if (next.state !== 'paused') return 'invalid';
        next = { ...next, state: 'running' };
        anchor = now;
        break;
      case 'recover':
        if (next.state !== 'recovering') return 'invalid';
        next = { ...next, state: 'running' };
        anchor = now;
        break;
      case 'finish':
        if (next.phase !== 'free' || !next.session || !['running', 'paused'].includes(next.state))
          return 'invalid';
        result = { session: next.session, outcome: 'completed', completedUtcMs: now.civil };
        next = this.completed(next, now);
        break;
      case 'select-phase':
        if (!idle || !command.phase) return 'invalid';
        next = {
          ...next,
          state: 'idle',
          session: null,
          phase: command.phase,
          nextPhase: command.phase,
        };
        break;
      case 'discard':
        if (next.state !== 'recovering') return 'invalid'; // falls through
      case 'cancel':
        if (!next.session || !['running', 'paused', 'recovering'].includes(next.state))
          return 'invalid';
        result = { session: next.session, outcome: 'interrupted', completedUtcMs: now.civil };
        next = { ...next, state: 'idle', session: null, nextPhase: next.phase };
        break;
      default:
        return 'invalid';
    }
    if (
      next.state === 'idle' &&
      this.cycleDay(next) !== civilDate(now.civil, this.timezone) &&
      this.cycleDay(next)
    )
      next = closeCycle(next, civilDate(now.civil, this.timezone));
    return (await this.save(next, { id: command.commandId, fingerprint }, anchor, result))
      ? 'ok'
      : 'storage-error';
  }
  // Conservador: energia/saída não credita o intervalo desde o último checkpoint.
  suspend(): Promise<void> {
    return this.queue(async () => {
      if (!this.failure && this.record.state === 'running')
        await this.save(
          { ...this.record, state: 'recovering' },
          { id: this.makeId(), fingerprint: 'suspend-or-exit' },
          null,
        );
      this.publish();
      this.schedule();
    });
  }
  storageLost() {
    this.failure = true;
    this.anchor = null;
    clearTimeout(this.timeout);
    ++this.generation;
    this.publish();
  }
  /** Exclusão serial com comandos, scheduler e bandeja; somente sem sessão em curso. */
  restoreWhenIdle(work: () => Promise<void>): Promise<boolean> {
    return this.queue(async () => {
      if (this.disposed || this.failure || !['idle', 'awaiting-next'].includes(this.record.state))
        return false;
      await work();
      // Nenhum comando que já esperava na fila pode gravar estado anterior ao restore.
      this.dispose();
      return true;
    });
  }
  rescueWhenUnavailable(work: () => Promise<void>): Promise<boolean> {
    return this.queue(async () => {
      if (this.disposed || !this.failure) return false;
      await work();
      this.dispose();
      return true;
    });
  }
  pauseForExit(): Promise<void> {
    return this.queue(async () => {
      if (!this.failure && this.record.state === 'running') {
        const now = this.now();
        if (!(await this.settle(now)))
          await this.save(
            { ...this.accrue(now), state: 'paused' },
            { id: this.makeId(), fingerprint: 'pause-for-exit' },
            null,
          );
      }
      this.publish();
      this.schedule();
    });
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timeout);
    ++this.generation;
    this.listeners.clear();
  }
}
