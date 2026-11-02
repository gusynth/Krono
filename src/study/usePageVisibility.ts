import { useSyncExternalStore } from 'react';
function subscribe(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener('krono-visibility', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener('krono-visibility', onChange);
  };
}
export function usePageVisibility() {
  return useSyncExternalStore(
    subscribe,
    () =>
      document.visibilityState === 'visible' &&
      document.documentElement.dataset.windowVisible !== 'false',
    () => false,
  );
}
