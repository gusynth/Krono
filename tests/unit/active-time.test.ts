import { describe, it, expect } from 'vitest';
import { ActiveTime } from '../../shared/domain/active-time';

function fixture(target = 60_000) {
  let mono = 100;
  let civil = 1_000_000;
  return {
    timer: new ActiveTime({ monotonic: () => mono, civil: () => civil }, target),
    advance(ms: number) {
      mono += ms;
      civil += ms;
    },
    adjustCivil(ms: number) {
      civil += ms;
    },
  };
}
describe('Prova de duração ativa, sem contabilidade de produto', () => {
  it('recompõe o restante mesmo com despertar 30s atrasado', () => {
    const f = fixture();
    const generation = f.timer.start();
    f.advance(30_000);
    expect(f.timer.wake(generation)).toBe(false);
    expect(f.timer.snapshot().remainingMs).toBe(30_000);
    f.advance(40_000);
    expect(f.timer.wake(generation)).toBe(true);
    expect(f.timer.snapshot().elapsedMs).toBe(60_000);
  });
  it('não soma os intervalos de 50 pausas', () => {
    const f = fixture(120_000);
    f.timer.start();
    for (let i = 0; i < 50; i++) {
      f.advance(1000);
      f.timer.pause();
      f.advance(5000);
      f.timer.resume();
    }
    expect(f.timer.snapshot().elapsedMs).toBe(50_000);
  });
  it('conclui apenas uma vez e ignora callback de geração desconhecida', () => {
    const f = fixture();
    const generation = f.timer.start();
    f.advance(60_000);
    expect(f.timer.wake(generation - 1)).toBe(false);
    expect(f.timer.snapshot().state).toBe('running');
    expect(f.timer.wake(generation)).toBe(true);
    expect(f.timer.wake(generation)).toBe(false);
  });
  it('pausa ao detectar ajuste civil abrupto', () => {
    const f = fixture();
    const generation = f.timer.start();
    f.advance(1000);
    f.adjustCivil(3600_000);
    expect(f.timer.wake(generation)).toBe(false);
    expect(f.timer.snapshot().state).toBe('paused');
    expect(f.timer.snapshot().elapsedMs).toBe(1000);
  });
  it('não permite sessões simultâneas na prova', () => {
    const f = fixture();
    f.timer.start();
    expect(() => f.timer.start()).toThrow();
  });
  it.each([0, -1, NaN, Infinity, 1.5])('recusa duração %s', (value) => {
    expect(() => fixture(value)).toThrow();
  });
});
