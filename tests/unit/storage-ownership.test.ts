import { it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
const instances = vi.hoisted(
  () =>
    [] as {
      emit: (name: string, value?: unknown) => boolean;
      terminate: ReturnType<typeof vi.fn>;
      finish: () => void;
      failStop: () => void;
    }[],
);
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    finish!: () => void;
    failStop!: () => void;
    terminate = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          this.finish = resolve;
          this.failStop = () => reject(new Error('synthetic cannot stop'));
        }),
    );
    constructor() {
      super();
      instances.push(this);
    }
  },
}));
import { openStorage } from '../../electron/storage/client';
import { runRescue } from '../../electron/storage/rescue-client';
afterEach(() => {
  instances.length = 0;
  vi.useRealTimers();
});
it('writer com falha só libera rejeição após confirmar término, mesmo recebendo saída duplicada', async () => {
  let settled = false;
  const opened = openStorage('worker', 'synthetic.sqlite').catch((error) => {
      settled = true;
      return (error as Error).message;
    }),
    worker = instances[0];
  worker.emit('message', { kind: 'error' });
  worker.emit('exit', 1);
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  worker.finish();
  expect(await opened).toBe('STORAGE_UNAVAILABLE');
});
it('timeout do writer também aguarda término; término recusado bloqueia resgate', async () => {
  vi.useFakeTimers();
  const opened = openStorage('worker', 'synthetic.sqlite').catch(
      (error) => (error as Error).message,
    ),
    worker = instances[0];
  vi.advanceTimersByTime(15000);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  worker.failStop();
  expect(await opened).toBe('STORAGE_STOP_FAILED');
});
it('resultado do worker de resgate só é entregue depois do término confirmado', async () => {
  let settled = false;
  const result = runRescue('worker', { action: 'resume', root: 'synthetic' }).then((value) => {
      settled = true;
      return value;
    }),
    worker = instances[0];
  worker.emit('message', { ok: true, value: { state: 'none' } });
  worker.emit('exit', 0);
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  worker.finish();
  expect(await result).toEqual({ state: 'none' });
});
it('worker de resgate sem término confirmado nunca informa sucesso', async () => {
  const result = runRescue('worker', { action: 'resume', root: 'synthetic' }).catch(
      (error) => (error as Error).message,
    ),
    worker = instances[0];
  worker.emit('message', { ok: true, value: { state: 'none' } });
  worker.failStop();
  expect(await result).toBe('RESCUE_STOP_FAILED');
});
it('timeout do resgate termina worker antes de permitir recuperação subsequente', async () => {
  vi.useFakeTimers();
  let settled = false;
  const result = runRescue('worker', { action: 'resume', root: 'synthetic' }).catch((error) => {
      settled = true;
      return (error as Error).message;
    }),
    worker = instances[0];
  vi.advanceTimersByTime(120000);
  await Promise.resolve();
  expect(settled).toBe(false);
  worker.finish();
  expect(await result).toBe('RESCUE_TIMEOUT');
});
