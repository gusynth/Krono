import { it, expect } from 'vitest';
import { finishEstimate } from '../../shared/domain/finish-estimate';
it('previsão usa o restante sem alterar estado e preserva virada de dia', () => {
  const now = Date.parse('2026-11-02T23:50:00Z');
  expect(finishEstimate('running', 25 * 60_000, now)).toBe(Date.parse('2026-11-03T00:15:00Z'));
  for (const state of ['idle', 'paused', 'recovering', 'storage-error', 'awaiting-next'])
    expect(finishEstimate(state, 1000, now)).toBeNull();
});
it('retomar e ajustar hora civil só recalculam apresentação', () => {
  expect(finishEstimate('running', 60_000, 100_000)).toBe(160_000);
  expect(finishEstimate('running', 60_000, 200_000)).toBe(260_000);
  for (const remaining of [null, 0, -1, Infinity, NaN])
    expect(finishEstimate('running', remaining, 0)).toBeNull();
  expect(finishEstimate('running', 1000, Infinity)).toBeNull();
});
