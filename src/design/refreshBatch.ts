/** Agrupa avisos simultâneos; comandos explícitos continuam imediatos. */
export function refreshBatch(refresh: () => void) {
  let pending: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (pending !== undefined) return;
      pending = setTimeout(() => {
        pending = undefined;
        refresh();
      }, 0);
    },
    cancel() {
      clearTimeout(pending);
      pending = undefined;
    },
  };
}
