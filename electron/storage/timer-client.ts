import type { Worker } from 'node:worker_threads';
import { timerRecordSchema } from '../../shared/contracts/timer';
import type { TimerCommit, TimerRepository } from './timer-repository';

export function workerTimerRepository(worker: Worker): TimerRepository & {
  dispose: () => void;
  request: (type: string, value?: unknown) => Promise<unknown>;
} {
  let serial = 0;
  let ended = false;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  const fail = () => {
    ended = true;
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('STORAGE_UNAVAILABLE'));
    }
    pending.clear();
  };
  const receive = (message: { id?: number; ok?: boolean; value?: unknown }) => {
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(message.id);
    if (message.ok) request.resolve(message.value);
    else request.reject(new Error('STORAGE_WRITE_FAILED'));
  };
  worker.on('message', receive);
  worker.on('error', fail);
  worker.on('exit', fail);
  function request(type: string, value?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (ended) {
        reject(new Error('STORAGE_UNAVAILABLE'));
        return;
      }
      const id = ++serial;
      const timeout = setTimeout(
        () => {
          pending.delete(id);
          reject(new Error('STORAGE_TIMEOUT'));
        },
        type.startsWith('backup:') ? 120_000 : 5000,
      );
      pending.set(id, { resolve, reject, timeout });
      worker.postMessage({ id, type, value });
    });
  }
  return {
    request,
    load: async () => timerRecordSchema.parse(await request('timer:load')),
    lookup: async (id) => {
      const value = await request('timer:lookup', id);
      if (value !== null && typeof value !== 'string') throw new Error('INVALID_REPLY');
      return value;
    },
    commit: async (value: TimerCommit) => {
      await request('timer:commit', value);
    },
    dispose: () => {
      fail();
      worker.off('message', receive);
      worker.off('error', fail);
      worker.off('exit', fail);
    },
  };
}
