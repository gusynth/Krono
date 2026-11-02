import { afterEach, expect, test, vi } from 'vitest';
import { refreshBatch } from '../../src/design/refreshBatch';
afterEach(() => vi.useRealTimers());
test('avisos simultâneos geram uma leitura e novos avisos continuam funcionando', () => {
  vi.useFakeTimers();
  const read = vi.fn(),
    batch = refreshBatch(read);
  batch.schedule();
  batch.schedule();
  batch.schedule();
  expect(read).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(read).toHaveBeenCalledTimes(1);
  batch.schedule();
  vi.runAllTimers();
  expect(read).toHaveBeenCalledTimes(2);
});
test('desmontar cancela leitura pendente e não deixa polling', () => {
  vi.useFakeTimers();
  const read = vi.fn(),
    batch = refreshBatch(read);
  batch.schedule();
  batch.cancel();
  vi.runAllTimers();
  expect(read).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
