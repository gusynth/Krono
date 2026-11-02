/** Estimativa civil de apresentação; nunca determina prazo ou crédito da sessão. */
export function finishEstimate(
  state: string,
  remainingMs: number | null,
  nowUtcMs: number,
): number | null {
  if (
    state !== 'running' ||
    remainingMs === null ||
    !Number.isFinite(remainingMs) ||
    remainingMs <= 0 ||
    !Number.isFinite(nowUtcMs)
  )
    return null;
  const end = nowUtcMs + remainingMs;
  return Number.isFinite(end) && end <= 8.64e15 ? end : null;
}
