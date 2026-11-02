import { useLayoutEffect, useRef } from 'react';

export function AmbientBackground({
  enabled,
  reduce,
  visible,
  className = 'ambient-background',
}: {
  enabled: boolean;
  reduce: boolean;
  visible: boolean;
  className?: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!enabled || reduce || !visible || matchMedia('(forced-colors: active)').matches) return;
    const layer = stage.current!;
    layer.style.willChange = 'opacity';
    const drift = layer.animate(
      [{ opacity: 0.7 }, { opacity: 1 }, { opacity: 0.76 }, { opacity: 0.95 }, { opacity: 0.7 }],
      { duration: 16_000, iterations: Infinity, easing: 'ease-in-out' },
    );
    drift.id = 'ambient-drift';
    const media = matchMedia('(forced-colors: active)');
    const stop = () => {
      drift.cancel();
      layer.style.willChange = 'auto';
    };
    media.addEventListener('change', stop);
    return () => {
      stop();
      media.removeEventListener('change', stop);
    };
  }, [enabled, reduce, visible]);
  return enabled ? (
    <div className={className} aria-hidden="true">
      <div ref={stage} className="ambient-stage-light" />
    </div>
  ) : null;
}
